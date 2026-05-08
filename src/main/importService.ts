import { app, dialog, type WebContents } from 'electron';
import { readdir, stat } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import {
  addFileUrl,
  createApiFileIdentifier,
  getDatabaseConnection
} from './database.js';
import { hashFile } from './fileHash.js';
import { storeNewMediaFile } from './mediaStorage.js';
import {
  cleanupDownloadedImportFile,
  downloadWebMedia,
  normalizeImportUrls
} from './webImport.js';
import { MEDIA_EXTENSIONS } from '../shared/media.js';
import type {
  FileDomain,
  ImportCommitResult,
  ImportDuplicateRecord,
  ImportProgress,
  ImportQueueFileRecord
} from '../shared/ipc.js';

const CHUNK_SIZE = 25;
const MEDIA_DIALOG_FILTERS = [
  {
    name: '媒体文件',
    extensions: Array.from(MEDIA_EXTENSIONS)
  }
];

type ImportCounters = Pick<ImportProgress, 'processed' | 'imported' | 'duplicated' | 'failed'>;

interface ImportFileResult {
  fileId: number | null;
  status: 'imported' | 'duplicated' | 'failed';
  errorMessage: string | null;
}

interface ImportQueueItem {
  id: number;
  filePath: string;
  fileName: string;
  extension: string | null;
  sizeBytes: number;
  sha256: string;
  sourceKind: 'local' | 'web';
  sourceUrl: string | null;
  duplicate: ImportDuplicateRecord | null;
  status: 'ready' | 'failed';
  errorMessage: string | null;
}

let importQueue: ImportQueueItem[] = [];
let queueIdCounter = 1;
let importQueueLoaded = false;
let activeImportCommit: {
  canceled: boolean;
  activeQueueId: number | null;
} | null = null;

export async function importFiles(sender: WebContents): Promise<ImportProgress> {
  sendProgress(sender, createProgress({ phase: 'selecting', message: '选择媒体文件' }));

  const selection = await dialog.showOpenDialog({
    title: '导入文件',
    properties: ['openFile', 'multiSelections'],
    filters: MEDIA_DIALOG_FILTERS
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return finishCanceled(sender);
  }

  return prepareSelectedPaths(sender, selection.filePaths);
}

export async function importFolder(sender: WebContents): Promise<ImportProgress> {
  sendProgress(sender, createProgress({ phase: 'selecting', message: '选择文件夹' }));

  const selection = await dialog.showOpenDialog({
    title: '导入文件夹',
    properties: ['openDirectory']
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return finishCanceled(sender);
  }

  return prepareSelectedPaths(sender, selection.filePaths);
}

export async function importPaths(sender: WebContents, value: unknown): Promise<ImportProgress> {
  if (!Array.isArray(value)) {
    return finishFailed(sender, '拖入路径无效');
  }

  const paths = value.filter((item): item is string => typeof item === 'string' && item.length > 0);

  if (paths.length === 0) {
    return finishCanceled(sender);
  }

  return prepareSelectedPaths(sender, paths);
}

export async function importUrls(sender: WebContents, value: unknown): Promise<ImportProgress> {
  if (!Array.isArray(value)) {
    return finishFailed(sender, '拖入链接无效');
  }

  const urls = normalizeImportUrls(value);

  if (urls.length === 0) {
    return finishCanceled(sender);
  }

  return prepareWebUrls(sender, urls);
}

export function listImportQueueFiles(): ImportQueueFileRecord[] {
  ensureImportQueueLoaded();
  return importQueue.map(toQueueRecord);
}

export function getImportQueueFilePath(queueId: number): string | null {
  ensureImportQueueLoaded();
  return importQueue.find((item) => item.id === queueId)?.filePath ?? null;
}

export async function commitImportQueue(
  sender: WebContents,
  queueIds: number[],
  confirmedDuplicateQueueIds: number[]
): Promise<ImportCommitResult> {
  ensureImportQueueLoaded();
  const idSet = new Set(normalizeQueueIds(queueIds));
  const confirmedDuplicateIdSet = new Set(normalizeQueueIds(confirmedDuplicateQueueIds));
  const items = importQueue.filter((item) => idSet.has(item.id) && item.status === 'ready');

  if (items.length === 0) {
    const empty = createProgress({ phase: 'completed', message: '没有可导入文件' });
    sendProgress(sender, empty);
    return { ...empty, remainingQueue: listImportQueueFiles(), committedFileIds: [] };
  }

  if (activeImportCommit) {
    const busy = createProgress({ phase: 'failed', message: '已有导入任务正在执行' });
    sendProgress(sender, busy);
    return { ...busy, remainingQueue: listImportQueueFiles(), committedFileIds: [] };
  }

  const db = getDatabaseConnection();
  const total = items.length;
  const chunkTotal = Math.ceil(total / CHUNK_SIZE);
  const batchResult = db
    .prepare(
      `INSERT INTO import_batches
        (source_kind, source_path, status, total_items, started_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
    .run('queue', null, 'running', total);

  const batchId = Number(batchResult.lastInsertRowid);
  const counters: ImportCounters = {
    processed: 0,
    imported: 0,
    duplicated: 0,
    failed: 0
  };
  const importedQueueIds: number[] = [];
  const committedFileIds: number[] = [];
  const selectedQueueIds = items.map((item) => item.id);

  activeImportCommit = {
    canceled: false,
    activeQueueId: null
  };

  try {
    for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
      const chunk = items.slice(offset, offset + CHUNK_SIZE);
      const chunkIndex = Math.floor(offset / CHUNK_SIZE) + 1;

      for (const item of chunk) {
        if (activeImportCommit.canceled) {
          break;
        }

        activeImportCommit.activeQueueId = item.id;
        sendProgress(
          sender,
          createProgress({
            phase: 'importing',
            batchId,
            total,
            chunkIndex,
            chunkTotal,
            currentFile: item.filePath,
            message: '正在导入',
            ...counters
          })
        );

        const result = await importOneQueuedFile(item, confirmedDuplicateIdSet.has(item.id));
        activeImportCommit.activeQueueId = null;
        counters.processed += 1;

        if (result.status === 'imported') {
          counters.imported += 1;
          importedQueueIds.push(item.id);
          if (result.fileId) {
            committedFileIds.push(result.fileId);
          }
        } else if (result.status === 'duplicated') {
          counters.duplicated += 1;
          importedQueueIds.push(item.id);
          if (result.fileId) {
            committedFileIds.push(result.fileId);
          }
        } else {
          counters.failed += 1;
        }

        recordImportItem(batchId, getQueueOriginalPath(item), result);
      }

      if (activeImportCommit.canceled) {
        break;
      }
    }

    const canceled = activeImportCommit.canceled;
    const finalStatus = canceled ? 'canceled' : counters.failed > 0 ? 'completed_with_errors' : 'completed';
    db.prepare(
      `UPDATE import_batches
       SET status = ?,
           imported_items = ?,
           failed_items = ?,
           finished_at = datetime('now')
       WHERE id = ?`
    ).run(finalStatus, counters.imported + counters.duplicated, counters.failed, batchId);

    removeQueueItems(canceled ? selectedQueueIds : importedQueueIds);
    saveImportQueue();

    const completed = createProgress({
      phase: canceled ? 'canceled' : 'completed',
      batchId,
      total,
      chunkIndex: chunkTotal,
      chunkTotal,
      currentFile: null,
      message: canceled ? '已取消导入，当前文件已完整收尾' : '导入完成',
      ...counters
    });
    sendProgress(sender, completed);

    return {
      ...completed,
      remainingQueue: listImportQueueFiles(),
      committedFileIds
    };
  } finally {
    activeImportCommit = null;
  }
}

export function removeImportQueueFiles(queueIds: number[]): ImportProgress {
  ensureImportQueueLoaded();
  const removedCount = removeQueueItems(normalizeQueueIds(queueIds));
  saveImportQueue();

  return createProgress({
    phase: importQueue.length > 0 ? 'ready' : 'idle',
    total: importQueue.length,
    message: removedCount > 0 ? `已删除 ${removedCount} 个待导入文件` : '没有删除文件'
  });
}

export function clearImportQueue(): ImportProgress {
  ensureImportQueueLoaded();

  if (activeImportCommit) {
    activeImportCommit.canceled = true;
    const activeQueueId = activeImportCommit.activeQueueId;

    for (const item of importQueue) {
      if (item.id !== activeQueueId) {
        cleanupQueueItem(item);
      }
    }

    importQueue = activeQueueId
      ? importQueue.filter((item) => item.id === activeQueueId)
      : [];
    saveImportQueue();

    return createProgress({
      phase: 'canceled',
      total: importQueue.length,
      message: activeQueueId
        ? '正在取消导入，当前文件完成后停止'
        : '正在取消导入'
    });
  }

  for (const item of importQueue) {
    cleanupQueueItem(item);
  }
  importQueue = [];
  saveImportQueue();

  return createProgress({
    phase: 'canceled',
    message: '已取消导入'
  });
}

async function prepareSelectedPaths(sender: WebContents, selectedPaths: string[]): Promise<ImportProgress> {
  ensureImportQueueLoaded();
  sendProgress(sender, createProgress({ phase: 'preparing', message: '扫描媒体文件' }));

  const mediaFiles = await collectMediaFiles(selectedPaths);

  if (mediaFiles.length === 0) {
    const empty = createProgress({
      phase: 'completed',
      message: '未找到支持的媒体文件'
    });
    sendProgress(sender, empty);
    return empty;
  }

  const progressBase = createProgress({
    phase: 'preparing',
    total: mediaFiles.length,
    chunkTotal: Math.ceil(mediaFiles.length / CHUNK_SIZE),
    message: '分析文件'
  });
  const counters: ImportCounters = {
    processed: 0,
    imported: 0,
    duplicated: 0,
    failed: 0
  };

  for (let offset = 0; offset < mediaFiles.length; offset += CHUNK_SIZE) {
    const chunk = mediaFiles.slice(offset, offset + CHUNK_SIZE);
    const chunkIndex = Math.floor(offset / CHUNK_SIZE) + 1;

    for (const filePath of chunk) {
      sendProgress(sender, {
        ...progressBase,
        chunkIndex,
        currentFile: filePath,
        ...counters
      });

      const result = await analyzeOneFile(filePath);
      importQueue.push(result);
      saveImportQueue();
      counters.processed += 1;

      if (result.status === 'failed') {
        counters.failed += 1;
      } else if (result.duplicate) {
        counters.duplicated += 1;
      } else {
        counters.imported += 1;
      }
    }
  }

  const ready = createProgress({
    phase: 'ready',
    total: importQueue.length,
    processed: counters.processed,
    imported: counters.imported,
    duplicated: counters.duplicated,
    failed: counters.failed,
    chunkIndex: progressBase.chunkTotal,
    chunkTotal: progressBase.chunkTotal,
    currentFile: null,
    message: '等待导入'
  });
  sendProgress(sender, ready);
  saveImportQueue();

  return ready;
}

async function prepareWebUrls(sender: WebContents, urls: string[]): Promise<ImportProgress> {
  ensureImportQueueLoaded();
  sendProgress(sender, createProgress({ phase: 'preparing', message: '下载网页媒体' }));

  const progressBase = createProgress({
    phase: 'preparing',
    total: urls.length,
    chunkTotal: Math.ceil(urls.length / CHUNK_SIZE),
    message: '分析网页媒体'
  });
  const counters: ImportCounters = {
    processed: 0,
    imported: 0,
    duplicated: 0,
    failed: 0
  };

  for (let offset = 0; offset < urls.length; offset += CHUNK_SIZE) {
    const chunk = urls.slice(offset, offset + CHUNK_SIZE);
    const chunkIndex = Math.floor(offset / CHUNK_SIZE) + 1;

    for (const url of chunk) {
      sendProgress(sender, {
        ...progressBase,
        chunkIndex,
        currentFile: url,
        ...counters
      });

      const result = await analyzeOneWebUrl(url);
      importQueue.push(result);
      saveImportQueue();
      counters.processed += 1;

      if (result.status === 'failed') {
        counters.failed += 1;
      } else if (result.duplicate) {
        counters.duplicated += 1;
      } else {
        counters.imported += 1;
      }
    }
  }

  const ready = createProgress({
    phase: 'ready',
    total: importQueue.length,
    processed: counters.processed,
    imported: counters.imported,
    duplicated: counters.duplicated,
    failed: counters.failed,
    chunkIndex: progressBase.chunkTotal,
    chunkTotal: progressBase.chunkTotal,
    currentFile: null,
    message: '等待导入'
  });
  sendProgress(sender, ready);
  saveImportQueue();

  return ready;
}

async function collectMediaFiles(selectedPaths: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const path of selectedPaths) {
    await collectOnePath(path, files);
  }

  return files;
}

async function collectOnePath(path: string, files: string[]): Promise<void> {
  try {
    const pathStat = await stat(path);

    if (pathStat.isFile()) {
      if (isMediaFile(path)) {
        files.push(path);
      }
      return;
    }

    if (pathStat.isDirectory()) {
      const entries = await readdir(path, { withFileTypes: true });

      for (const entry of entries) {
        await collectOnePath(join(path, entry.name), files);
      }
    }
  } catch {
    return;
  }
}

async function analyzeOneFile(filePath: string): Promise<ImportQueueItem> {
  return analyzePreparedFile(nextQueueId(), filePath, 'local', null);
}

async function analyzeOneWebUrl(url: string): Promise<ImportQueueItem> {
  const id = nextQueueId();

  try {
    const filePath = await downloadWebMedia(url, id);
    return analyzePreparedFile(id, filePath, 'web', url);
  } catch (error) {
    return createFailedQueueItem(id, url, error instanceof Error ? error.message : '未知错误', 'web', url);
  }
}

async function analyzePreparedFile(
  id: number,
  filePath: string,
  sourceKind: ImportQueueItem['sourceKind'],
  sourceUrl: string | null
): Promise<ImportQueueItem> {
  try {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      return createFailedQueueItem(id, filePath, '不是文件', sourceKind, sourceUrl);
    }

    const sha256 = await hashFile(filePath);

    return {
      id,
      filePath,
      fileName: basename(filePath),
      extension: normalizeExtension(filePath),
      sizeBytes: fileStat.size,
      sha256,
      sourceKind,
      sourceUrl,
      duplicate: findDuplicateFile(sha256),
      status: 'ready',
      errorMessage: null
    };
  } catch (error) {
    return createFailedQueueItem(
      id,
      sourceUrl ?? filePath,
      error instanceof Error ? error.message : '未知错误',
      sourceKind,
      sourceUrl
    );
  }
}

function createFailedQueueItem(
  id: number,
  filePath: string,
  errorMessage: string,
  sourceKind: ImportQueueItem['sourceKind'] = 'local',
  sourceUrl: string | null = null
): ImportQueueItem {
  return {
    id,
    filePath,
    fileName: basename(filePath),
    extension: normalizeExtension(filePath),
    sizeBytes: 0,
    sha256: '',
    sourceKind,
    sourceUrl,
    duplicate: null,
    status: 'failed',
    errorMessage
  };
}

async function importOneQueuedFile(item: ImportQueueItem, duplicateConfirmed: boolean): Promise<ImportFileResult> {
  try {
    const existing = findExistingStoredFile(item.sha256);

    if (existing) {
      if (item.duplicate && !duplicateConfirmed) {
        return {
          fileId: null,
          status: 'failed',
          errorMessage: '重复文件未确认'
        };
      }

      const fileId = insertFileRecord({
        sha256: item.sha256,
        originalPath: getQueueOriginalPath(item),
        storagePath: existing.storagePath,
        fileName: existing.fileName,
        extension: existing.extension,
        sizeBytes: item.sizeBytes
      });
      attachQueuedFileMetadata(fileId, item);

      return {
        fileId,
        status: 'duplicated',
        errorMessage: null
      };
    }

    const storedFile = await storeNewMediaFile({
      sourcePath: item.filePath,
      sha256: item.sha256,
      extension: item.extension,
      sizeBytes: item.sizeBytes
    });

    const fileId = insertFileRecord({
      sha256: item.sha256,
      originalPath: getQueueOriginalPath(item),
      storagePath: storedFile.storagePath,
      fileName: storedFile.fileName,
      extension: storedFile.extension,
      sizeBytes: storedFile.sizeBytes
    });
    attachQueuedFileMetadata(fileId, item);

    return {
      fileId,
      status: 'imported',
      errorMessage: null
    };
  } catch (error) {
    return {
      fileId: null,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : '未知错误'
    };
  }
}

function attachQueuedFileMetadata(fileId: number, item: ImportQueueItem): void {
  if (item.sourceUrl) {
    addFileUrl([fileId], item.sourceUrl);
  }
}

function insertFileRecord(file: {
  sha256: string;
  originalPath: string;
  storagePath: string | null;
  fileName: string;
  extension: string | null;
  sizeBytes: number;
}): number {
  const db = getDatabaseConnection();
  const result = db
    .prepare(
      `INSERT INTO files
        (api_identifier, sha256, original_path, storage_path, file_name, extension, mime_type, size_bytes, domain)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      createApiFileIdentifier(),
      file.sha256,
      file.originalPath,
      file.storagePath,
      file.fileName,
      file.extension,
      null,
      file.sizeBytes,
      'pending'
    );

  return Number(result.lastInsertRowid);
}

function recordImportItem(batchId: number, sourcePath: string, result: ImportFileResult): void {
  const db = getDatabaseConnection();

  db.prepare(
    `INSERT INTO import_items
      (batch_id, file_id, source_path, status, error_message, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(batchId, result.fileId, sourcePath, result.status, result.errorMessage);
}

function findDuplicateFile(sha256: string): ImportDuplicateRecord | null {
  const existing = findExistingStoredFile(sha256);

  if (!existing) {
    return null;
  }

  return {
    fileId: existing.id,
    domain: existing.domain,
    domainName: existing.domainName
  };
}

function findExistingStoredFile(sha256: string): {
  id: number;
  fileName: string;
  extension: string | null;
  storagePath: string | null;
  domain: FileDomain;
  domainName: string;
} | null {
  const db = getDatabaseConnection();
  const row = db
    .prepare(
      `SELECT
        id,
        file_name AS fileName,
        extension,
        storage_path AS storagePath,
        CASE
          WHEN deleted_at IS NOT NULL THEN 'trash'
          ELSE domain
        END AS domain,
        CASE
          WHEN deleted_at IS NOT NULL THEN '回收站'
          WHEN domain = 'library' THEN '已在库中'
          ELSE '待入库'
        END AS domainName
       FROM files
       WHERE sha256 = ?
       ORDER BY deleted_at IS NULL DESC, imported_at ASC, id ASC
       LIMIT 1`
    )
    .get(sha256) as
    | {
        id: number;
        fileName: string;
        extension: string | null;
        storagePath: string | null;
        domain: FileDomain;
        domainName: string;
      }
    | undefined;

  return row ?? null;
}

function finishCanceled(sender: WebContents): ImportProgress {
  const canceled = createProgress({ phase: 'canceled', message: '已取消导入' });
  sendProgress(sender, canceled);
  return canceled;
}

function finishFailed(sender: WebContents, message: string): ImportProgress {
  const failed = createProgress({ phase: 'failed', message });
  sendProgress(sender, failed);
  return failed;
}

function createProgress(overrides: Partial<ImportProgress>): ImportProgress {
  return {
    phase: 'idle',
    batchId: null,
    total: importQueue.length,
    processed: 0,
    imported: 0,
    duplicated: 0,
    failed: 0,
    chunkIndex: 0,
    chunkTotal: 0,
    currentFile: null,
    message: '',
    ...overrides
  };
}

function sendProgress(sender: WebContents, progress: ImportProgress): void {
  sender.send('import:progress', progress);
}

function removeQueueItems(ids: number[]): number {
  const idSet = new Set(ids);
  const before = importQueue.length;
  const removedItems = importQueue.filter((item) => idSet.has(item.id));
  importQueue = importQueue.filter((item) => !idSet.has(item.id));

  for (const item of removedItems) {
    cleanupQueueItem(item);
  }

  return before - importQueue.length;
}

function ensureImportQueueLoaded(): void {
  if (importQueueLoaded) {
    return;
  }

  importQueueLoaded = true;
  const path = getImportQueueFilePathOnDisk();

  if (!existsSync(path)) {
    importQueue = [];
    queueIdCounter = 1;
    return;
  }

  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ImportQueueItem>[];
    importQueue = Array.isArray(parsed)
      ? parsed
          .map(normalizeStoredQueueItem)
          .filter((item): item is ImportQueueItem => item !== null)
      : [];
    queueIdCounter = Math.max(0, ...importQueue.map((item) => item.id)) + 1;
  } catch {
    importQueue = [];
    queueIdCounter = 1;
  }
}

function saveImportQueue(): void {
  const path = getImportQueueFilePathOnDisk();
  mkdirSync(join(app.getPath('userData'), 'runtime'), { recursive: true });
  writeFileSync(path, JSON.stringify(importQueue, null, 2), 'utf8');
}

function getImportQueueFilePathOnDisk(): string {
  return join(app.getPath('userData'), 'runtime', 'import-queue.json');
}

function normalizeStoredQueueItem(value: Partial<ImportQueueItem> | null): ImportQueueItem | null {
  if (
    !value ||
    typeof value.id !== 'number' ||
    typeof value.filePath !== 'string' ||
    typeof value.fileName !== 'string' ||
    typeof value.sizeBytes !== 'number' ||
    typeof value.sha256 !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    filePath: value.filePath,
    fileName: value.fileName,
    extension: typeof value.extension === 'string' ? value.extension : null,
    sizeBytes: value.sizeBytes,
    sha256: value.sha256,
    sourceKind: value.sourceKind === 'web' ? 'web' : 'local',
    sourceUrl: typeof value.sourceUrl === 'string' ? value.sourceUrl : null,
    duplicate: value.duplicate ?? null,
    status: value.status === 'failed' ? 'failed' : 'ready',
    errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : null
  };
}

function normalizeQueueIds(ids: number[]): number[] {
  return Array.from(
    new Set(ids.filter((id) => Number.isInteger(id) && id > 0))
  );
}

function toQueueRecord(item: ImportQueueItem): ImportQueueFileRecord {
  return {
    id: item.id,
    fileName: item.fileName,
    extension: item.extension,
    sizeBytes: item.sizeBytes,
    originalPath: getQueueOriginalPath(item),
    sourceUrl: item.sourceUrl,
    sha256: item.sha256,
    mediaUrl: `asteria-media://import/${item.id}?v=${encodeURIComponent(item.sha256)}`,
    duplicate: item.duplicate,
    status: item.status,
    errorMessage: item.errorMessage
  };
}

function normalizeExtension(filePath: string): string | null {
  const extension = extname(filePath).toLowerCase();
  return extension.length > 0 ? extension.slice(1) : null;
}

function isMediaFile(filePath: string): boolean {
  const extension = normalizeExtension(filePath);
  return extension !== null && MEDIA_EXTENSIONS.has(extension);
}

function nextQueueId(): number {
  const id = queueIdCounter;
  queueIdCounter += 1;
  return id;
}

function getQueueOriginalPath(item: ImportQueueItem): string {
  return item.sourceUrl ?? item.filePath;
}

function cleanupQueueItem(item: ImportQueueItem): void {
  if (item.sourceKind !== 'web') {
    return;
  }

  cleanupDownloadedImportFile(item.filePath);
}
