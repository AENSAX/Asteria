import { nativeImage } from "electron";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  getFileOriginalPath,
  getFileThumbnailSource,
  getThumbnailStoragePath,
  listBrowserFiles,
} from "./database.js";
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "../shared/media.js";
import type { WorkStatus } from "../shared/ipc.js";

type ThumbnailPriority = "high" | "normal" | "low";
interface ThumbnailJob {
  fileId: number;
  cacheKey: string;
  sha256: string;
}

const THUMBNAIL_MAX_SIZE = 256;
const THUMBNAIL_CONCURRENCY = 2;
const priorityOrder: ThumbnailPriority[] = ["high", "normal", "low"];
const queues: Record<ThumbnailPriority, ThumbnailJob[]> = {
  high: [],
  normal: [],
  low: [],
};
const queuedKeys = new Set<string>();
const inFlightThumbnails = new Map<string, Promise<string | null>>();
const thumbnailPromises = new Map<string, Promise<string | null>>();
const thumbnailResolvers = new Map<
  string,
  {
    resolve: (path: string | null) => void;
  }
>();
const deletingThumbnailHashes = new Set<string>();

let activeWorkers = 0;
let completedCount = 0;
let statusListener: ((status: WorkStatus) => void) | null = null;

export function setThumbnailStatusListener(
  listener: (status: WorkStatus) => void,
): void {
  statusListener = listener;
  emitThumbnailStatus();
}

export function getThumbnailWorkStatus(): WorkStatus {
  return buildThumbnailStatus();
}

export function queueThumbnailPreload(
  fileIds: number[],
  priority: ThumbnailPriority,
): void {
  const normalizedFileIds = normalizeFileIds(fileIds);

  if (normalizedFileIds.length === 0) {
    return;
  }

  for (const fileId of normalizedFileIds) {
    const source = getFileThumbnailSource(fileId);

    if (!source) {
      continue;
    }

    const cacheKey = createThumbnailCacheKey(fileId, source.sha256);

    if (queuedKeys.has(cacheKey) || inFlightThumbnails.has(cacheKey)) {
      promoteQueuedThumbnail(cacheKey, priority);
      continue;
    }

    queues[priority].push({ fileId, cacheKey, sha256: source.sha256 });
    queuedKeys.add(cacheKey);
    ensureQueuedThumbnailPromise(cacheKey);
  }

  emitThumbnailStatus();
  void startThumbnailWorkers();
}

export function queueAllMissingThumbnails(priority: ThumbnailPriority): void {
  queueThumbnailPreload(
    listBrowserFiles()
      .filter((file) =>
        isThumbnailExtension(file.extension ?? file.originalPath),
      )
      .map((file) => file.id),
    priority,
  );
}

export async function ensureThumbnailForFile(
  fileId: number,
  expectedSha256?: string | null,
): Promise<string | null> {
  const source = getFileThumbnailSource(fileId);

  if (!source || (expectedSha256 && source.sha256 !== expectedSha256)) {
    return null;
  }

  const cacheKey = createThumbnailCacheKey(fileId, source.sha256);
  const currentJob = inFlightThumbnails.get(cacheKey);

  if (currentJob) {
    return currentJob;
  }

  queueThumbnailPreload([fileId], "high");

  return (
    thumbnailPromises.get(cacheKey) ??
    createThumbnailForFile(fileId, source.sha256)
  );
}

export function getThumbnailFallbackPath(
  fileId: number,
  expectedSha256?: string | null,
): string | null {
  const source = getFileThumbnailSource(fileId);

  if (!source || (expectedSha256 && source.sha256 !== expectedSha256)) {
    return null;
  }

  const extension = normalizeExtension(source.extension ?? source.sourcePath);
  return IMAGE_EXTENSIONS.has(extension) ? getFileOriginalPath(fileId) : null;
}

export async function deleteThumbnailForSha(sha256: string): Promise<void> {
  if (!sha256) {
    return;
  }

  deletingThumbnailHashes.add(sha256);

  try {
    await unlink(getThumbnailPath(sha256));
  } catch {
    // Missing cache files are fine; thumbnail cache is disposable.
  } finally {
    setTimeout(() => {
      deletingThumbnailHashes.delete(sha256);
    }, 0);
  }
}

async function startThumbnailWorkers(): Promise<void> {
  while (activeWorkers < THUMBNAIL_CONCURRENCY) {
    const job = shiftNextThumbnailJob();

    if (!job) {
      emitThumbnailStatus();
      return;
    }

    activeWorkers += 1;

    void runThumbnailJob(job).finally(() => {
      activeWorkers -= 1;
      completedCount += 1;
      emitThumbnailStatus();
      void startThumbnailWorkers();
    });
  }
}

async function runThumbnailJob(job: ThumbnailJob): Promise<void> {
  const thumbnailJob = createThumbnailForFile(job.fileId, job.sha256).finally(
    () => {
      inFlightThumbnails.delete(job.cacheKey);
    },
  );
  inFlightThumbnails.set(job.cacheKey, thumbnailJob);

  try {
    const thumbnailPath = await thumbnailJob;
    thumbnailResolvers.get(job.cacheKey)?.resolve(thumbnailPath);
  } catch {
    thumbnailResolvers.get(job.cacheKey)?.resolve(null);
  } finally {
    thumbnailPromises.delete(job.cacheKey);
    thumbnailResolvers.delete(job.cacheKey);
  }
}

async function createThumbnailForFile(
  fileId: number,
  expectedSha256?: string,
): Promise<string | null> {
  const source = getFileThumbnailSource(fileId);

  if (!source || (expectedSha256 && source.sha256 !== expectedSha256)) {
    return null;
  }

  const extension = normalizeExtension(source.extension ?? source.sourcePath);

  if (!isThumbnailExtension(extension)) {
    return null;
  }

  const thumbnailPath = getThumbnailPath(source.sha256);

  try {
    const existing = await stat(thumbnailPath);

    if (existing.isFile() && existing.size > 0) {
      return thumbnailPath;
    }
  } catch {
    // Cache miss; generate below.
  }

  let image: Electron.NativeImage;

  try {
    image = await nativeImage.createThumbnailFromPath(source.sourcePath, {
      width: THUMBNAIL_MAX_SIZE,
      height: THUMBNAIL_MAX_SIZE,
    });
  } catch {
    return null;
  }

  if (
    image.isEmpty() &&
    IMAGE_EXTENSIONS.has(extension) &&
    extension !== "svg"
  ) {
    image = nativeImage.createFromPath(source.sourcePath);
  }

  if (image.isEmpty()) {
    return null;
  }

  const size = image.getSize();

  if (size.width <= 0 || size.height <= 0) {
    return null;
  }

  const scale = Math.min(
    1,
    THUMBNAIL_MAX_SIZE / size.width,
    THUMBNAIL_MAX_SIZE / size.height,
  );
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  const thumbnail = image.resize({ width, height, quality: "good" });

  if (deletingThumbnailHashes.has(source.sha256)) {
    return null;
  }

  await mkdir(join(getThumbnailStoragePath(), source.sha256.slice(0, 2)), {
    recursive: true,
  });
  await writeFile(thumbnailPath, thumbnail.toPNG());
  return thumbnailPath;
}

function shiftNextThumbnailJob(): ThumbnailJob | null {
  for (const priority of priorityOrder) {
    const job = queues[priority].shift();

    if (job) {
      queuedKeys.delete(job.cacheKey);
      return job;
    }
  }

  return null;
}

function promoteQueuedThumbnail(
  cacheKey: string,
  priority: ThumbnailPriority,
): void {
  if (priority !== "high") {
    return;
  }

  for (const queuePriority of priorityOrder) {
    const index = queues[queuePriority].findIndex(
      (job) => job.cacheKey === cacheKey,
    );

    if (index >= 0) {
      const [job] = queues[queuePriority].splice(index, 1);

      if (job) {
        queues.high.unshift(job);
      }

      return;
    }
  }
}

function ensureQueuedThumbnailPromise(
  cacheKey: string,
): Promise<string | null> {
  const currentPromise = thumbnailPromises.get(cacheKey);

  if (currentPromise) {
    return currentPromise;
  }

  const promise = new Promise<string | null>((resolve) => {
    thumbnailResolvers.set(cacheKey, { resolve });
  });
  thumbnailPromises.set(cacheKey, promise);
  return promise;
}

function emitThumbnailStatus(): void {
  if (!statusListener) {
    return;
  }

  statusListener(buildThumbnailStatus());
}

function buildThumbnailStatus(): WorkStatus {
  const queued = queues.high.length + queues.normal.length + queues.low.length;
  const active = queued > 0 || activeWorkers > 0;

  return {
    active,
    message: active ? "正在生成缩略图" : "缓存就绪",
    queued,
    processing: activeWorkers,
    completed: completedCount,
  };
}

function getThumbnailPath(sha256: string): string {
  return join(getThumbnailStoragePath(), sha256.slice(0, 2), `${sha256}.png`);
}

function createThumbnailCacheKey(fileId: number, sha256: string): string {
  return `${fileId}:${sha256}`;
}

function normalizeExtension(value: string): string {
  const extension = value.includes(".") ? extname(value) : value;
  return extension.replace(/^\./, "").toLowerCase();
}

function isThumbnailExtension(value: string): boolean {
  const extension = normalizeExtension(value);
  return IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension);
}

function normalizeFileIds(fileIds: number[]): number[] {
  return Array.from(
    new Set(fileIds.filter((fileId) => Number.isInteger(fileId) && fileId > 0)),
  );
}
