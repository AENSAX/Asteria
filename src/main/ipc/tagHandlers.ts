import type { IpcMain, WebContents } from "electron";
import type {
  BatchFileTagRecord,
  DeleteManagedTagsResult,
  DeleteTagStyleResult,
  FileTagRecord,
  FilesChangedPayload,
  ManagedTagRecord,
  ManagedTagRenamePreview,
  ManagedTagSortKey,
  SearchHintRecord,
  SortDirection,
  TagDraft,
  TagParentRecord,
  TagRecord,
  TagRelationTree,
  TagRelationTreeKind,
  TagSiblingRecord,
  TagStyleRecord,
} from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";
import { createLocalizedIpcError } from "./ipcErrors.js";

type NormalizeIpcFileIds = (value: unknown) => number[];

export interface TagHandlersContext {
  listFileTags: (fileId: number) => FileTagRecord[];
  listFileParentTags: (fileId: number) => FileTagRecord[];
  listBatchFileTags: (fileIds: number[]) => BatchFileTagRecord[];
  listBatchEffectiveFileTags: (fileIds: number[]) => BatchFileTagRecord[];
  searchTags: (query: string) => TagRecord[];
  searchHints: (query: string) => SearchHintRecord[];
  listTagStyles: () => TagStyleRecord[];
  createTagStyle: (name: string) => TagStyleRecord[];
  renameTagStyle: (styleId: number, name: string) => TagStyleRecord[];
  setActiveTagStyle: (styleId: number) => TagStyleRecord[];
  deleteTagStyle: (styleId: number) => DeleteTagStyleResult;
  listManagedTags: (
    styleId: number,
    sortKey: ManagedTagSortKey,
    direction: SortDirection,
  ) => ManagedTagRecord[];
  listTagParents: () => TagParentRecord[];
  listTagSiblings: () => TagSiblingRecord[];
  getTagRelationTree: (
    tagIds: number[],
    kind: TagRelationTreeKind,
  ) => TagRelationTree;
  addTagParent: (childTagId: number, parentTagId: number) => TagParentRecord;
  removeTagParent: (childTagId: number, parentTagId: number) => void;
  addTagSibling: (
    aliasTagId: number,
    canonicalTagId: number,
  ) => TagSiblingRecord;
  removeTagSibling: (aliasTagId: number) => void;
  createManagedTag: (styleId: number, tag: TagDraft) => ManagedTagRecord;
  renameManagedTag: (tagId: number, tag: TagDraft) => ManagedTagRecord;
  previewManagedTagRename: (
    tagId: number,
    tag: TagDraft,
  ) => ManagedTagRenamePreview;
  deleteManagedTag: (tagId: number) => DeleteManagedTagsResult;
  deleteManagedTags: (tagIds: number[]) => DeleteManagedTagsResult;
  addFileTags: (fileId: number, tags: TagDraft[]) => FileTagRecord[];
  removeFileTags: (fileId: number, tagIds: number[]) => FileTagRecord[];
  addTagsToFiles: (fileIds: number[], tags: TagDraft[]) => BatchFileTagRecord[];
  removeTagsFromFiles: (
    fileIds: number[],
    tagIds: number[],
  ) => BatchFileTagRecord[];
  broadcastFilesChanged: (payload?: Partial<FilesChangedPayload>) => void;
  normalizeIpcFileIds: NormalizeIpcFileIds;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isTagDraft(value: unknown): value is TagDraft {
  if (!value || typeof value !== "object") {
    return false;
  }

  const draft = value as Partial<TagDraft>;

  return (
    (draft.id === undefined || typeof draft.id === "number") &&
    typeof draft.namespace === "string" &&
    typeof draft.name === "string"
  );
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => typeof item === "number");
}

function normalizeManagedTagSortKey(value: unknown): ManagedTagSortKey {
  return value === "createdAt" || value === "fileCount" ? value : "name";
}

function normalizeSortDirection(value: unknown): SortDirection {
  return value === "desc" ? "desc" : "asc";
}

function normalizeTagRelationTreeKind(value: unknown): TagRelationTreeKind {
  return value === "sibling" ? "sibling" : "parent";
}

async function normalizeTagPair(
  sender: WebContents,
  left: unknown,
  right: unknown,
  key: "tag.invalidParentRelation" | "tag.invalidSiblingRelation",
): Promise<[number, number]> {
  if (!isPositiveInteger(left) || !isPositiveInteger(right)) {
    throw await createLocalizedIpcError(sender, key);
  }

  return [left, right];
}

export function registerTagHandlers(
  ipcMain: IpcMain,
  context: TagHandlersContext,
): void {
  ipcMain.handle(IpcChannel.TAG_LIST_FILE_TAGS, (_event, fileId: unknown) => {
    if (!isPositiveInteger(fileId)) {
      return [];
    }

    return context.listFileTags(fileId);
  });
  ipcMain.handle(
    IpcChannel.TAG_LIST_FILE_PARENT_TAGS,
    (_event, fileId: unknown) => {
      if (!isPositiveInteger(fileId)) {
        return [];
      }

      return context.listFileParentTags(fileId);
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_LIST_BATCH_FILE_TAGS,
    (_event, fileIds: unknown) =>
      context.listBatchFileTags(context.normalizeIpcFileIds(fileIds)),
  );
  ipcMain.handle(
    IpcChannel.TAG_LIST_BATCH_EFFECTIVE_FILE_TAGS,
    (_event, fileIds: unknown) =>
      context.listBatchEffectiveFileTags(context.normalizeIpcFileIds(fileIds)),
  );
  ipcMain.handle(IpcChannel.TAG_SEARCH, (_event, query: unknown) =>
    context.searchTags(typeof query === "string" ? query : ""),
  );
  ipcMain.handle(IpcChannel.SEARCH_HINTS, (_event, query: unknown) =>
    context.searchHints(typeof query === "string" ? query : ""),
  );
  ipcMain.handle(IpcChannel.TAG_LIST_STYLES, () => context.listTagStyles());
  ipcMain.handle(IpcChannel.TAG_CREATE_STYLE, async (event, name: unknown) => {
    if (typeof name !== "string") {
      throw await createLocalizedIpcError(event.sender, "tag.invalidStyleName");
    }

    return context.createTagStyle(name);
  });
  ipcMain.handle(
    IpcChannel.TAG_RENAME_STYLE,
    async (event, styleId: unknown, name: unknown) => {
      if (!isPositiveInteger(styleId) || typeof name !== "string") {
        throw await createLocalizedIpcError(event.sender, "tag.invalidStyle");
      }

      const styles = context.renameTagStyle(styleId, name);
      context.broadcastFilesChanged({
        kind: "metadata",
        fullRefresh: true,
      });
      return styles;
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_SET_ACTIVE_STYLE,
    async (event, styleId: unknown) => {
      if (!isPositiveInteger(styleId)) {
        throw await createLocalizedIpcError(event.sender, "tag.invalidStyle");
      }

      return context.setActiveTagStyle(styleId);
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_DELETE_STYLE,
    async (event, styleId: unknown) => {
      if (!isPositiveInteger(styleId)) {
        throw await createLocalizedIpcError(event.sender, "tag.invalidStyle");
      }

      const result = context.deleteTagStyle(styleId);
      context.broadcastFilesChanged({
        kind: "metadata",
        fullRefresh: true,
      });
      return result;
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_LIST_MANAGED_TAGS,
    (_event, styleId: unknown, sortKey: unknown, direction: unknown) => {
      if (!isPositiveInteger(styleId)) {
        return [];
      }

      return context.listManagedTags(
        styleId,
        normalizeManagedTagSortKey(sortKey),
        normalizeSortDirection(direction),
      );
    },
  );
  ipcMain.handle(IpcChannel.TAG_LIST_PARENTS, () => context.listTagParents());
  ipcMain.handle(IpcChannel.TAG_LIST_SIBLINGS, () => context.listTagSiblings());
  ipcMain.handle(
    IpcChannel.TAG_GET_RELATION_TREE,
    (_event, tagIds: unknown, kind: unknown) =>
      context.getTagRelationTree(
        context.normalizeIpcFileIds(tagIds),
        normalizeTagRelationTreeKind(kind),
      ),
  );
  ipcMain.handle(
    IpcChannel.TAG_ADD_PARENT,
    async (event, childTagId: unknown, parentTagId: unknown) => {
      const [childId, parentId] = await normalizeTagPair(
        event.sender,
        childTagId,
        parentTagId,
        "tag.invalidParentRelation",
      );

      const parent = context.addTagParent(childId, parentId);
      context.broadcastFilesChanged({
        kind: "relations",
        fullRefresh: true,
      });
      return parent;
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_REMOVE_PARENT,
    async (event, childTagId: unknown, parentTagId: unknown) => {
      const [childId, parentId] = await normalizeTagPair(
        event.sender,
        childTagId,
        parentTagId,
        "tag.invalidParentRelation",
      );

      context.removeTagParent(childId, parentId);
      context.broadcastFilesChanged({
        kind: "relations",
        fullRefresh: true,
      });
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_ADD_SIBLING,
    async (event, aliasTagId: unknown, canonicalTagId: unknown) => {
      const [aliasId, canonicalId] = await normalizeTagPair(
        event.sender,
        aliasTagId,
        canonicalTagId,
        "tag.invalidSiblingRelation",
      );

      const sibling = context.addTagSibling(aliasId, canonicalId);
      context.broadcastFilesChanged({
        kind: "relations",
        fullRefresh: true,
      });
      return sibling;
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_REMOVE_SIBLING,
    async (event, aliasTagId: unknown) => {
      if (!isPositiveInteger(aliasTagId)) {
        throw await createLocalizedIpcError(
          event.sender,
          "tag.invalidSiblingRelation",
        );
      }

      context.removeTagSibling(aliasTagId);
      context.broadcastFilesChanged({
        kind: "relations",
        fullRefresh: true,
      });
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_CREATE_MANAGED_TAG,
    async (event, styleId: unknown, tag: unknown) => {
      if (!isPositiveInteger(styleId) || !isTagDraft(tag)) {
        throw await createLocalizedIpcError(event.sender, "tag.invalidTag");
      }

      return context.createManagedTag(styleId, tag);
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_RENAME_MANAGED_TAG,
    async (event, tagId: unknown, tag: unknown) => {
      if (!isPositiveInteger(tagId) || !isTagDraft(tag)) {
        throw await createLocalizedIpcError(event.sender, "tag.invalidTag");
      }

      const renamed = context.renameManagedTag(tagId, tag);
      context.broadcastFilesChanged({
        kind: "tags",
        fullRefresh: true,
      });
      return renamed;
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_PREVIEW_MANAGED_RENAME,
    async (event, tagId: unknown, tag: unknown) => {
      if (!isPositiveInteger(tagId) || !isTagDraft(tag)) {
        throw await createLocalizedIpcError(event.sender, "tag.invalidTag");
      }

      return context.previewManagedTagRename(tagId, tag);
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_DELETE_MANAGED_TAG,
    async (event, tagId: unknown) => {
      if (!isPositiveInteger(tagId)) {
        throw await createLocalizedIpcError(event.sender, "tag.invalidTag");
      }

      const result = context.deleteManagedTag(tagId);
      context.broadcastFilesChanged({
        kind: "tags",
        fullRefresh: true,
      });
      return result;
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_DELETE_MANAGED_TAGS,
    async (event, tagIds: unknown) => {
      if (!Array.isArray(tagIds)) {
        throw await createLocalizedIpcError(event.sender, "tag.invalidTag");
      }

      const result = context.deleteManagedTags(normalizeNumberArray(tagIds));
      context.broadcastFilesChanged({
        kind: "tags",
        fullRefresh: true,
      });
      return result;
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_ADD_FILE_TAGS,
    (_event, fileId: unknown, tags: unknown) => {
      if (!isPositiveInteger(fileId) || !Array.isArray(tags)) {
        return [];
      }

      const fileTags = context.addFileTags(fileId, tags.filter(isTagDraft));
      context.broadcastFilesChanged({
        kind: "tags",
        fileIds: [fileId],
      });
      return fileTags;
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_REMOVE_FILE_TAGS,
    (_event, fileId: unknown, tagIds: unknown) => {
      if (!isPositiveInteger(fileId) || !Array.isArray(tagIds)) {
        return [];
      }

      const fileTags = context.removeFileTags(
        fileId,
        normalizeNumberArray(tagIds),
      );
      context.broadcastFilesChanged({
        kind: "tags",
        fileIds: [fileId],
      });
      return fileTags;
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_ADD_TAGS_TO_FILES,
    (_event, fileIds: unknown, tags: unknown) => {
      if (!Array.isArray(tags)) {
        return [];
      }

      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);
      const fileTags = context.addTagsToFiles(
        normalizedFileIds,
        tags.filter(isTagDraft),
      );
      context.broadcastFilesChanged({
        kind: "tags",
        fileIds: normalizedFileIds,
      });
      return fileTags;
    },
  );
  ipcMain.handle(
    IpcChannel.TAG_REMOVE_TAGS_FROM_FILES,
    (_event, fileIds: unknown, tagIds: unknown) => {
      if (!Array.isArray(tagIds)) {
        return [];
      }

      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);
      const fileTags = context.removeTagsFromFiles(
        normalizedFileIds,
        normalizeNumberArray(tagIds),
      );
      context.broadcastFilesChanged({
        kind: "tags",
        fileIds: normalizedFileIds,
      });
      return fileTags;
    },
  );
}
