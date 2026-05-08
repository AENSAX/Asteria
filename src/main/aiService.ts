import { nativeImage, net } from 'electron';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as ort from 'onnxruntime-node';
import {
  addFileTags,
  getAiSettings,
  getFileDetail,
  getFileOriginalPath,
  listFileTags,
  replaceFileTags
} from './database.js';
import { IMAGE_EXTENSIONS } from '../shared/media.js';
import type {
  AiModelCatalog,
  AiModelInfo,
  AiSettings,
  AiTaggingFailure,
  AiTaggingSummary,
  TagDraft,
  WorkStatus
} from '../shared/ipc.js';

type ModelLayout = 'nhwc' | 'nchw';

export interface AiDownloadProgress {
  fileName: string;
  downloadedBytes: number;
  totalBytes: number;
  completedFiles: number;
  totalFiles: number;
}

export type AiDownloadProgressListener = (progress: AiDownloadProgress) => void;

interface LabelData {
  names: string[];
  rating: number[];
  general: number[];
  character: number[];
}

interface ModelBundle {
  session: ort.InferenceSession;
  labels: LabelData;
  inputName: string;
  outputName: string;
  width: number;
  height: number;
  layout: ModelLayout;
}

interface TagPrediction {
  category: 'general' | 'character' | 'rating';
  name: string;
  score: number;
  tag: TagDraft;
}

const DEFAULT_MODEL_FILE_NAME = 'wd-vit-tagger-v3.onnx';
const DEFAULT_LABEL_FILE_NAME = 'selected_tags.csv';
const DEFAULT_MODEL_URL =
  'https://huggingface.co/SmilingWolf/wd-vit-tagger-v3/resolve/main/model.onnx';
const DEFAULT_LABEL_URL =
  'https://huggingface.co/SmilingWolf/wd-vit-tagger-v3/resolve/main/selected_tags.csv';
const MODEL_EXTENSIONS = new Set(['onnx', 'safetensors', 'pt', 'pth', 'bin']);
const AI_INPUT_FALLBACK_SIZE = 448;
const cachedBundles = new Map<string, Promise<ModelBundle>>();
let currentTaggingStatus: WorkStatus = createIdleAiWorkStatus();
let taggingStatusListener: ((status: WorkStatus) => void) | null = null;

export function setAiTaggingStatusListener(listener: (status: WorkStatus) => void): void {
  taggingStatusListener = listener;
  emitAiTaggingStatus();
}

export function getAiTaggingWorkStatus(): WorkStatus {
  return currentTaggingStatus;
}

export async function detectAiModel(modelPath: string): Promise<AiModelInfo> {
  const catalog = await detectAiModels(modelPath);
  return catalog.selectedModel ?? createEmptyModelInfo(catalog.modelPath);
}

export async function detectAiModels(
  modelPath: string,
  selectedModelName = ''
): Promise<AiModelCatalog> {
  const normalizedPath = modelPath.trim();

  if (!normalizedPath) {
    return createModelCatalog('', [], selectedModelName);
  }

  try {
    const pathStat = await stat(normalizedPath);

    if (pathStat.isFile() && isModelFile(normalizedPath)) {
      return createModelCatalog(
        normalizedPath,
        [
          {
            modelName: basename(normalizedPath),
            modelPath: normalizedPath,
            modelFilePath: normalizedPath,
            sizeBytes: pathStat.size,
            exists: true
          }
        ],
        selectedModelName || basename(normalizedPath)
      );
    }

    if (!pathStat.isDirectory()) {
      return createModelCatalog(normalizedPath, [], selectedModelName);
    }

    const entries = await readdir(normalizedPath, { withFileTypes: true });
    const modelFileNames = entries
      .filter((entry) => entry.isFile() && isModelFile(entry.name))
      .map((entry) => entry.name)
      .sort(compareModelFileName);
    const models = await Promise.all(
      modelFileNames.map(async (modelFileName) => {
        const modelFilePath = join(normalizedPath, modelFileName);
        const modelFileStat = await stat(modelFilePath);

        return {
          modelName: modelFileName,
          modelPath: normalizedPath,
          modelFilePath,
          sizeBytes: modelFileStat.size,
          exists: true
        };
      })
    );

    return createModelCatalog(normalizedPath, models, selectedModelName);
  } catch {
    return createModelCatalog(normalizedPath, [], selectedModelName);
  }
}

export async function defaultAiModelExists(modelPath: string): Promise<boolean> {
  const normalizedPath = modelPath.trim();

  if (!normalizedPath) {
    return false;
  }

  try {
    const modelStat = await stat(getDefaultAiModelPath(normalizedPath));
    const labelStat = await stat(getDefaultAiLabelPath(normalizedPath));
    return modelStat.isFile() && labelStat.isFile();
  } catch {
    return false;
  }
}

export async function downloadDefaultAiModel(
  modelPath: string,
  onProgress?: AiDownloadProgressListener
): Promise<AiModelInfo> {
  const normalizedPath = modelPath.trim();

  if (!normalizedPath) {
    throw new Error('模型路径不能为空');
  }

  await mkdir(normalizedPath, { recursive: true });
  await downloadReplace(
    DEFAULT_MODEL_URL,
    getDefaultAiModelPath(normalizedPath),
    0,
    2,
    onProgress
  );
  await downloadReplace(
    DEFAULT_LABEL_URL,
    getDefaultAiLabelPath(normalizedPath),
    1,
    2,
    onProgress
  );
  return detectAiModel(normalizedPath);
}

export function getDefaultAiModelPath(modelPath: string): string {
  return join(resolve(modelPath.trim()), DEFAULT_MODEL_FILE_NAME);
}

export async function tagFilesWithAi(fileIds: number[], overwrite: boolean): Promise<AiTaggingSummary> {
  const normalizedFileIds = normalizeFileIds(fileIds);
  const settings = getAiSettings();
  const summary = createAiTaggingSummary(normalizedFileIds.length);
  beginAiTaggingStatus(normalizedFileIds.length);

  try {
    for (const fileId of normalizedFileIds) {
      const result = await tagOneFileWithAi(fileId, settings, overwrite);

      if (result === 'tagged') {
        summary.tagged += 1;
      } else if (result === 'skipped') {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
        summary.failures.push(result);
      }

      updateAiTaggingStatus(normalizedFileIds.length, summary.tagged + summary.skipped + summary.failed);
    }
  } finally {
    finishAiTaggingStatus();
  }

  return summary;
}

export async function tagUntaggedImagesWithAi(fileIds: number[]): Promise<AiTaggingSummary> {
  const normalizedFileIds = normalizeFileIds(fileIds);
  const settings = getAiSettings();

  if (!settings.autoTagUntaggedImagesOnImport) {
    return createAiTaggingSummary(0);
  }

  const summary = createAiTaggingSummary(normalizedFileIds.length);
  beginAiTaggingStatus(normalizedFileIds.length);

  try {
    for (const fileId of normalizedFileIds) {
      if (listFileTags(fileId).length > 0) {
        summary.skipped += 1;
        updateAiTaggingStatus(normalizedFileIds.length, summary.tagged + summary.skipped + summary.failed);
        continue;
      }

      const result = await tagOneFileWithAi(fileId, settings, false);

      if (result === 'tagged') {
        summary.tagged += 1;
      } else if (result === 'skipped') {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
        summary.failures.push(result);
      }

      updateAiTaggingStatus(normalizedFileIds.length, summary.tagged + summary.skipped + summary.failed);
    }
  } finally {
    finishAiTaggingStatus();
  }

  return summary;
}

async function tagOneFileWithAi(
  fileId: number,
  settings: AiSettings,
  overwrite: boolean
): Promise<'tagged' | 'skipped' | AiTaggingFailure> {
  try {
    const file = getFileDetail(fileId);
    const sourcePath = getFileOriginalPath(fileId);

    if (!file || !sourcePath) {
      return { fileId, message: '文件不存在' };
    }

    const extension = normalizeExtension(file.extension ?? sourcePath);

    if (!IMAGE_EXTENSIONS.has(extension) || extension === 'svg') {
      return 'skipped';
    }

    const tags = await predictTagsForImage(sourcePath, settings);

    if (tags.length === 0) {
      return 'skipped';
    }

    if (overwrite) {
      replaceFileTags(fileId, tags);
    } else {
      addFileTags(fileId, tags);
    }

    return 'tagged';
  } catch (error) {
    return {
      fileId,
      message: error instanceof Error ? error.message : '未知错误'
    };
  }
}

async function predictTagsForImage(imagePath: string, settings: AiSettings): Promise<TagDraft[]> {
  const bundle = await loadModelBundle(settings);
  const input = createInputTensor(imagePath, bundle);
  const outputs = await bundle.session.run({ [bundle.inputName]: input });
  const output = outputs[bundle.outputName];

  if (!output) {
    throw new Error('模型输出为空');
  }

  return extractPredictions(
    Array.from(output.data as Float32Array | number[]),
    bundle.labels,
    settings.generalThreshold,
    settings.characterThreshold
  ).map((prediction) => prediction.tag);
}

async function loadModelBundle(settings: AiSettings): Promise<ModelBundle> {
  const catalog = await detectAiModels(settings.modelPath, settings.modelName);
  const modelInfo = catalog.selectedModel;

  if (!modelInfo.exists || !modelInfo.modelFilePath) {
    throw new Error('未检测到模型文件');
  }

  if (normalizeExtension(modelInfo.modelFilePath) !== 'onnx') {
    throw new Error('当前仅支持 ONNX 模型文件');
  }

  const labelPath = getLabelPathForModel(modelInfo.modelFilePath);
  const cacheKey = `${modelInfo.modelFilePath}|${labelPath}`;
  const cached = cachedBundles.get(cacheKey);

  if (cached) {
    return cached;
  }

  const bundlePromise = createModelBundle(modelInfo.modelFilePath, labelPath);
  cachedBundles.set(cacheKey, bundlePromise);
  return bundlePromise;
}

async function createModelBundle(modelFilePath: string, labelPath: string): Promise<ModelBundle> {
  const labels = await loadLabels(labelPath);
  const session = await ort.InferenceSession.create(modelFilePath, {
    executionProviders: ['cpu']
  });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  if (!inputName || !outputName) {
    throw new Error('模型输入或输出节点无效');
  }

  const shape = readInputShape(session, inputName);

  return {
    session,
    labels,
    inputName,
    outputName,
    width: shape.width,
    height: shape.height,
    layout: shape.layout
  };
}

async function loadLabels(labelPath: string): Promise<LabelData> {
  let csvText = '';

  try {
    csvText = await readFile(labelPath, 'utf8');
  } catch {
    throw new Error(`缺少标签表: ${labelPath}`);
  }

  const rows = parseCsvRows(csvText);
  const header = rows[0] ?? [];
  const nameIndex = header.indexOf('name');
  const categoryIndex = header.indexOf('category');

  if (nameIndex < 0 || categoryIndex < 0) {
    throw new Error('标签表缺少 name 或 category 列');
  }

  const labels: LabelData = {
    names: [],
    rating: [],
    general: [],
    character: []
  };

  for (const row of rows.slice(1)) {
    const name = row[nameIndex]?.trim();
    const category = Number(row[categoryIndex]);

    if (!name || !Number.isInteger(category)) {
      continue;
    }

    const index = labels.names.length;
    labels.names.push(name);

    if (category === 9) {
      labels.rating.push(index);
    } else if (category === 0) {
      labels.general.push(index);
    } else if (category === 4) {
      labels.character.push(index);
    }
  }

  if (labels.names.length === 0) {
    throw new Error('标签表为空');
  }

  return labels;
}

function createInputTensor(imagePath: string, bundle: ModelBundle): ort.Tensor {
  const image = nativeImage.createFromPath(imagePath);

  if (image.isEmpty()) {
    throw new Error('图片解码失败');
  }

  const size = image.getSize();

  if (size.width <= 0 || size.height <= 0) {
    throw new Error('图片尺寸无效');
  }

  const scale = Math.min(bundle.width / size.width, bundle.height / size.height);
  const resizedWidth = Math.max(1, Math.round(size.width * scale));
  const resizedHeight = Math.max(1, Math.round(size.height * scale));
  const resized = image.resize({
    width: resizedWidth,
    height: resizedHeight,
    quality: 'best'
  });
  const bitmap = resized.toBitmap();
  const data = new Float32Array(bundle.width * bundle.height * 3);
  data.fill(255);

  const offsetX = Math.floor((bundle.width - resizedWidth) / 2);
  const offsetY = Math.floor((bundle.height - resizedHeight) / 2);

  for (let y = 0; y < resizedHeight; y += 1) {
    for (let x = 0; x < resizedWidth; x += 1) {
      const sourceIndex = (y * resizedWidth + x) * 4;
      const targetX = offsetX + x;
      const targetY = offsetY + y;
      const blue = bitmap[sourceIndex] ?? 255;
      const green = bitmap[sourceIndex + 1] ?? 255;
      const red = bitmap[sourceIndex + 2] ?? 255;
      const alpha = (bitmap[sourceIndex + 3] ?? 255) / 255;
      const pixel = [
        compositeOverWhite(blue, alpha),
        compositeOverWhite(green, alpha),
        compositeOverWhite(red, alpha)
      ];

      if (bundle.layout === 'nchw') {
        const planeSize = bundle.width * bundle.height;
        const baseIndex = targetY * bundle.width + targetX;
        data[baseIndex] = pixel[0] ?? 255;
        data[planeSize + baseIndex] = pixel[1] ?? 255;
        data[planeSize * 2 + baseIndex] = pixel[2] ?? 255;
      } else {
        const targetIndex = (targetY * bundle.width + targetX) * 3;
        data[targetIndex] = pixel[0] ?? 255;
        data[targetIndex + 1] = pixel[1] ?? 255;
        data[targetIndex + 2] = pixel[2] ?? 255;
      }
    }
  }

  const dimensions = bundle.layout === 'nchw'
    ? [1, 3, bundle.height, bundle.width]
    : [1, bundle.height, bundle.width, 3];

  return new ort.Tensor('float32', data, dimensions);
}

function extractPredictions(
  scores: number[],
  labels: LabelData,
  generalThreshold: number,
  characterThreshold: number
): TagPrediction[] {
  const predictions: TagPrediction[] = [];
  const rating = labels.rating
    .map((index) => ({ index, score: scores[index] ?? 0 }))
    .sort((left, right) => right.score - left.score)[0];

  for (const index of labels.general) {
    const score = scores[index] ?? 0;

    if (score > generalThreshold) {
      predictions.push(buildTagPrediction(labels.names[index] ?? '', score, 'general'));
    }
  }

  for (const index of labels.character) {
    const score = scores[index] ?? 0;

    if (score > characterThreshold) {
      predictions.push(buildTagPrediction(labels.names[index] ?? '', score, 'character'));
    }
  }

  predictions.sort((left, right) => right.score - left.score);

  if (rating) {
    predictions.push(buildTagPrediction(labels.names[rating.index] ?? '', rating.score, 'rating'));
  }

  return predictions.filter((prediction) => prediction.name);
}

function buildTagPrediction(
  rawName: string,
  score: number,
  category: TagPrediction['category']
): TagPrediction {
  const name = displayTagName(rawName);

  if (category === 'character') {
    return {
      category,
      name,
      score,
      tag: { namespace: 'character', name }
    };
  }

  if (category === 'rating') {
    return {
      category,
      name,
      score,
      tag: { namespace: 'rating', name }
    };
  }

  return {
    category,
    name,
    score,
    tag: { namespace: '', name }
  };
}

function readInputShape(
  session: ort.InferenceSession,
  inputName: string
): { width: number; height: number; layout: ModelLayout } {
  const metadata = session.inputMetadata?.[inputName];
  const dimensions = metadata?.dimensions ?? [];
  const second = typeof dimensions[1] === 'number' ? dimensions[1] : null;
  const third = typeof dimensions[2] === 'number' ? dimensions[2] : null;
  const fourth = typeof dimensions[3] === 'number' ? dimensions[3] : null;

  if (second === 3) {
    return {
      width: fourth && fourth > 0 ? fourth : AI_INPUT_FALLBACK_SIZE,
      height: third && third > 0 ? third : AI_INPUT_FALLBACK_SIZE,
      layout: 'nchw'
    };
  }

  return {
    width: third && third > 0 ? third : AI_INPUT_FALLBACK_SIZE,
    height: second && second > 0 ? second : AI_INPUT_FALLBACK_SIZE,
    layout: 'nhwc'
  };
}

function getLabelPathForModel(modelFilePath: string): string {
  return join(dirname(modelFilePath), DEFAULT_LABEL_FILE_NAME);
}

function getDefaultAiLabelPath(modelPath: string): string {
  return join(resolve(modelPath.trim()), DEFAULT_LABEL_FILE_NAME);
}

function createEmptyModelInfo(modelPath: string): AiModelInfo {
  return {
    modelName: '',
    modelPath,
    modelFilePath: null,
    sizeBytes: 0,
    exists: false
  };
}

function createModelCatalog(
  modelPath: string,
  models: AiModelInfo[],
  selectedModelName: string
): AiModelCatalog {
  const selectedModel =
    models.find((model) => model.modelName === selectedModelName) ??
    models[0] ??
    null;

  return {
    modelPath,
    models,
    selectedModelName: selectedModel?.modelName ?? null,
    selectedModel
  };
}

function createAiTaggingSummary(total: number): AiTaggingSummary {
  return {
    total,
    tagged: 0,
    skipped: 0,
    failed: 0,
    failures: []
  };
}

function beginAiTaggingStatus(total: number): void {
  if (total <= 0) {
    return;
  }

  updateAiTaggingStatus(total, 0);
}

function updateAiTaggingStatus(total: number, completed: number): void {
  currentTaggingStatus = {
    active: completed < total,
    message: completed < total ? '正在模型打标' : '模型打标完成',
    queued: Math.max(0, total - completed),
    processing: completed < total ? 1 : 0,
    completed
  };
  emitAiTaggingStatus();
}

function finishAiTaggingStatus(): void {
  currentTaggingStatus = createIdleAiWorkStatus();
  emitAiTaggingStatus();
}

function createIdleAiWorkStatus(): WorkStatus {
  return {
    active: false,
    message: '模型打标空闲',
    queued: 0,
    processing: 0,
    completed: 0
  };
}

function emitAiTaggingStatus(): void {
  taggingStatusListener?.(currentTaggingStatus);
}

function isModelFile(path: string): boolean {
  const extension = normalizeExtension(path);
  return MODEL_EXTENSIONS.has(extension);
}

function compareModelFileName(left: string, right: string): number {
  const leftPriority = left === DEFAULT_MODEL_FILE_NAME || left === 'model.onnx' ? 0 : 1;
  const rightPriority = right === DEFAULT_MODEL_FILE_NAME || right === 'model.onnx' ? 0 : 1;

  return leftPriority - rightPriority || left.localeCompare(right);
}

function normalizeExtension(value: string): string {
  const extension = value.includes('.') ? extname(value) : value;
  return extension.replace(/^\./, '').toLowerCase();
}

function normalizeFileIds(fileIds: number[]): number[] {
  const seen = new Set<number>();
  const normalizedFileIds: number[] = [];

  for (const fileId of fileIds) {
    if (!Number.isInteger(fileId) || fileId <= 0 || seen.has(fileId)) {
      continue;
    }

    seen.add(fileId);
    normalizedFileIds.push(fileId);
  }

  return normalizedFileIds;
}

function displayTagName(rawName: string): string {
  return rawName.trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
}

function compositeOverWhite(value: number, alpha: number): number {
  return Math.round(value * alpha + 255 * (1 - alpha));
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((item) => item.some((cellValue) => cellValue.trim()));
}

async function downloadReplace(
  url: string,
  targetPath: string,
  completedFiles: number,
  totalFiles: number,
  onProgress?: AiDownloadProgressListener
): Promise<void> {
  const temporaryPath = `${targetPath}.download`;

  try {
    await downloadFile(url, temporaryPath, 0, (downloadedBytes, totalBytes) => {
      onProgress?.({
        fileName: basename(targetPath),
        downloadedBytes,
        totalBytes,
        completedFiles,
        totalFiles
      });
    });
    await unlink(targetPath).catch(() => undefined);
    await rename(temporaryPath, targetPath);
    onProgress?.({
      fileName: basename(targetPath),
      downloadedBytes: 1,
      totalBytes: 1,
      completedFiles: completedFiles + 1,
      totalFiles
    });
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function downloadFile(
  url: string,
  targetPath: string,
  redirectCount = 0,
  onProgress?: (downloadedBytes: number, totalBytes: number) => void
): Promise<void> {
  if (redirectCount > 5) {
    return Promise.reject(new Error('默认模型下载重定向过多'));
  }

  return new Promise((resolveDownload, rejectDownload) => {
    const request = net.request(url);
    let settled = false;
    const timeout = windowlessTimeout(() => {
      rejectOnce(new Error('下载连接超时'));
      request.abort();
    }, 30000);

    function resolveOnce(): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolveDownload();
    }

    function rejectOnce(error: unknown): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      rejectDownload(error);
    }

    request.on('response', (response) => {
      const redirectUrl = readHeader(response.headers.location);

      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        redirectUrl
      ) {
        response.resume();
        const nextUrl = new URL(redirectUrl, url).toString();
        clearTimeout(timeout);
        downloadFile(nextUrl, targetPath, redirectCount + 1, onProgress).then(resolveOnce, rejectOnce);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        rejectOnce(new Error(`默认模型下载失败: HTTP ${response.statusCode ?? '-'}`));
        return;
      }

      clearTimeout(timeout);
      void writeResponseToFile(response, targetPath, onProgress).then(resolveOnce, rejectOnce);
    });

    request.on('error', rejectOnce);
    request.setHeader('User-Agent', 'Asteria');
    request.end();
  });
}

async function writeResponseToFile(
  response: NodeJS.ReadableStream & { headers: Record<string, string | string[]> },
  targetPath: string,
  onProgress?: (downloadedBytes: number, totalBytes: number) => void
): Promise<void> {
  const totalBytes = Number(readHeader(response.headers['content-length']) ?? 0);
  let downloadedBytes = 0;

  response.on('data', (chunk: Buffer) => {
    downloadedBytes += chunk.length;
    onProgress?.(downloadedBytes, totalBytes);
  });

  await pipeline(response, createWriteStream(targetPath));
}

function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function windowlessTimeout(callback: () => void, delay: number): NodeJS.Timeout {
  return setTimeout(callback, delay);
}
