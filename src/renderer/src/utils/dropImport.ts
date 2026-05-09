export interface DroppedImportData {
  files: File[];
  urls: string[];
}

export function readDroppedImportData(
  dataTransfer: DataTransfer,
): DroppedImportData {
  return {
    files: Array.from(dataTransfer.files),
    urls: extractDroppedUrls(dataTransfer),
  };
}

function extractDroppedUrls(dataTransfer: DataTransfer): string[] {
  const candidates = [
    ...splitUriList(dataTransfer.getData("text/uri-list")),
    dataTransfer.getData("URL"),
    dataTransfer.getData("text/plain"),
    ...extractUrlsFromHtml(dataTransfer.getData("text/html")),
  ];
  const urls: string[] = [];

  for (const candidate of candidates) {
    const url = normalizeDroppedUrl(candidate);

    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }

  return urls;
}

function splitUriList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function extractUrlsFromHtml(html: string): string[] {
  if (!html.trim()) {
    return [];
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  const mediaUrls: string[] = [];

  for (const selector of [
    "img[src]",
    "video[src]",
    "audio[src]",
    "source[src]",
  ]) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const value = element.getAttribute("src");

      if (value) {
        mediaUrls.push(value);
      }
    }
  }

  if (mediaUrls.length > 0) {
    return mediaUrls;
  }

  return Array.from(document.querySelectorAll("a[href]"))
    .map((element) =>
      element instanceof HTMLAnchorElement
        ? element.href
        : element.getAttribute("href"),
    )
    .filter((value): value is string => Boolean(value));
}

function normalizeDroppedUrl(value: string): string | null {
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
