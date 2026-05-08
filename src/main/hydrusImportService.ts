import { app, type WebContents } from 'electron';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import {
  createApiUploadedFileRecord,
  findStoredFileForApiUpload
} from './database.js';
import { hashFile } from './fileHash.js';
import { storeNewMediaFile } from './mediaStorage.js';
import type {
  HydrusConnectionStatus,
  HydrusImportOptions,
  HydrusImportProgress,
  TagDraft
} from '../shared/ipc.js';

const DEFAULT_METADATA_BATCH_SIZE = 100;
const HYDRUS_REQUEST_TIMEOUT_MS = 10_000;
let hydrusImportCanceled = false;

interface HydrusFileMetadata {
  file_id?: number;
  hash?: string;
  mime?: string;
  ext?: string;
  known_urls?: string[];
  detailed_known_urls?: unknown[];
  tags?: unknown;
}

interface HydrusImportCounters {
  processed: number;
  imported: number;
  duplicated: number;
  skipped: number;
  failed: number;
}

interface HydrusFileImportResult {
  status: 'imported' | 'duplicated' | 'skipped' | 'failed';
  message: string;
}

export async function testHydrusConnection(options: HydrusImportOptions): Promise<HydrusConnectionStatus> {
  const debug: string[] = [];

  try {
    const baseUrl = normalizeHydrusBaseUrl(options.baseUrl);
    debug.push(`baseUrl=${baseUrl}`);
    debug.push(`accessKeyLength=${options.accessKey.trim().length}`);
    debug.push('request=GET /verify_access_key');
    const response = await hydrusFetch(baseUrl, '/verify_access_key', options.accessKey);
    debug.push(`responseStatus=${response.status}`);
    const body = await readHydrusJson(response);
    debug.push(`responseKeys=${Object.keys(body).join(',') || '-'}`);

    return {
      ok: true,
      message: '连接可用',
      hydrusVersion: readNumber(body, 'hydrus_version'),
      apiVersion: readNumber(body, 'version'),
      permissions: readPermissions(body),
      debug
    };
  } catch (error) {
    debug.push(`error=${error instanceof Error ? error.message : 'unknown'}`);

    return {
      ok: false,
      message: error instanceof Error ? error.message : '连接失败',
      hydrusVersion: null,
      apiVersion: null,
      permissions: '',
      debug
    };
  }
}

export async function importFromHydrus(
  sender: WebContents,
  options: HydrusImportOptions
): Promise<HydrusImportProgress> {
  hydrusImportCanceled = false;
  const normalizedOptions = normalizeHydrusImportOptions(options);
  const baseUrl = normalizeHydrusBaseUrl(normalizedOptions.baseUrl);
  const counters: HydrusImportCounters = {
    processed: 0,
    imported: 0,
    duplicated: 0,
    skipped: 0,
    failed: 0
  };

  try {
    emitHydrusProgress(sender, createHydrusProgress({ phase: 'testing', message: '测试 Hydrus 连接' }));
    const status = await testHydrusConnection(normalizedOptions);

    if (!status.ok) {
      throw new Error(status.message);
    }

    assertHydrusNotCanceled();
    emitHydrusProgress(sender, createHydrusProgress({ phase: 'searching', message: '搜索 Hydrus 文件' }));

    const fileIds = await searchHydrusFileIds(baseUrl, normalizedOptions);
    const limitedFileIds =
      normalizedOptions.limit > 0 ? fileIds.slice(0, normalizedOptions.limit) : fileIds;

    if (limitedFileIds.length === 0) {
      const completed = createHydrusProgress({
        phase: 'completed',
        message: '没有匹配的 Hydrus 文件',
        total: 0,
        ...counters
      });
      emitHydrusProgress(sender, completed);
      return completed;
    }

    emitHydrusProgress(
      sender,
      createHydrusProgress({
        phase: 'metadata',
        message: `搜索到 ${limitedFileIds.length} 个 Hydrus 文件，读取元数据`,
        total: limitedFileIds.length
      })
    );

    const metadata = await readHydrusMetadata(baseUrl, normalizedOptions, limitedFileIds);
    const metadataByFileId = new Map(
      metadata
        .filter((file): file is HydrusFileMetadata & { file_id: number } => typeof file.file_id === 'number')
        .map((file) => [file.file_id, file])
    );

    for (const fileId of limitedFileIds) {
      assertHydrusNotCanceled();
      const file = metadataByFileId.get(fileId);

      emitHydrusProgress(
        sender,
        createHydrusProgress({
          phase: 'importing',
          message: '迁移 Hydrus 文件',
          total: limitedFileIds.length,
          currentFile: String(fileId),
          ...counters
        })
      );

      try {
        if (!file) {
          counters.failed += 1;
          counters.processed += 1;
          emitHydrusProgress(
            sender,
            createHydrusProgress({
              phase: 'importing',
              message: `文件 ${fileId} 缺少元数据`,
              total: limitedFileIds.length,
              currentFile: String(fileId),
              ...counters
            })
          );
          continue;
        }

        const result = await importHydrusFile(baseUrl, normalizedOptions, fileId, file);

        if (result.status === 'imported') {
          counters.imported += 1;
        } else if (result.status === 'duplicated') {
          counters.duplicated += 1;
        } else if (result.status === 'skipped') {
          counters.skipped += 1;
        } else {
          counters.failed += 1;
          emitHydrusProgress(
            sender,
            createHydrusProgress({
              phase: 'importing',
              message: `文件 ${fileId} 导入失败：${result.message}`,
              total: limitedFileIds.length,
              currentFile: String(fileId),
              ...counters
            })
          );
        }
      } catch (error) {
        counters.failed += 1;
        emitHydrusProgress(
          sender,
          createHydrusProgress({
            phase: 'importing',
            message: `文件 ${fileId} 导入异常：${error instanceof Error ? error.message : '未知错误'}`,
            total: limitedFileIds.length,
            currentFile: String(fileId),
            ...counters
          })
        );
      }

      counters.processed += 1;
    }

    const completed = createHydrusProgress({
      phase: 'completed',
      total: limitedFileIds.length,
      currentFile: null,
      message: 'Hydrus 导入完成',
      ...counters
    });
    emitHydrusProgress(sender, completed);
    return completed;
  } catch (error) {
    const failed = createHydrusProgress({
      phase: hydrusImportCanceled ? 'canceled' : 'failed',
      message: hydrusImportCanceled
        ? '已取消 Hydrus 导入'
        : error instanceof Error
          ? error.message
          : 'Hydrus 导入失败',
      ...counters
    });
    emitHydrusProgress(sender, failed);
    return failed;
  }
}

export function cancelHydrusImport(): void {
  hydrusImportCanceled = true;
}

async function searchHydrusFileIds(baseUrl: string, options: HydrusImportOptions): Promise<number[]> {
  const url = new URL('/get_files/search_files', baseUrl);
  const searchTags = createHydrusSearchTags(options);
  url.searchParams.set('tags', JSON.stringify(searchTags));

  const body = await readHydrusJson(await hydrusFetchUrl(url, options.accessKey));
  const fileIds = Array.isArray(body.file_ids) ? body.file_ids : [];

  return fileIds.filter((id): id is number => Number.isInteger(id) && id > 0);
}

function createHydrusSearchTags(options: HydrusImportOptions): string[] {
  const tags = options.searchTags.length > 0 ? [...options.searchTags] : ['system:everything'];

  if (options.limit > 0 && !tags.some((tag) => tag.toLowerCase().startsWith('system:limit'))) {
    tags.push(`system:limit=${options.limit}`);
  }

  return tags;
}

async function readHydrusMetadata(
  baseUrl: string,
  options: HydrusImportOptions,
  fileIds: number[]
): Promise<HydrusFileMetadata[]> {
  const files: HydrusFileMetadata[] = [];
  const batchSize = Math.max(1, options.metadataBatchSize || DEFAULT_METADATA_BATCH_SIZE);

  for (let offset = 0; offset < fileIds.length; offset += batchSize) {
    assertHydrusNotCanceled();
    const batch = fileIds.slice(offset, offset + batchSize);
    const url = new URL('/get_files/file_metadata', baseUrl);
    url.searchParams.set('file_ids', JSON.stringify(batch));
    url.searchParams.set('only_return_basic_information', 'false');
    url.searchParams.set('detailed_url_information', 'true');

    const body = await readHydrusJson(await hydrusFetchUrl(url, options.accessKey));
    const metadata = Array.isArray(body.metadata) ? body.metadata : [];
    files.push(...metadata.filter(isHydrusFileMetadata));
  }

  return files;
}

async function importHydrusFile(
  baseUrl: string,
  options: HydrusImportOptions,
  fileId: number,
  metadata: HydrusFileMetadata
): Promise<HydrusFileImportResult> {
  let tempPath: string;

  try {
    tempPath = await downloadHydrusFile(baseUrl, options.accessKey, fileId, metadata);
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : '下载失败'
    };
  }

  try {
    const fileStat = await stat(tempPath);
    const sha256 = await hashFile(tempPath);
    const existing = findStoredFileForApiUpload(sha256);

    if (existing && !options.forceDuplicate) {
      return {
        status: 'skipped',
        message: '重复文件，未启用重复对象'
      };
    }

    const extension = normalizeHydrusExtension(metadata, tempPath);
    const storedFile = existing
      ? {
          storagePath: existing.storagePath,
          fileName: existing.fileName,
          extension: existing.extension,
          sizeBytes: fileStat.size
        }
      : await storeNewMediaFile({
          sourcePath: tempPath,
          sha256,
          extension,
          sizeBytes: fileStat.size
        });

    createApiUploadedFileRecord({
      sha256,
      originalPath: `hydrus:${metadata.hash ?? fileId}`,
      storagePath: storedFile.storagePath,
      fileName: storedFile.fileName,
      extension: storedFile.extension,
      sizeBytes: storedFile.sizeBytes,
      tags: extractHydrusTags(metadata.tags),
      tagStyleName: options.tagStyleName,
      urls: extractHydrusUrls(metadata)
    });

    return {
      status: existing ? 'duplicated' : 'imported',
      message: existing ? '创建重复对象' : '已导入'
    };
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : '写入失败'
    };
  } finally {
    await rm(tempPath, { force: true });
  }
}

async function downloadHydrusFile(
  baseUrl: string,
  accessKey: string,
  fileId: number,
  metadata: HydrusFileMetadata
): Promise<string> {
  const url = new URL('/get_files/file', baseUrl);
  url.searchParams.set('file_id', String(fileId));

  const response = await hydrusFetchUrl(url, accessKey);

  if (!response.ok) {
    throw new Error(`下载 Hydrus 文件失败: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const directory = join(app.getPath('userData'), 'runtime', 'hydrus-import');
  await mkdir(directory, { recursive: true });

  const extension = normalizeHydrusExtension(metadata, 'hydrus-file.bin') ?? 'bin';
  const filePath = join(directory, `${metadata.hash ?? fileId}.${extension}`);
  await writeFile(filePath, buffer);
  return filePath;
}

function extractHydrusTags(value: unknown): TagDraft[] {
  const tags = new Set<string>();

  collectHydrusCurrentStrings(value, [], tags);

  if (tags.size === 0) {
    collectHydrusStrings(value, tags);
  }

  return Array.from(tags)
    .map(parseHydrusTag)
    .filter((tag): tag is TagDraft => tag !== null);
}

function collectHydrusCurrentStrings(value: unknown, path: string[], output: Set<string>): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    if (path[path.length - 1] === 'current') {
      for (const item of value) {
        if (typeof item === 'string') {
          output.add(item);
        }
      }
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    collectHydrusCurrentStrings(child, [...path, key], output);
  }
}

function collectHydrusStrings(value: unknown, output: Set<string>): void {
  if (typeof value === 'string') {
    output.add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectHydrusStrings(item, output);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      collectHydrusStrings(child, output);
    }
  }
}

function parseHydrusTag(value: string): TagDraft | null {
  const tag = value.trim();

  if (!tag) {
    return null;
  }

  const separatorIndex = tag.indexOf(':');

  if (separatorIndex <= 0) {
    return { namespace: '', name: tag };
  }

  return {
    namespace: tag.slice(0, separatorIndex).trim(),
    name: tag.slice(separatorIndex + 1).trim()
  };
}

function extractHydrusUrls(metadata: HydrusFileMetadata): string[] {
  const urls = new Set<string>();

  for (const url of metadata.known_urls ?? []) {
    if (typeof url === 'string' && url.trim()) {
      urls.add(url.trim());
    }
  }

  collectUrlStrings(metadata.detailed_known_urls, urls);
  return Array.from(urls);
}

function collectUrlStrings(value: unknown, output: Set<string>): void {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    output.add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectUrlStrings(item, output);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      collectUrlStrings(child, output);
    }
  }
}

function normalizeHydrusImportOptions(options: HydrusImportOptions): HydrusImportOptions {
  return {
    baseUrl: options.baseUrl,
    accessKey: normalizeHydrusAccessKey(options.accessKey),
    searchTags: options.searchTags.map((tag) => tag.trim()).filter(Boolean),
    tagStyleName: options.tagStyleName.trim() || 'hydrus',
    limit: Number.isFinite(options.limit) ? Math.max(0, Math.floor(options.limit)) : 0,
    metadataBatchSize: Number.isFinite(options.metadataBatchSize)
      ? Math.max(1, Math.floor(options.metadataBatchSize))
      : DEFAULT_METADATA_BATCH_SIZE,
    forceDuplicate: Boolean(options.forceDuplicate)
  };
}

function normalizeHydrusAccessKey(value: string): string {
  const accessKey = value.trim();

  if (!/^[\x00-\x7F]*$/.test(accessKey)) {
    throw new Error('Hydrus Access Key 只能包含英文、数字等 ASCII 字符，请检查是否误填了标签、备注或中文内容。');
  }

  return accessKey;
}

function normalizeHydrusBaseUrl(value: string): string {
  const url = new URL(value.trim() || 'http://127.0.0.1:45869');
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function normalizeHydrusExtension(metadata: HydrusFileMetadata, fallbackPath: string): string | null {
  const extension = (metadata.ext ?? extname(fallbackPath)).replace(/^\./, '').toLowerCase();
  return extension || null;
}

function hydrusFetch(baseUrl: string, path: string, accessKey: string): Promise<Response> {
  return hydrusFetchUrl(new URL(path, baseUrl), accessKey);
}

async function hydrusFetchUrl(url: URL, accessKey: string): Promise<Response> {
  const normalizedAccessKey = normalizeHydrusAccessKey(accessKey);
  const response = await requestHydrusUrl(url, normalizedAccessKey);

  if (!response.ok) {
    throw new Error(`Hydrus API 请求失败: HTTP ${response.status} ${url.pathname}`);
  }

  return response;
}

function requestHydrusUrl(url: URL, accessKey: string): Promise<Response> {
  const request = url.protocol === 'https:' ? requestHttps : requestHttp;

  return new Promise((resolveRequest, rejectRequest) => {
    const headers: Record<string, string> = {};

    if (accessKey) {
      headers['Hydrus-Client-API-Access-Key'] = accessKey;
    }

    const clientRequest = request(
      url,
      {
        method: 'GET',
        headers,
        timeout: HYDRUS_REQUEST_TIMEOUT_MS
      },
      (incomingMessage) => {
        const chunks: Buffer[] = [];

        incomingMessage.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        incomingMessage.on('end', () => {
          resolveRequest(
            new Response(Buffer.concat(chunks), {
              status: incomingMessage.statusCode ?? 0
            })
          );
        });
      }
    );

    clientRequest.on('timeout', () => {
      clientRequest.destroy(new Error('Hydrus API 请求超时'));
    });

    clientRequest.on('error', (error) => {
      rejectRequest(error);
    });

    clientRequest.end();
  });
}

async function readHydrusJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json();
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

function readNumber(body: Record<string, unknown>, key: string): number | null {
  return typeof body[key] === 'number' ? body[key] : null;
}

function readPermissions(body: Record<string, unknown>): string {
  const permissions = body.basic_permissions;
  return Array.isArray(permissions) ? permissions.join(',') : '';
}

function isHydrusFileMetadata(value: unknown): value is HydrusFileMetadata {
  return Boolean(value && typeof value === 'object');
}

function assertHydrusNotCanceled(): void {
  if (hydrusImportCanceled) {
    throw new Error('已取消 Hydrus 导入');
  }
}

function createHydrusProgress(overrides: Partial<HydrusImportProgress>): HydrusImportProgress {
  return {
    phase: 'idle',
    total: 0,
    processed: 0,
    imported: 0,
    duplicated: 0,
    skipped: 0,
    failed: 0,
    currentFile: null,
    message: '',
    ...overrides
  };
}

function emitHydrusProgress(sender: WebContents, progress: HydrusImportProgress): void {
  sender.send('hydrus-import:progress', progress);
}
