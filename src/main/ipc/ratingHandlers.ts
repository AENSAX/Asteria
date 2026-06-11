import type { IpcMain } from "electron";
import type {
  FilesChangedPayload,
  RatingEntryRecord,
  RatingGroupRecord,
} from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";
import { createLocalizedIpcError } from "./ipcErrors.js";

type NormalizeIpcFileIds = (value: unknown) => number[];

export interface RatingHandlersContext {
  listRatingGroups: () => RatingGroupRecord[];
  createRatingGroup: (name: string) => RatingGroupRecord[];
  renameRatingGroup: (groupId: number, name: string) => RatingGroupRecord[];
  setRatingGroupActive: (
    groupId: number,
    active: boolean,
  ) => RatingGroupRecord[];
  deleteRatingGroup: (groupId: number) => RatingGroupRecord[];
  listRatingEntries: (groupId: number) => RatingEntryRecord[];
  createRatingEntry: (
    groupId: number,
    label: string,
    color: string,
  ) => RatingEntryRecord[];
  updateRatingEntry: (
    entryId: number,
    label: string,
    color: string,
  ) => RatingEntryRecord[];
  deleteRatingEntry: (entryId: number) => RatingEntryRecord[];
  reorderRatingEntries: (
    groupId: number,
    entryIds: number[],
  ) => RatingEntryRecord[];
  setFileRatingEntries: (
    fileIds: number[],
    groupId: number,
    entryIds: number[],
  ) => void;
  broadcastFilesChanged: (payload?: Partial<FilesChangedPayload>) => void;
  normalizeIpcFileIds: NormalizeIpcFileIds;
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => typeof item === "number");
}

export function registerRatingHandlers(
  ipcMain: IpcMain,
  context: RatingHandlersContext,
): void {
  ipcMain.handle(IpcChannel.RATING_LIST_GROUPS, () =>
    context.listRatingGroups(),
  );
  ipcMain.handle(
    IpcChannel.RATING_CREATE_GROUP,
    async (event, name: unknown) => {
      if (typeof name !== "string") {
        throw await createLocalizedIpcError(
          event.sender,
          "rating.invalidGroup",
        );
      }

      return context.createRatingGroup(name);
    },
  );
  ipcMain.handle(
    IpcChannel.RATING_RENAME_GROUP,
    async (event, groupId: unknown, name: unknown) => {
      if (typeof groupId !== "number" || typeof name !== "string") {
        throw await createLocalizedIpcError(
          event.sender,
          "rating.invalidGroup",
        );
      }

      return context.renameRatingGroup(groupId, name);
    },
  );
  ipcMain.handle(
    IpcChannel.RATING_SET_GROUP_ACTIVE,
    async (event, groupId: unknown, active: unknown) => {
      if (typeof groupId !== "number" || typeof active !== "boolean") {
        throw await createLocalizedIpcError(
          event.sender,
          "rating.invalidGroup",
        );
      }

      const groups = context.setRatingGroupActive(groupId, active);
      context.broadcastFilesChanged({
        kind: "ratings",
        fullRefresh: true,
      });
      return groups;
    },
  );
  ipcMain.handle(
    IpcChannel.RATING_DELETE_GROUP,
    async (event, groupId: unknown) => {
      if (typeof groupId !== "number") {
        throw await createLocalizedIpcError(
          event.sender,
          "rating.invalidGroup",
        );
      }

      const groups = context.deleteRatingGroup(groupId);
      context.broadcastFilesChanged({
        kind: "ratings",
        fullRefresh: true,
      });
      return groups;
    },
  );
  ipcMain.handle(IpcChannel.RATING_LIST_ENTRIES, (_event, groupId: unknown) => {
    if (typeof groupId !== "number") {
      return [];
    }

    return context.listRatingEntries(groupId);
  });
  ipcMain.handle(
    IpcChannel.RATING_CREATE_ENTRY,
    async (event, groupId: unknown, label: unknown, color: unknown) => {
      if (
        typeof groupId !== "number" ||
        typeof label !== "string" ||
        typeof color !== "string"
      ) {
        throw await createLocalizedIpcError(
          event.sender,
          "rating.invalidEntry",
        );
      }

      return context.createRatingEntry(groupId, label, color);
    },
  );
  ipcMain.handle(
    IpcChannel.RATING_UPDATE_ENTRY,
    async (event, entryId: unknown, label: unknown, color: unknown) => {
      if (
        typeof entryId !== "number" ||
        typeof label !== "string" ||
        typeof color !== "string"
      ) {
        throw await createLocalizedIpcError(
          event.sender,
          "rating.invalidEntry",
        );
      }

      const entries = context.updateRatingEntry(entryId, label, color);
      context.broadcastFilesChanged({
        kind: "ratings",
        fullRefresh: true,
      });
      return entries;
    },
  );
  ipcMain.handle(
    IpcChannel.RATING_DELETE_ENTRY,
    async (event, entryId: unknown) => {
      if (typeof entryId !== "number") {
        throw await createLocalizedIpcError(
          event.sender,
          "rating.invalidEntry",
        );
      }

      const entries = context.deleteRatingEntry(entryId);
      context.broadcastFilesChanged({
        kind: "ratings",
        fullRefresh: true,
      });
      return entries;
    },
  );
  ipcMain.handle(
    IpcChannel.RATING_REORDER_ENTRIES,
    async (event, groupId: unknown, entryIds: unknown) => {
      if (typeof groupId !== "number" || !Array.isArray(entryIds)) {
        throw await createLocalizedIpcError(
          event.sender,
          "rating.invalidEntryOrder",
        );
      }

      const entries = context.reorderRatingEntries(
        groupId,
        normalizeNumberArray(entryIds),
      );
      context.broadcastFilesChanged({
        kind: "ratings",
        fullRefresh: true,
      });
      return entries;
    },
  );
  ipcMain.handle(
    IpcChannel.RATING_SET_FILE_ENTRIES,
    async (event, fileIds: unknown, groupId: unknown, entryIds: unknown) => {
      if (typeof groupId !== "number" || !Array.isArray(entryIds)) {
        throw await createLocalizedIpcError(
          event.sender,
          "rating.invalidSettings",
        );
      }

      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);
      context.setFileRatingEntries(
        normalizedFileIds,
        groupId,
        normalizeNumberArray(entryIds),
      );
      context.broadcastFilesChanged({
        kind: "ratings",
        fileIds: normalizedFileIds,
      });
    },
  );
}
