import { copyFile, mkdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import {
  getConvertImportedImagesToPng,
  getFileStoragePath
} from './database.js';
import { IMAGE_EXTENSIONS } from '../shared/media.js';
import type { WorkStatus } from '../shared/ipc.js';

interface StoreMediaFileInput {
  sourcePath: string;
  sha256: string;
  extension: string | null;
  sizeBytes: number;
}

let imageConversionStatusListener: ((status: WorkStatus) => void) | null = null;
let imageConversionCompletedCount = 0;
let imageConversionStatus: WorkStatus = createIdleImageConversionWorkStatus();

export interface StoredMediaFile {
  storagePath: string;
  fileName: string;
  extension: string | null;
  sizeBytes: number;
}

export function setImageConversionStatusListener(listener: (status: WorkStatus) => void): void {
  imageConversionStatusListener = listener;
  emitImageConversionStatus();
}

export function getImageConversionWorkStatus(): WorkStatus {
  return imageConversionStatus;
}

export async function storeNewMediaFile(input: StoreMediaFileInput): Promise<StoredMediaFile> {
  const shouldConvert = shouldConvertImageToPng(input.extension);
  const extension = shouldConvert ? 'png' : input.extension;
  const fileName = buildStoredFileName(input.sha256, extension);
  const storageDirectory = getFileStoragePath();
  const storagePath = join(storageDirectory, fileName);

  await mkdir(storageDirectory, { recursive: true });

  if (shouldConvert) {
    beginImageConversion(input.sourcePath);
    try {
      await convertImageToPng(input.sourcePath, storagePath);
      finishImageConversion(true);
    } catch (error) {
      finishImageConversion(false);
      throw error;
    }

    const convertedStat = await stat(storagePath);

    return {
      storagePath,
      fileName,
      extension,
      sizeBytes: convertedStat.size
    };
  }

  if (resolve(input.sourcePath) !== resolve(storagePath)) {
    await copyFile(input.sourcePath, storagePath);
  }

  return {
    storagePath,
    fileName,
    extension,
    sizeBytes: input.sizeBytes
  };
}

export function buildStoredFileName(sha256: string, extension: string | null): string {
  return extension ? `${sha256}.${extension}` : sha256;
}

function shouldConvertImageToPng(extension: string | null): boolean {
  const normalizedExtension = extension?.toLowerCase() ?? '';

  return (
    getConvertImportedImagesToPng() &&
    normalizedExtension !== 'png' &&
    normalizedExtension !== 'svg' &&
    IMAGE_EXTENSIONS.has(normalizedExtension)
  );
}

async function convertImageToPng(sourcePath: string, targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });

  try {
    await sharp(sourcePath).png().toFile(targetPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`图片转 PNG 失败: ${message}`);
  }
}

function beginImageConversion(sourcePath: string): void {
  imageConversionStatus = {
    active: true,
    message: `正在转换图片为 PNG: ${basename(sourcePath)}`,
    queued: 1,
    processing: 1,
    completed: imageConversionCompletedCount
  };
  emitImageConversionStatus();
}

function finishImageConversion(completed: boolean): void {
  if (completed) {
    imageConversionCompletedCount += 1;
  }

  imageConversionStatus = createIdleImageConversionWorkStatus();
  emitImageConversionStatus();
}

function emitImageConversionStatus(): void {
  imageConversionStatusListener?.(imageConversionStatus);
}

function createIdleImageConversionWorkStatus(): WorkStatus {
  return {
    active: false,
    message: '图片转换空闲',
    queued: 0,
    processing: 0,
    completed: imageConversionCompletedCount
  };
}
