import { app, net } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { sep } from "node:path";
import { join, resolve } from "node:path";
import { unlinkSync } from "node:fs";
import {
  MEDIA_EXTENSIONS,
  WEB_MEDIA_MIME_EXTENSIONS,
} from "../shared/media.js";

export function normalizeImportUrls(value: unknown[]): string[] {
  const urls: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const url = normalizeImportUrl(item);

    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }

  return urls;
}

export async function downloadWebMedia(
  url: string,
  queueId: number,
): Promise<string> {
  const response = await net.fetch(url, {
    headers: {
      "User-Agent": `Asteria/${app.getVersion()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`);
  }

  const contentType = normalizeContentType(
    response.headers.get("content-type"),
  );
  const extension = getWebMediaExtension(url, contentType);

  if (!extension) {
    throw new Error("不是支持的媒体链接");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new Error("下载内容为空");
  }

  const directory = getImportDownloadDirectory();
  await mkdir(directory, { recursive: true });

  const filePath = join(directory, `web-${queueId}-${Date.now()}.${extension}`);
  await writeFile(filePath, buffer);

  return filePath;
}

export function cleanupDownloadedImportFile(filePath: string): void {
  const directory = resolve(getImportDownloadDirectory());
  const resolvedFilePath = resolve(filePath);

  if (!resolvedFilePath.startsWith(`${directory}${sep}`)) {
    return;
  }

  try {
    unlinkSync(resolvedFilePath);
  } catch {
    return;
  }
}

function normalizeImportUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function normalizeContentType(value: string | null): string | null {
  return value?.split(";")[0]?.trim().toLowerCase() || null;
}

function getWebMediaExtension(
  url: string,
  contentType: string | null,
): string | null {
  const extension = normalizePathExtension(new URL(url).pathname);

  if (extension && MEDIA_EXTENSIONS.has(extension)) {
    return extension;
  }

  if (contentType) {
    const mimeExtension = WEB_MEDIA_MIME_EXTENSIONS.get(contentType);

    if (mimeExtension) {
      return mimeExtension;
    }

    if (contentType.startsWith("image/")) {
      return "jpg";
    }

    if (contentType.startsWith("video/")) {
      return "mp4";
    }

    if (contentType.startsWith("audio/")) {
      return "mp3";
    }
  }

  return null;
}

function normalizePathExtension(path: string): string | null {
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension ?? null;
}

function getImportDownloadDirectory(): string {
  return join(app.getPath("userData"), "runtime", "import-downloads");
}
