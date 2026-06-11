import { app } from "electron";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { IncomingMessage } from "node:http";
import sharp from "sharp";
import {
  createApiUploadedFileRecord,
  findStoredFileForApiUpload,
  getApiFileByIdentifier,
  getInternalFileIdByApiIdentifier,
  listApiFileIdentifiersBySha256,
} from "./database.js";
import { hashFile } from "./fileHash.js";
import { tagUntaggedImagesWithAi } from "./aiService.js";
import { storeNewMediaFile } from "./mediaStorage.js";
import { IMAGE_EXTENSIONS } from "../shared/media.js";
import type { ApiFileRecord, TagDraft } from "../shared/ipc.js";

export interface ApiUploadResult {
  statusCode: number;
  body: unknown;
}

interface UploadMetadata {
  tags: TagDraft[];
  tagStyleName: string | null;
  urls: string[];
  forceDuplicate: boolean;
}

interface UploadedPart {
  name: string;
  filename: string | null;
  data: Buffer;
}

interface BatchUploadFileState extends UploadMetadata {
  uploadFileId: string;
  clientFileId: string;
  fileName: string;
  chunkCount: number;
  sizeBytes: number | null;
  receivedChunks: number[];
}

interface BatchUploadState {
  batchId: string;
  createdAt: string;
  files: BatchUploadFileState[];
}

const UPLOAD_BATCH_ROOT = "api-upload-batches";
const UPLOAD_TEMP_ROOT = "api-upload-temp";
const MAX_REQUEST_BYTES = 256 * 1024 * 1024;

export async function handleSingleFileUpload(
  request: IncomingMessage,
): Promise<ApiUploadResult> {
  const contentType = normalizeHeader(request.headers["content-type"]);

  if (!contentType.includes("multipart/form-data")) {
    return {
      statusCode: 415,
      body: {
        error: "unsupported_media_type",
        message: "上传文件必须使用 multipart/form-data",
      },
    };
  }

  const body = await readRequestBody(request);
  const parts = parseMultipartBody(body, contentType);
  const filePart = parts.find((part) => part.name === "file" && part.filename);

  if (!filePart) {
    return {
      statusCode: 400,
      body: {
        error: "bad_request",
        message: "必须上传 file 文件对象",
      },
    };
  }

  const metadata = readMultipartMetadata(parts);
  const tempPath = await writeTempUploadFile(
    filePart.filename ?? "upload.bin",
    filePart.data,
  );

  try {
    const result = await commitUploadedFile(
      tempPath,
      filePart.filename ?? basename(tempPath),
      metadata,
    );
    return {
      statusCode: result.ok ? 200 : 409,
      body: result,
    };
  } finally {
    await rm(tempPath, { force: true });
  }
}

export async function handleFileDuplicateLookup(
  request: IncomingMessage,
): Promise<ApiUploadResult> {
  const contentType = normalizeHeader(request.headers["content-type"]);

  if (!contentType.includes("multipart/form-data")) {
    return {
      statusCode: 415,
      body: {
        error: "unsupported_media_type",
        message: "查重文件必须使用 multipart/form-data",
      },
    };
  }

  const body = await readRequestBody(request);
  const parts = parseMultipartBody(body, contentType);
  const filePart = parts.find((part) => part.name === "file" && part.filename);

  if (!filePart) {
    return {
      statusCode: 400,
      body: {
        error: "bad_request",
        message: "必须上传 file 文件对象",
      },
    };
  }

  const tempPath = await writeTempUploadFile(
    filePart.filename ?? "lookup.bin",
    filePart.data,
  );

  try {
    const sha256 = await hashFile(tempPath);
    const identifiers = listApiFileIdentifiersBySha256(sha256);

    return {
      statusCode: 200,
      body: {
        ok: true,
        sha256,
        duplicate: identifiers.length > 0,
        identifiers,
        total: identifiers.length,
      },
    };
  } finally {
    await rm(tempPath, { force: true });
  }
}

export async function handleBatchUploadRequest(
  request: IncomingMessage,
  pathParts: string[],
): Promise<ApiUploadResult> {
  if (
    request.method === "POST" &&
    pathParts.length === 4 &&
    pathParts[3] === "init"
  ) {
    return createBatchUpload(request);
  }

  if (
    request.method === "PUT" &&
    pathParts.length === 8 &&
    pathParts[4] === "files" &&
    pathParts[6] === "chunks"
  ) {
    const batchId = pathParts[3];
    const fileId = pathParts[5];
    const chunkIndex = pathParts[7];

    if (!batchId || !fileId || !chunkIndex) {
      return {
        statusCode: 404,
        body: {
          error: "not_found",
          message: "接口不存在",
        },
      };
    }

    return uploadBatchChunk(request, batchId, fileId, Number(chunkIndex));
  }

  if (
    request.method === "POST" &&
    pathParts.length === 5 &&
    pathParts[4] === "commit"
  ) {
    const batchId = pathParts[3];

    return batchId
      ? commitBatchUpload(batchId)
      : {
          statusCode: 404,
          body: {
            error: "not_found",
            message: "接口不存在",
          },
        };
  }

  if (
    request.method === "DELETE" &&
    pathParts.length === 5 &&
    pathParts[4] === "cancel"
  ) {
    const batchId = pathParts[3];

    return batchId
      ? cancelBatchUpload(batchId)
      : {
          statusCode: 404,
          body: {
            error: "not_found",
            message: "接口不存在",
          },
        };
  }

  return {
    statusCode: 404,
    body: {
      error: "not_found",
      message: "接口不存在",
    },
  };
}

async function createBatchUpload(
  request: IncomingMessage,
): Promise<ApiUploadResult> {
  const payload = (await readJsonBody(request)) as { files?: unknown[] };
  const files = Array.isArray(payload.files) ? payload.files : [];

  if (files.length === 0) {
    return {
      statusCode: 400,
      body: {
        error: "bad_request",
        message: "批量上传必须提供 files",
      },
    };
  }

  const batch: BatchUploadState = {
    batchId: randomUUID(),
    createdAt: new Date().toISOString(),
    files: files.map(normalizeBatchFile),
  };

  await saveBatchState(batch);

  return {
    statusCode: 200,
    body: {
      ok: true,
      batchId: batch.batchId,
      files: batch.files.map((file) => ({
        clientFileId: file.clientFileId,
        uploadFileId: file.uploadFileId,
        fileName: file.fileName,
        chunkCount: file.chunkCount,
      })),
    },
  };
}

async function uploadBatchChunk(
  request: IncomingMessage,
  batchId: string,
  uploadFileId: string,
  chunkIndex: number,
): Promise<ApiUploadResult> {
  const batch = await readBatchState(batchId);
  const file = batch?.files.find((item) => item.uploadFileId === uploadFileId);

  if (
    !batch ||
    !file ||
    !Number.isInteger(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= file.chunkCount
  ) {
    return {
      statusCode: 404,
      body: {
        error: "not_found",
        message: "上传批次或分片不存在",
      },
    };
  }

  const body = await readRequestBody(request);
  const chunkDirectory = getBatchFileChunkDirectory(batchId, uploadFileId);
  await mkdir(chunkDirectory, { recursive: true });
  await writeFile(join(chunkDirectory, `${chunkIndex}.part`), body);

  if (!file.receivedChunks.includes(chunkIndex)) {
    file.receivedChunks.push(chunkIndex);
    file.receivedChunks.sort((left, right) => left - right);
  }

  await saveBatchState(batch);

  return {
    statusCode: 200,
    body: {
      ok: true,
      batchId,
      uploadFileId,
      receivedChunks: file.receivedChunks.length,
      chunkCount: file.chunkCount,
    },
  };
}

async function commitBatchUpload(batchId: string): Promise<ApiUploadResult> {
  const batch = await readBatchState(batchId);

  if (!batch) {
    return {
      statusCode: 404,
      body: {
        error: "not_found",
        message: "上传批次不存在",
      },
    };
  }

  const results: unknown[] = [];

  for (const file of batch.files) {
    if (file.receivedChunks.length !== file.chunkCount) {
      results.push({
        clientFileId: file.clientFileId,
        uploadFileId: file.uploadFileId,
        ok: false,
        error: "missing_chunks",
        message: `缺少分片: ${file.receivedChunks.length}/${file.chunkCount}`,
      });
      continue;
    }

    const assembledPath = await assembleBatchFile(batch.batchId, file);
    const result = await commitUploadedFile(assembledPath, file.fileName, file);
    await rm(assembledPath, { force: true });

    results.push({
      clientFileId: file.clientFileId,
      uploadFileId: file.uploadFileId,
      ...result,
    });
  }

  await rm(getBatchDirectory(batch.batchId), { recursive: true, force: true });

  return {
    statusCode: 200,
    body: {
      ok: true,
      batchId,
      results,
    },
  };
}

async function cancelBatchUpload(batchId: string): Promise<ApiUploadResult> {
  await rm(getBatchDirectory(batchId), { recursive: true, force: true });

  return {
    statusCode: 200,
    body: {
      ok: true,
      batchId,
      canceled: true,
    },
  };
}

async function commitUploadedFile(
  tempPath: string,
  originalFileName: string,
  metadata: UploadMetadata,
): Promise<{
  ok: boolean;
  duplicate: boolean;
  file?: ApiFileRecord;
  error?: string;
  message?: string;
}> {
  const fileStat = await stat(tempPath);
  const sha256 = await hashFile(tempPath);
  const existing = findStoredFileForApiUpload(sha256);
  const extension = normalizeExtension(originalFileName);
  const dimensions = await readImageDimensions(tempPath, extension);

  if (existing && !metadata.forceDuplicate) {
    return {
      ok: false,
      duplicate: true,
      error: "duplicate_file",
      message: "文件已存在，未启用重复对象强制上传",
    };
  }

  const storedFile = existing
    ? {
        storagePath: existing.storagePath,
        fileName: existing.fileName,
        extension: existing.extension,
        sizeBytes: fileStat.size,
      }
    : await storeNewMediaFile({
        sourcePath: tempPath,
        sha256,
        extension,
        sizeBytes: fileStat.size,
      });

  const file = createApiUploadedFileRecord({
    sha256,
    originalPath: `api-upload:${originalFileName}`,
    storagePath: storedFile.storagePath,
    fileName: storedFile.fileName,
    extension: storedFile.extension,
    sizeBytes: storedFile.sizeBytes,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    tags: metadata.tags,
    tagStyleName: metadata.tagStyleName,
    urls: metadata.urls,
  });
  const fileId = getInternalFileIdByApiIdentifier(file.apiIdentifier);

  if (fileId && metadata.tags.length === 0) {
    await tagUntaggedImagesWithAi([fileId]);
  }

  return {
    ok: true,
    duplicate: Boolean(existing),
    file: getApiFileByIdentifier(file.apiIdentifier) ?? file,
  };
}

function normalizeBatchFile(value: unknown): BatchUploadFileState {
  const file = value as Record<string, unknown>;
  const fileName =
    typeof file.fileName === "string" && file.fileName.trim()
      ? file.fileName.trim()
      : "upload.bin";
  const chunkCount = Number(file.chunkCount);

  return {
    uploadFileId: randomUUID(),
    clientFileId:
      typeof file.clientFileId === "string" && file.clientFileId.trim()
        ? file.clientFileId.trim()
        : randomUUID(),
    fileName,
    chunkCount: Number.isInteger(chunkCount) && chunkCount > 0 ? chunkCount : 1,
    sizeBytes:
      typeof file.sizeBytes === "number" && Number.isFinite(file.sizeBytes)
        ? file.sizeBytes
        : null,
    tags: normalizeApiTags(file.tags),
    tagStyleName:
      typeof file.tagStyle === "string" && file.tagStyle.trim()
        ? file.tagStyle.trim()
        : null,
    urls: normalizeApiUrls(file.url ?? file.urls),
    forceDuplicate: file.forceDuplicate === true,
    receivedChunks: [],
  };
}

function readMultipartMetadata(parts: UploadedPart[]): UploadMetadata {
  function readText(name: string): string | null {
    const part = parts.find((item) => item.name === name && !item.filename);
    return part ? part.data.toString("utf8").trim() : null;
  }

  return {
    tags: normalizeApiTags(readJsonText(readText("tags"))),
    tagStyleName: readText("tagStyle"),
    urls: normalizeApiUrls(
      readJsonText(readText("url")) ??
        readJsonText(readText("urls")) ??
        readText("url"),
    ),
    forceDuplicate: readBoolean(readText("forceDuplicate")),
  };
}

export function normalizeApiTags(value: unknown): TagDraft[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string" && value
      ? [value]
      : [];
  const tags: TagDraft[] = [];

  for (const item of values) {
    if (typeof item === "string") {
      const [rawNamespace, ...nameParts] = item.includes(":")
        ? item.split(":")
        : ["", item];
      const namespace = rawNamespace ?? "";
      const name = nameParts.join(":").trim();

      if (name) {
        tags.push({ namespace: namespace.trim(), name });
      }
      continue;
    }

    if (item && typeof item === "object") {
      const tag = item as Partial<TagDraft>;
      const name = typeof tag.name === "string" ? tag.name.trim() : "";

      if (name) {
        tags.push({
          namespace:
            typeof tag.namespace === "string" ? tag.namespace.trim() : "",
          name,
        });
      }
    }
  }

  return tags;
}

export function normalizeApiUrls(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string" && value
      ? [value]
      : [];

  return values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function assembleBatchFile(
  batchId: string,
  file: BatchUploadFileState,
): Promise<string> {
  const assembledPath = join(
    getBatchDirectory(batchId),
    `${file.uploadFileId}.assembled`,
  );
  const chunks: Buffer[] = [];

  for (let index = 0; index < file.chunkCount; index += 1) {
    chunks.push(
      await readFile(
        join(
          getBatchFileChunkDirectory(batchId, file.uploadFileId),
          `${index}.part`,
        ),
      ),
    );
  }

  await writeFile(assembledPath, Buffer.concat(chunks));
  return assembledPath;
}

async function readBatchState(
  batchId: string,
): Promise<BatchUploadState | null> {
  try {
    const raw = await readFile(getBatchStatePath(batchId), "utf8");
    return JSON.parse(raw) as BatchUploadState;
  } catch {
    return null;
  }
}

async function saveBatchState(batch: BatchUploadState): Promise<void> {
  await mkdir(getBatchDirectory(batch.batchId), { recursive: true });
  await writeFile(
    getBatchStatePath(batch.batchId),
    JSON.stringify(batch, null, 2),
    "utf8",
  );
}

function getBatchDirectory(batchId: string): string {
  return join(app.getPath("userData"), "runtime", UPLOAD_BATCH_ROOT, batchId);
}

function getBatchStatePath(batchId: string): string {
  return join(getBatchDirectory(batchId), "batch.json");
}

function getBatchFileChunkDirectory(
  batchId: string,
  uploadFileId: string,
): string {
  return join(getBatchDirectory(batchId), "chunks", uploadFileId);
}

async function writeTempUploadFile(
  fileName: string,
  data: Buffer,
): Promise<string> {
  const directory = join(app.getPath("userData"), "runtime", UPLOAD_TEMP_ROOT);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${randomUUID()}-${basename(fileName)}`);
  await writeFile(path, data);
  return path;
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const body = await readRequestBody(request);

  if (body.length === 0) {
    return {};
  }

  return JSON.parse(body.toString("utf8")) as unknown;
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    request.on("data", (chunk: Buffer) => {
      total += chunk.length;

      if (total > MAX_REQUEST_BYTES) {
        reject(new Error("请求体过大"));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function parseMultipartBody(
  body: Buffer,
  contentType: string | string[],
): UploadedPart[] {
  const header = normalizeHeader(contentType);
  const match = /boundary=([^;]+)/i.exec(header);

  if (!match) {
    throw new Error("multipart boundary 缺失");
  }

  const boundaryText = match[1];

  if (!boundaryText) {
    throw new Error("multipart boundary 缺失");
  }

  const boundary = Buffer.from(`--${boundaryText.replace(/^"|"$/g, "")}`);
  const parts: UploadedPart[] = [];
  let position = body.indexOf(boundary);

  while (position !== -1) {
    let nextPosition = body.indexOf(boundary, position + boundary.length);

    if (nextPosition === -1) {
      break;
    }

    let part = body.subarray(position + boundary.length, nextPosition);
    position = nextPosition;

    if (part.subarray(0, 2).toString() === "--") {
      break;
    }

    if (part.subarray(0, 2).toString() === "\r\n") {
      part = part.subarray(2);
    }

    if (part.subarray(part.length - 2).toString() === "\r\n") {
      part = part.subarray(0, part.length - 2);
    }

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));

    if (headerEnd === -1) {
      continue;
    }

    const rawHeaders = part.subarray(0, headerEnd).toString("utf8");
    const data = part.subarray(headerEnd + 4);
    const disposition =
      rawHeaders
        .split("\r\n")
        .find((line) =>
          line.toLowerCase().startsWith("content-disposition:"),
        ) ?? "";
    const name = /name="([^"]+)"/.exec(disposition)?.[1] ?? "";
    const filename = /filename="([^"]*)"/.exec(disposition)?.[1] ?? null;

    if (name) {
      parts.push({ name, filename, data });
    }

    nextPosition = body.indexOf(boundary, position + boundary.length);
  }

  return parts;
}

function normalizeHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(";") : (value ?? "");
}

function readJsonText(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function readBoolean(value: string | null): boolean {
  return value === "true" || value === "1" || value === "yes";
}

function normalizeExtension(fileName: string): string | null {
  const extension = extname(fileName).toLowerCase();
  return extension ? extension.slice(1) : null;
}

async function readImageDimensions(
  filePath: string,
  extension: string | null,
): Promise<{ width: number; height: number } | null> {
  if (!extension || !IMAGE_EXTENSIONS.has(extension)) {
    return null;
  }

  try {
    const metadata = await sharp(filePath).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (!width || !height || width <= 0 || height <= 0) {
      return null;
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  } catch {
    return null;
  }
}

export async function clearStaleApiUploadBatches(): Promise<void> {
  const root = join(app.getPath("userData"), "runtime", UPLOAD_BATCH_ROOT);

  try {
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await rm(join(root, entry.name), { recursive: true, force: true });
      }
    }
  } catch {
    return;
  }
}
