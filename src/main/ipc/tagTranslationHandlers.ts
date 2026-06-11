import type { IpcMain, WebContents } from "electron";
import type {
  FilesChangedPayload,
  TagTranslationSettings,
  TagTranslationSummary,
} from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";
import { normalizeTagTranslationSettings } from "../settings/normalizers.js";

type NormalizeIpcFileIds = (value: unknown) => number[];

export interface TagTranslationHandlersContext {
  getTagTranslationSettings: () => TagTranslationSettings;
  setTagTranslationSettings: (
    settings: TagTranslationSettings,
  ) => TagTranslationSettings;
  chooseTagTranslationCsv: (sender: WebContents) => Promise<string | null>;
  translateFileTags: (
    fileIds: number[],
    onProgress?: (completed: number, total: number) => void,
  ) => TagTranslationSummary;
  beginTagTranslationWorkStatus: (total: number) => void;
  updateTagTranslationWorkStatus: (completed: number, total: number) => void;
  finishTagTranslationWorkStatus: () => void;
  broadcastFilesChanged: (payload?: Partial<FilesChangedPayload>) => void;
  normalizeIpcFileIds: NormalizeIpcFileIds;
}

export function registerTagTranslationHandlers(
  ipcMain: IpcMain,
  context: TagTranslationHandlersContext,
): void {
  ipcMain.handle(IpcChannel.TAG_TRANSLATION_GET_SETTINGS, () =>
    context.getTagTranslationSettings(),
  );
  ipcMain.handle(
    IpcChannel.TAG_TRANSLATION_UPDATE_SETTINGS,
    (_event, settings: unknown) =>
      context.setTagTranslationSettings(
        normalizeTagTranslationSettings(settings),
      ),
  );
  ipcMain.handle(IpcChannel.TAG_TRANSLATION_SELECT_CSV, (event) =>
    context.chooseTagTranslationCsv(event.sender),
  );
  ipcMain.handle(
    IpcChannel.TAG_TRANSLATION_TRANSLATE_FILES,
    (_event, fileIds: unknown) => {
      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);
      context.beginTagTranslationWorkStatus(normalizedFileIds.length);

      try {
        const result = context.translateFileTags(
          normalizedFileIds,
          (completed, total) => {
            context.updateTagTranslationWorkStatus(completed, total);
          },
        );
        context.broadcastFilesChanged({
          kind: "tags",
          fileIds: normalizedFileIds,
        });
        return result;
      } finally {
        context.finishTagTranslationWorkStatus();
      }
    },
  );
}
