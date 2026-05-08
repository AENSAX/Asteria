import { app } from 'electron';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
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
  await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    targetPath
  ], sourcePath);
}

function runFfmpeg(args: string[], sourcePath: string): Promise<void> {
  const ffmpegPath = getBundledFfmpegPath();

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(ffmpegPath, args, {
      windowsHide: true
    });
    const stderrChunks: Buffer[] = [];

    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on('error', (error) => {
      rejectRun(new Error(`ffmpeg 启动失败: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      rejectRun(new Error(`图片转 PNG 失败: ${basename(sourcePath)}${stderr ? `\n${stderr}` : ''}`));
    });
  });
}

function getBundledFfmpegPath(): string {
  const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const candidates = [
    join(process.resourcesPath, 'ffmpeg', executableName),
    join(app.getAppPath(), 'resources', 'ffmpeg', executableName),
    join(process.cwd(), 'resources', 'ffmpeg', executableName)
  ];
  const bundledPath = candidates.find((candidate) => existsSync(candidate));

  return bundledPath ?? 'ffmpeg';
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
