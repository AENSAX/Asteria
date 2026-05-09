import { app, net, session, type WebContents } from "electron";
import {
  request as requestHttp,
  type IncomingHttpHeaders,
  type IncomingMessage,
} from "node:http";
import { request as requestHttps } from "node:https";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { connect as connectTls } from "node:tls";
import {
  createApiUploadedFileRecord,
  findStoredFileForApiUpload,
  getNetworkSettings,
} from "./database.js";
import { hashFile } from "./fileHash.js";
import { storeNewMediaFile } from "./mediaStorage.js";
import type {
  EHentaiGalleryStatus,
  EHentaiImportOptions,
  EHentaiImportProgress,
  TagDraft,
} from "../shared/ipc.js";

type RequestRedirect = "error" | "follow" | "manual";

const EHENTAI_TAG_STYLE_NAME = "e-hentai";
const DEFAULT_REQUEST_DELAY_MS = 10000;
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const RATE_LIMIT_EXTRA_WAIT_MS = 5000;
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
let ehentaiImportCanceled = false;

interface GalleryImagePage {
  pageUrl: string;
  pageNumber: number | null;
  fileName: string | null;
}

interface GalleryMetadata {
  title: string;
  tags: TagDraft[];
}

interface EHentaiCounters {
  processed: number;
  imported: number;
  duplicated: number;
  skipped: number;
  failed: number;
}

class EHentaiRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`E-Hentai 暂时限制请求，等待 ${formatDuration(retryAfterMs)} 后重试`);
  }
}

export async function testEHentaiGallery(
  options: EHentaiImportOptions,
): Promise<EHentaiGalleryStatus> {
  try {
    const normalizedOptions = normalizeEHentaiImportOptions(options);
    const galleryUrl = normalizeGalleryUrl(normalizedOptions.galleryUrl);
    const html = await fetchEHentaiText(
      galleryUrl,
      normalizedOptions.cookie,
      galleryUrl,
      normalizedOptions.requestTimeoutMs,
    );
    const metadata = parseGalleryMetadata(html);
    const imagePages = parseGalleryImagePages(html, galleryUrl);

    return {
      ok: imagePages.length > 0,
      message:
        imagePages.length > 0
          ? `链接可用，首页解析到 ${imagePages.length} 张`
          : "没有解析到图片页面，请检查 Cookie 或页面结构",
      galleryTitle: metadata.title,
      imageCount: imagePages.length,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "检测失败",
      galleryTitle: "",
      imageCount: 0,
    };
  }
}

export async function importFromEHentai(
  sender: WebContents,
  options: EHentaiImportOptions,
): Promise<EHentaiImportProgress> {
  ehentaiImportCanceled = false;
  const normalizedOptions = normalizeEHentaiImportOptions(options);
  const counters: EHentaiCounters = {
    processed: 0,
    imported: 0,
    duplicated: 0,
    skipped: 0,
    failed: 0,
  };
  let total = 0;

  try {
    const galleryUrl = normalizeGalleryUrl(normalizedOptions.galleryUrl);
    emitEHentaiProgress(
      sender,
      createEHentaiProgress({ phase: "testing", message: "检测 gallery 链接" }),
    );

    const firstPageHtml = await fetchEHentaiText(
      galleryUrl,
      normalizedOptions.cookie,
      galleryUrl,
      normalizedOptions.requestTimeoutMs,
      (waitMs) =>
        emitRateLimitProgress(sender, "testing", 0, 0, galleryUrl, waitMs),
    );
    const metadata = parseGalleryMetadata(firstPageHtml);
    const firstPageImagePages = parseGalleryImagePages(
      firstPageHtml,
      galleryUrl,
    );

    if (firstPageImagePages.length === 0) {
      throw new Error("没有解析到图片页面，请检查 Cookie 或页面结构。");
    }

    assertEHentaiNotCanceled();
    emitEHentaiProgress(
      sender,
      createEHentaiProgress({
        phase: "collecting",
        message: "解析 gallery 分页",
      }),
    );
    emitEHentaiProgress(
      sender,
      createEHentaiProgress({
        phase: "collecting",
        total: 1,
        processed: 0,
        currentFile: galleryUrl,
        message: `读取 gallery 首页链接：${galleryUrl}`,
      }),
    );
    const imagePages = await collectGalleryImagePages(
      sender,
      galleryUrl,
      normalizedOptions,
      firstPageHtml,
      firstPageImagePages,
    );
    const selectedPages = sliceImagePages(
      imagePages,
      normalizedOptions.startIndex,
      normalizedOptions.limit,
    );
    total = selectedPages.length;

    if (selectedPages.length === 0) {
      const completed = createEHentaiProgress({
        phase: "completed",
        total,
        message: "没有需要导入的图片",
        ...counters,
      });
      emitEHentaiProgress(sender, completed);
      return completed;
    }

    const baseTags = createGalleryTags(
      metadata,
      normalizedOptions.importGalleryTags,
    );

    for (const imagePage of selectedPages) {
      assertEHentaiNotCanceled();
      emitEHentaiProgress(
        sender,
        createEHentaiProgress({
          phase: "importing",
          total,
          currentFile: imagePage.fileName ?? imagePage.pageUrl,
          message: "下载并导入 E-Hentai 原图",
          ...counters,
        }),
      );

      try {
        emitEHentaiProgress(
          sender,
          createEHentaiProgress({
            phase: "importing",
            total,
            currentFile: imagePage.pageUrl,
            message: `读取单页链接：${imagePage.pageUrl}`,
            ...counters,
          }),
        );

        const originalUrl = await resolveOriginalImageUrl(
          imagePage,
          normalizedOptions.cookie,
          normalizedOptions.requestTimeoutMs,
          (waitMs) =>
            emitRateLimitProgress(
              sender,
              "importing",
              total,
              counters.processed,
              imagePage.pageUrl,
              waitMs,
            ),
        );
        const imageLinkType = isEHentaiFullImageUrl(originalUrl)
          ? "原图"
          : "展示图";
        emitEHentaiProgress(
          sender,
          createEHentaiProgress({
            phase: "importing",
            total,
            currentFile: originalUrl,
            message: `解析${imageLinkType}链接：${originalUrl}`,
            ...counters,
          }),
        );
        const result = await importOriginalImage(
          sender,
          total,
          counters,
          galleryUrl,
          imagePage,
          originalUrl,
          normalizedOptions.cookie,
          normalizedOptions.requestTimeoutMs,
          (waitMs) =>
            emitRateLimitProgress(
              sender,
              "importing",
              total,
              counters.processed,
              originalUrl,
              waitMs,
            ),
          (redirectUrl) =>
            emitOriginalRedirectProgress(sender, total, counters, redirectUrl),
          normalizedOptions.forceDuplicate,
          baseTags,
        );

        if (result === "duplicated") {
          counters.duplicated += 1;
        } else if (result === "skipped") {
          counters.skipped += 1;
        } else {
          counters.imported += 1;
        }
      } catch (error) {
        counters.failed += 1;
        emitEHentaiProgress(
          sender,
          createEHentaiProgress({
            phase: "importing",
            total,
            currentFile: imagePage.fileName ?? imagePage.pageUrl,
            message: `导入失败：${error instanceof Error ? error.message : "未知错误"}`,
            ...counters,
          }),
        );
      }

      counters.processed += 1;
      await delay(normalizedOptions.requestDelayMs);
    }

    const completed = createEHentaiProgress({
      phase: "completed",
      total,
      currentFile: null,
      message: "E-Hentai 导入完成",
      ...counters,
    });
    emitEHentaiProgress(sender, completed);
    return completed;
  } catch (error) {
    const resumeIndex = normalizedOptions.startIndex + counters.processed;
    const failed = createEHentaiProgress({
      phase: ehentaiImportCanceled ? "canceled" : "failed",
      total,
      message: ehentaiImportCanceled
        ? `已取消 E-Hentai 导入。已成功导入 ${counters.imported + counters.duplicated} 张，可从第 ${resumeIndex} 张继续。`
        : `${error instanceof Error ? error.message : "E-Hentai 导入失败"}。已成功导入 ${counters.imported + counters.duplicated} 张，可从第 ${resumeIndex} 张继续。`,
      ...counters,
    });
    emitEHentaiProgress(sender, failed);
    return failed;
  }
}

export function cancelEHentaiImport(): void {
  ehentaiImportCanceled = true;
}

async function collectGalleryImagePages(
  sender: WebContents,
  galleryUrl: string,
  options: EHentaiImportOptions,
  firstPageHtml: string,
  firstPageImagePages: GalleryImagePage[],
): Promise<GalleryImagePage[]> {
  const pages: GalleryImagePage[] = [];
  const seenPageUrls = new Set<string>();
  let maxPageIndex = Math.max(
    0,
    ...parseGalleryPageIndexes(firstPageHtml, galleryUrl),
  );

  appendImagePages(pages, seenPageUrls, firstPageImagePages);

  for (let pageIndex = 1; pageIndex <= maxPageIndex; pageIndex += 1) {
    assertEHentaiNotCanceled();
    await delay(options.requestDelayMs);
    const pageUrl = buildGalleryPageUrl(galleryUrl, pageIndex);
    emitEHentaiProgress(
      sender,
      createEHentaiProgress({
        phase: "collecting",
        total: maxPageIndex + 1,
        processed: pageIndex,
        currentFile: pageUrl,
        message: `读取 gallery 分页链接：${pageUrl}`,
      }),
    );
    const html = await fetchEHentaiText(
      pageUrl,
      options.cookie,
      galleryUrl,
      options.requestTimeoutMs,
      (waitMs) =>
        emitRateLimitProgress(
          sender,
          "collecting",
          maxPageIndex + 1,
          pageIndex,
          pageUrl,
          waitMs,
        ),
    );
    maxPageIndex = Math.max(
      maxPageIndex,
      ...parseGalleryPageIndexes(html, galleryUrl),
    );
    appendImagePages(
      pages,
      seenPageUrls,
      parseGalleryImagePages(html, pageUrl),
    );
  }

  return pages.sort((left, right) => {
    const leftPage = left.pageNumber ?? Number.MAX_SAFE_INTEGER;
    const rightPage = right.pageNumber ?? Number.MAX_SAFE_INTEGER;
    return leftPage - rightPage || left.pageUrl.localeCompare(right.pageUrl);
  });
}

function appendImagePages(
  output: GalleryImagePage[],
  seenPageUrls: Set<string>,
  imagePages: GalleryImagePage[],
): void {
  for (const imagePage of imagePages) {
    if (seenPageUrls.has(imagePage.pageUrl)) {
      continue;
    }

    seenPageUrls.add(imagePage.pageUrl);
    output.push(imagePage);
  }
}

async function resolveOriginalImageUrl(
  imagePage: GalleryImagePage,
  cookie: string,
  timeoutMs: number,
  onRateLimited?: (waitMs: number) => void,
): Promise<string> {
  const html = await fetchEHentaiText(
    imagePage.pageUrl,
    cookie,
    imagePage.pageUrl,
    timeoutMs,
    onRateLimited,
  );
  const originalUrl = parseOriginalImageUrl(html, imagePage.pageUrl);

  if (!originalUrl) {
    throw new Error("没有找到 Download original 链接");
  }

  return originalUrl;
}

async function importOriginalImage(
  sender: WebContents,
  total: number,
  counters: EHentaiCounters,
  galleryUrl: string,
  imagePage: GalleryImagePage,
  originalUrl: string,
  cookie: string,
  timeoutMs: number,
  onRateLimited: ((waitMs: number) => void) | undefined,
  onOriginalRedirect: ((redirectUrl: string) => void) | undefined,
  forceDuplicate: boolean,
  tags: TagDraft[],
): Promise<"imported" | "duplicated" | "skipped"> {
  const imageLinkType = isEHentaiFullImageUrl(originalUrl) ? "原图" : "展示图";
  emitEHentaiProgress(
    sender,
    createEHentaiProgress({
      phase: "importing",
      total,
      currentFile: originalUrl,
      message: `下载${imageLinkType}链接：${originalUrl}`,
      ...counters,
    }),
  );
  const tempPath = await downloadOriginalImage(
    originalUrl,
    cookie,
    imagePage.pageUrl,
    imagePage.fileName,
    timeoutMs,
    onRateLimited,
    onOriginalRedirect,
  );

  try {
    const fileStat = await stat(tempPath);
    const sha256 = await hashFile(tempPath);
    const existing = findStoredFileForApiUpload(sha256);

    if (existing && !forceDuplicate) {
      emitEHentaiProgress(
        sender,
        createEHentaiProgress({
          phase: "importing",
          total,
          currentFile: imagePage.fileName ?? imagePage.pageUrl,
          message: "重复文件，已跳过",
          ...counters,
        }),
      );
      return "skipped";
    }

    const extension = normalizeExtension(tempPath);
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

    createApiUploadedFileRecord({
      sha256,
      originalPath: imagePage.pageUrl,
      storagePath: storedFile.storagePath,
      fileName: storedFile.fileName,
      extension: storedFile.extension,
      sizeBytes: storedFile.sizeBytes,
      tags,
      tagStyleName: EHENTAI_TAG_STYLE_NAME,
      urls: [galleryUrl, imagePage.pageUrl, originalUrl],
    });

    return existing ? "duplicated" : "imported";
  } finally {
    await rm(tempPath, { force: true });
  }
}

async function downloadOriginalImage(
  originalUrl: string,
  cookie: string,
  referer: string,
  fileName: string | null,
  timeoutMs: number,
  onRateLimited?: (waitMs: number) => void,
  onOriginalRedirect?: (redirectUrl: string) => void,
): Promise<string> {
  const response = await fetchOriginalImageWithRateLimitRetry(
    originalUrl,
    cookie,
    referer,
    timeoutMs,
    onRateLimited,
    onOriginalRedirect,
  );

  if (!response.ok) {
    throw new Error(`下载原图失败: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("text/html") || contentType.includes("text/plain")) {
    const text = await response.text();
    const retryAfterMs = readEHentaiRateLimitRetryMs(text);

    if (retryAfterMs !== null) {
      throw new EHentaiRateLimitError(retryAfterMs);
    }

    throw new Error(
      `下载原图失败：返回了 ${contentType}：${summarizeText(text)}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const directory = join(app.getPath("userData"), "runtime", "ehentai-import");
  await mkdir(directory, { recursive: true });

  const normalizedFileName = sanitizeFileName(
    fileName || fileNameFromUrl(originalUrl) || "ehentai-image.bin",
  );
  const filePath = join(directory, `${Date.now()}-${normalizedFileName}`);
  await writeFile(filePath, buffer);
  return filePath;
}

async function fetchEHentaiText(
  url: string,
  cookie: string,
  referer: string,
  timeoutMs: number,
  onRateLimited?: (waitMs: number) => void,
): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetchEHentai(url, cookie, referer, timeoutMs);

    if (!response.ok) {
      throw new Error(`请求失败: HTTP ${response.status}`);
    }

    const text = await response.text();
    const retryAfterMs = readEHentaiRateLimitRetryMs(text);

    if (retryAfterMs === null) {
      return text;
    }

    if (attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw new EHentaiRateLimitError(retryAfterMs);
    }

    onRateLimited?.(retryAfterMs);
    await delay(retryAfterMs);
  }

  throw new Error("E-Hentai 请求失败");
}

async function fetchOriginalImageWithRateLimitRetry(
  originalUrl: string,
  cookie: string,
  referer: string,
  timeoutMs: number,
  onRateLimited?: (waitMs: number) => void,
  onOriginalRedirect?: (redirectUrl: string) => void,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = isEHentaiFullImageUrl(originalUrl)
      ? await requestOriginalImage(
          originalUrl,
          cookie,
          referer,
          timeoutMs,
          (redirectUrl) => {
            onOriginalRedirect?.(redirectUrl);
          },
        )
      : await requestImageUrl(originalUrl, referer, timeoutMs);

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";

    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      return response;
    }

    const text = await response.clone().text();
    const retryAfterMs = readEHentaiRateLimitRetryMs(text);

    if (retryAfterMs === null) {
      return response;
    }

    if (attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw new EHentaiRateLimitError(retryAfterMs);
    }

    onRateLimited?.(retryAfterMs);
    await delay(retryAfterMs);
  }

  throw new Error("E-Hentai 原图请求失败");
}

async function fetchEHentai(
  url: string,
  cookie: string,
  referer: string,
  timeoutMs: number,
  redirect: RequestRedirect = "follow",
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await session.defaultSession.fetch(url, {
      redirect,
      signal: controller.signal,
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Upgrade-Insecure-Requests": "1",
        Referer: referer,
        ...(cookie.trim() ? { Cookie: normalizeCookie(cookie) } : {}),
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`请求超时：${Math.ceil(timeoutMs / 1000)} 秒`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function requestOriginalImage(
  originalUrl: string,
  cookie: string,
  referer: string,
  timeoutMs: number,
  onRedirect?: (redirectUrl: string) => void,
): Promise<Response> {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = net.request({
      method: "GET",
      url: originalUrl,
      session: session.defaultSession,
      redirect: "manual",
      credentials: "omit",
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Referer: referer,
        ...(cookie.trim() ? { Cookie: normalizeCookie(cookie) } : {}),
      },
    });
    const timeout = setTimeout(() => {
      request.abort();
      rejectRequest(new Error(`请求超时：${Math.ceil(timeoutMs / 1000)} 秒`));
    }, timeoutMs);
    let settled = false;

    function settleWithError(error: Error): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      rejectRequest(error);
    }

    request.on("redirect", (_statusCode, _method, redirectUrl) => {
      onRedirect?.(redirectUrl);
      request.followRedirect();
    });

    request.on("response", (incomingMessage) => {
      const chunks: Buffer[] = [];

      incomingMessage.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      incomingMessage.on("end", () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolveRequest(
          new Response(Buffer.concat(chunks), {
            status: incomingMessage.statusCode ?? 0,
            headers: flattenIncomingHeaders(incomingMessage.headers),
          }),
        );
      });

      incomingMessage.on("error", (error: Error) => {
        settleWithError(error);
      });
    });

    request.on("error", (error) => {
      settleWithError(error);
    });

    request.end();
  });
}

function requestImageUrl(
  url: string,
  referer: string,
  timeoutMs: number,
): Promise<Response> {
  if (!isEHentaiUrl(url)) {
    return requestExternalImageWithNode(url, referer, timeoutMs).catch(
      (error) => {
        if (isProxyConnectionError(error)) {
          throw error;
        }

        return requestImageUrlWithElectron(url, referer, timeoutMs);
      },
    );
  }

  return requestImageUrlWithElectron(url, referer, timeoutMs);
}

function requestImageUrlWithElectron(
  url: string,
  referer: string,
  timeoutMs: number,
): Promise<Response> {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = net.request({
      method: "GET",
      url,
      session: session.defaultSession,
      redirect: "follow",
      credentials: "omit",
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Referer: referer,
      },
    });
    const timeout = setTimeout(() => {
      request.abort();
      rejectRequest(new Error(`请求超时：${Math.ceil(timeoutMs / 1000)} 秒`));
    }, timeoutMs);
    let settled = false;

    function settleWithError(error: Error): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      rejectRequest(error);
    }

    request.on("response", (incomingMessage) => {
      const chunks: Buffer[] = [];

      incomingMessage.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      incomingMessage.on("end", () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolveRequest(
          new Response(Buffer.concat(chunks), {
            status: incomingMessage.statusCode ?? 0,
            headers: flattenIncomingHeaders(incomingMessage.headers),
          }),
        );
      });

      incomingMessage.on("error", (error: Error) => {
        settleWithError(error);
      });
    });

    request.on("error", (error) => {
      settleWithError(error);
    });

    request.end();
  });
}

function requestExternalImageWithNode(
  url: string,
  referer: string,
  timeoutMs: number,
  redirectCount = 0,
): Promise<Response> {
  const targetUrl = new URL(url);
  const networkSettings = getNetworkSettings();
  const headers = createExternalImageHeaders(referer);
  const requestPromise =
    networkSettings.proxyEnabled && networkSettings.proxyHost
      ? requestNodeViaHttpProxy(targetUrl, headers, timeoutMs)
      : requestNodeDirect(targetUrl, headers, timeoutMs);

  return requestPromise.then((response) => {
    const location = response.headers.get("location");

    if (
      response.status >= 300 &&
      response.status < 400 &&
      location &&
      redirectCount < 5
    ) {
      return requestExternalImageWithNode(
        new URL(location, targetUrl).toString(),
        referer,
        timeoutMs,
        redirectCount + 1,
      );
    }

    return response;
  });
}

function requestNodeDirect(
  targetUrl: URL,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  const request = targetUrl.protocol === "https:" ? requestHttps : requestHttp;

  return new Promise((resolveRequest, rejectRequest) => {
    const clientRequest = request(
      targetUrl,
      {
        method: "GET",
        headers,
        timeout: timeoutMs,
      },
      (incomingMessage) => {
        collectNodeResponse(incomingMessage, resolveRequest, rejectRequest);
      },
    );

    clientRequest.on("timeout", () => {
      clientRequest.destroy(
        new Error(`请求超时：${Math.ceil(timeoutMs / 1000)} 秒`),
      );
    });
    clientRequest.on("error", rejectRequest);
    clientRequest.end();
  });
}

function requestNodeViaHttpProxy(
  targetUrl: URL,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  const networkSettings = getNetworkSettings();
  const proxyHost = networkSettings.proxyHost.trim();
  const proxyPort = networkSettings.proxyPort;

  if (!proxyHost || !proxyPort) {
    return requestNodeDirect(targetUrl, headers, timeoutMs);
  }

  if (targetUrl.protocol !== "https:") {
    return requestNodeHttpViaProxy(
      targetUrl,
      headers,
      timeoutMs,
      proxyHost,
      proxyPort,
    );
  }

  return new Promise((resolveRequest, rejectRequest) => {
    const connectRequest = requestHttp({
      host: proxyHost,
      port: proxyPort,
      method: "CONNECT",
      path: `${targetUrl.hostname}:${targetUrl.port || 443}`,
      timeout: timeoutMs,
    });

    connectRequest.on("connect", (response, socket) => {
      if (
        (response.statusCode ?? 0) < 200 ||
        (response.statusCode ?? 0) >= 300
      ) {
        socket.destroy();
        rejectRequest(
          new Error(`代理 CONNECT 失败: HTTP ${response.statusCode ?? 0}`),
        );
        return;
      }

      const tlsSocket = connectTls({
        socket,
        servername: targetUrl.hostname,
      });
      const clientRequest = requestHttps(
        {
          method: "GET",
          hostname: targetUrl.hostname,
          port: Number(targetUrl.port || 443),
          path: `${targetUrl.pathname}${targetUrl.search}`,
          headers,
          timeout: timeoutMs,
          createConnection: () => tlsSocket,
        },
        (incomingMessage) => {
          collectNodeResponse(incomingMessage, resolveRequest, rejectRequest);
        },
      );

      clientRequest.on("timeout", () => {
        clientRequest.destroy(
          new Error(`请求超时：${Math.ceil(timeoutMs / 1000)} 秒`),
        );
      });
      clientRequest.on("error", rejectRequest);
      clientRequest.end();
    });

    connectRequest.on("timeout", () => {
      connectRequest.destroy(
        new Error(`请求超时：${Math.ceil(timeoutMs / 1000)} 秒`),
      );
    });
    connectRequest.on("error", rejectRequest);
    connectRequest.end();
  });
}

function requestNodeHttpViaProxy(
  targetUrl: URL,
  headers: Record<string, string>,
  timeoutMs: number,
  proxyHost: string,
  proxyPort: number,
): Promise<Response> {
  return new Promise((resolveRequest, rejectRequest) => {
    const clientRequest = requestHttp(
      {
        host: proxyHost,
        port: proxyPort,
        method: "GET",
        path: targetUrl.toString(),
        headers,
        timeout: timeoutMs,
      },
      (incomingMessage) => {
        collectNodeResponse(incomingMessage, resolveRequest, rejectRequest);
      },
    );

    clientRequest.on("timeout", () => {
      clientRequest.destroy(
        new Error(`请求超时：${Math.ceil(timeoutMs / 1000)} 秒`),
      );
    });
    clientRequest.on("error", rejectRequest);
    clientRequest.end();
  });
}

function collectNodeResponse(
  incomingMessage: IncomingMessage,
  resolveRequest: (response: Response) => void,
  rejectRequest: (error: Error) => void,
): void {
  const chunks: Buffer[] = [];

  incomingMessage.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  incomingMessage.on("end", () => {
    resolveRequest(
      new Response(Buffer.concat(chunks), {
        status: incomingMessage.statusCode ?? 0,
        headers: flattenIncomingHeaders(incomingMessage.headers),
      }),
    );
  });
  incomingMessage.on("error", rejectRequest);
}

function createExternalImageHeaders(referer: string): Record<string, string> {
  return {
    "User-Agent": DEFAULT_USER_AGENT,
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: referer,
  };
}

function parseGalleryMetadata(html: string): GalleryMetadata {
  const title =
    readFirstMatch(html, /<h1[^>]*id=["']gn["'][^>]*>([\s\S]*?)<\/h1>/i) ||
    readFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
    "E-Hentai Gallery";
  const tags: TagDraft[] = [];
  const rowPattern =
    /<tr[^>]*>\s*<td[^>]*class=["'][^"']*\btc\b[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const namespace = stripHtml(rowMatch[1] ?? "")
      .replace(/:$/u, "")
      .trim();
    const cellHtml = rowMatch[2] ?? "";
    const tagPattern =
      /<div[^>]*class=["'][^"']*\bgt\w*\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
    let tagMatch: RegExpExecArray | null;

    while ((tagMatch = tagPattern.exec(cellHtml)) !== null) {
      const name = stripHtml(tagMatch[1] ?? "").trim();

      if (name) {
        tags.push({ namespace, name });
      }
    }
  }

  return {
    title: stripHtml(title).trim() || "E-Hentai Gallery",
    tags,
  };
}

function parseGalleryImagePages(
  html: string,
  baseUrl: string,
): GalleryImagePage[] {
  const imagePages: GalleryImagePage[] = [];
  const linkPattern =
    /<a[^>]*href=["']([^"']*\/s\/[^"']+)["'][^>]*>\s*<div[^>]*title=["']([^"']*)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const title = match[2];

    if (!href || !title) {
      continue;
    }

    const { pageNumber, fileName } = parseGridTitle(decodeHtml(title));
    imagePages.push({
      pageUrl: new URL(decodeHtml(href), baseUrl).toString(),
      pageNumber,
      fileName,
    });
  }

  return imagePages;
}

function parseGalleryPageIndexes(html: string, galleryUrl: string): number[] {
  const indexes = new Set<number>([0]);
  const galleryPath = new URL(galleryUrl).pathname;
  const hrefPattern = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[1];

    if (!href) {
      continue;
    }

    try {
      const url = new URL(decodeHtml(href), galleryUrl);

      if (url.hostname !== "e-hentai.org" || url.pathname !== galleryPath) {
        continue;
      }

      const pageIndex = Number(url.searchParams.get("p") ?? "0");

      if (Number.isInteger(pageIndex) && pageIndex >= 0) {
        indexes.add(pageIndex);
      }
    } catch {
      continue;
    }
  }

  return Array.from(indexes);
}

function parseOriginalImageUrl(html: string, baseUrl: string): string | null {
  const original = readDownloadOriginalUrl(html);

  if (original) {
    return new URL(decodeHtml(original), baseUrl).toString();
  }

  const displayedImage = readImageSourceById(html, "img");

  return displayedImage
    ? new URL(decodeHtml(displayedImage), baseUrl).toString()
    : null;
}

function readDownloadOriginalUrl(html: string): string | null {
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const attributes = parseHtmlAttributes(match[1] ?? "");
    const href = attributes.get("href");

    if (!href || !href.includes("/fullimg/")) {
      continue;
    }

    if (/download original/i.test(stripHtml(match[2] ?? ""))) {
      return href;
    }
  }

  return null;
}

function readImageSourceById(html: string, id: string): string | null {
  const imageTagPattern = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imageTagPattern.exec(html)) !== null) {
    const attributes = parseHtmlAttributes(match[0]);

    if (attributes.get("id") === id && attributes.get("src")) {
      return attributes.get("src") ?? null;
    }
  }

  return null;
}

function parseHtmlAttributes(tagHtml: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern =
    /([^\s=<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(tagHtml)) !== null) {
    const name = match[1];

    if (!name) {
      continue;
    }

    attributes.set(
      name.toLowerCase(),
      decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""),
    );
  }

  return attributes;
}

function createGalleryTags(
  metadata: GalleryMetadata,
  importGalleryTags: boolean,
): TagDraft[] {
  const tags: TagDraft[] = [
    {
      namespace: "gallery",
      name: metadata.title,
    },
  ];

  if (importGalleryTags) {
    tags.push(...metadata.tags);
  }

  return dedupeTags(tags);
}

function dedupeTags(tags: TagDraft[]): TagDraft[] {
  const seen = new Set<string>();
  const output: TagDraft[] = [];

  for (const tag of tags) {
    const namespace = tag.namespace.trim();
    const name = tag.name.trim();

    if (!name) {
      continue;
    }

    const key = `${namespace.toLowerCase()}:${name.toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push({ namespace, name });
  }

  return output;
}

function normalizeEHentaiImportOptions(
  options: EHentaiImportOptions,
): EHentaiImportOptions {
  return {
    galleryUrl: options.galleryUrl.trim(),
    cookie: normalizeCookie(options.cookie),
    importGalleryTags: options.importGalleryTags !== false,
    forceDuplicate: options.forceDuplicate === true,
    requestDelayMs: DEFAULT_REQUEST_DELAY_MS,
    requestTimeoutMs:
      Number.isFinite(options.requestTimeoutMs) && options.requestTimeoutMs > 0
        ? Math.max(1000, Math.floor(options.requestTimeoutMs))
        : DEFAULT_REQUEST_TIMEOUT_MS,
    startIndex: Number.isFinite(options.startIndex)
      ? Math.max(1, Math.floor(options.startIndex))
      : 1,
    limit:
      Number.isFinite(options.limit) && options.limit > 0
        ? Math.floor(options.limit)
        : 0,
  };
}

function normalizeGalleryUrl(value: string): string {
  const url = new URL(value.trim());

  if (url.protocol !== "https:" || url.hostname !== "e-hentai.org") {
    throw new Error("请输入 https://e-hentai.org/g/... 格式的 gallery 链接");
  }

  if (!/^\/g\/\d+\/[0-9a-z]+\/?$/i.test(url.pathname)) {
    throw new Error("请输入正确的 E-Hentai gallery 链接");
  }

  url.search = "";
  url.hash = "";

  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  return url.toString();
}

function buildGalleryPageUrl(galleryUrl: string, pageIndex: number): string {
  const url = new URL(galleryUrl);

  if (pageIndex > 0) {
    url.searchParams.set("p", String(pageIndex));
  }

  return url.toString();
}

function sliceImagePages(
  imagePages: GalleryImagePage[],
  startIndex: number,
  limit: number,
): GalleryImagePage[] {
  const selectedPages = imagePages.slice(Math.max(0, startIndex - 1));
  return limit > 0 ? selectedPages.slice(0, limit) : selectedPages;
}

function parseGridTitle(title: string): {
  pageNumber: number | null;
  fileName: string | null;
} {
  const match = /^Page\s+(\d+)\s*:\s*(.+)$/i.exec(title.trim());

  if (!match) {
    return {
      pageNumber: null,
      fileName: title.trim() || null,
    };
  }

  return {
    pageNumber: Number(match[1] ?? 0),
    fileName: match[2]?.trim() || null,
  };
}

function normalizeCookie(cookie: string): string {
  return cookie
    .split(/\r?\n|;/)
    .map((part) => part.trim().replace(/^cookie:\s*/i, ""))
    .filter(Boolean)
    .join("; ");
}

function isEHentaiUrl(value: string): boolean {
  try {
    return new URL(value).hostname === "e-hentai.org";
  } catch {
    return false;
  }
}

function isEHentaiFullImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.hostname === "e-hentai.org" && url.pathname.startsWith("/fullimg/")
    );
  } catch {
    return false;
  }
}

function flattenIncomingHeaders(
  headers: Record<string, string | string[]> | IncomingHttpHeaders,
): Headers {
  const flattened = new Headers();

  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      flattened.set(name, value.join(", "));
    } else if (typeof value === "string") {
      flattened.set(name, value);
    }
  }

  return flattened;
}

function isProxyConnectionError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("代理 CONNECT 失败");
}

function readEHentaiRateLimitRetryMs(text: string): number | null {
  if (!/temporarily banned|excessive request rate/i.test(text)) {
    return null;
  }

  const normalizedText = stripHtml(text);
  const match =
    /ban expires in\s+(?:(\d+)\s+minutes?)?(?:\s+and\s+)?(?:(\d+)\s+seconds?)?/i.exec(
      normalizedText,
    );
  const minutes = match?.[1] ? Number(match[1]) : 0;
  const seconds = match?.[2] ? Number(match[2]) : 0;
  const retryAfterMs = (minutes * 60 + seconds) * 1000;

  return Math.max(
    RATE_LIMIT_EXTRA_WAIT_MS,
    retryAfterMs + RATE_LIMIT_EXTRA_WAIT_MS,
  );
}

function emitRateLimitProgress(
  sender: WebContents,
  phase: EHentaiImportProgress["phase"],
  total: number,
  processed: number,
  currentFile: string,
  waitMs: number,
): void {
  emitEHentaiProgress(
    sender,
    createEHentaiProgress({
      phase,
      total,
      processed,
      currentFile,
      message: `触发临时限制，等待 ${formatDuration(waitMs)} 后重试：${currentFile}`,
    }),
  );
}

function emitOriginalRedirectProgress(
  sender: WebContents,
  total: number,
  counters: EHentaiCounters,
  redirectUrl: string,
): void {
  emitEHentaiProgress(
    sender,
    createEHentaiProgress({
      phase: "importing",
      total,
      currentFile: redirectUrl,
      message: `跳转原图实际链接：${redirectUrl}`,
      ...counters,
    }),
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds} 秒`;
  }

  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
}

function summarizeText(text: string): string {
  return stripHtml(text).slice(0, 180);
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readFirstMatch(value: string, pattern: RegExp): string | null {
  const match = pattern.exec(value);
  return match?.[1] ? decodeHtml(match[1]) : null;
}

function fileNameFromUrl(url: string): string | null {
  const name = basename(new URL(url).pathname);
  return name ? decodeURIComponent(name) : null;
}

function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized || "ehentai-image.bin";
}

function normalizeExtension(filePath: string): string | null {
  const extension = extname(filePath).toLowerCase();
  return extension.length > 0 ? extension.slice(1) : null;
}

function assertEHentaiNotCanceled(): void {
  if (ehentaiImportCanceled) {
    throw new Error("已取消 E-Hentai 导入");
  }
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function createEHentaiProgress(
  overrides: Partial<EHentaiImportProgress>,
): EHentaiImportProgress {
  return {
    phase: "idle",
    total: 0,
    processed: 0,
    imported: 0,
    duplicated: 0,
    skipped: 0,
    failed: 0,
    currentFile: null,
    message: "",
    ...overrides,
  };
}

function emitEHentaiProgress(
  sender: WebContents,
  progress: EHentaiImportProgress,
): void {
  sender.send("ehentai-import:progress", progress);
}
