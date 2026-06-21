import type { FilesChangedPayload } from "../../../shared/ipc";

export function filesChangedIncludesAny(
  payload: FilesChangedPayload,
  fileIds: readonly number[],
): boolean {
  if (payload.fullRefresh || !payload.fileIds) {
    return true;
  }

  if (fileIds.length === 0) {
    return false;
  }

  const changedIds = new Set(payload.fileIds);
  return fileIds.some((fileId) => changedIds.has(fileId));
}

export function filesChangedIncludes(
  payload: FilesChangedPayload,
  fileId: number | null,
): boolean {
  return (
    fileId !== null &&
    (payload.fullRefresh || !payload.fileIds || payload.fileIds.includes(fileId))
  );
}

export function filesChangedAffectsBrowserPage(
  payload: FilesChangedPayload,
  visibleFileIds: readonly number[],
  hasSearchQuery: boolean,
): boolean {
  if (payload.fullRefresh || !payload.fileIds) {
    return true;
  }

  if (
    payload.kind === "deleted" ||
    payload.kind === "domain" ||
    payload.kind === "imported" ||
    payload.kind === "restored" ||
    payload.kind === "trashed" ||
    payload.kind === "mixed"
  ) {
    return true;
  }

  if (hasSearchQuery && (payload.kind === "ai-tags" || payload.kind === "tags")) {
    return true;
  }

  return filesChangedIncludesAny(payload, visibleFileIds);
}

export function filesChangedAffectsTagCatalog(
  payload: FilesChangedPayload,
): boolean {
  return (
    payload.fullRefresh === true ||
    payload.kind === "ai-tags" ||
    payload.kind === "deleted" ||
    payload.kind === "domain" ||
    payload.kind === "imported" ||
    payload.kind === "mixed" ||
    payload.kind === "ratings" ||
    payload.kind === "relations" ||
    payload.kind === "restored" ||
    payload.kind === "tags" ||
    payload.kind === "trashed" ||
    payload.kind === "unknown"
  );
}
