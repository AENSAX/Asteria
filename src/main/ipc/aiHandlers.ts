import { BrowserWindow, type IpcMain, type WebContents } from "electron";
import type {
  AiModelCatalog,
  AiModelInfo,
  AiSettings,
  AiTaggingSummary,
  ConfirmDialogOptions,
  FilesChangedPayload,
  OperationProgress,
  SettingsChangedPayload,
} from "../../shared/ipc.js";
import { IpcChannel } from "../../shared/ipcChannels.js";
import type { AiDownloadProgress } from "../aiService.js";
import { normalizeAiSettings } from "../settings/normalizers.js";

type NormalizeIpcFileIds = (value: unknown) => number[];

export interface AiHandlersContext {
  getAiSettings: () => AiSettings;
  setAiSettings: (settings: AiSettings) => AiSettings;
  broadcastSettingsChanged: (kind: SettingsChangedPayload["kind"]) => void;
  chooseAiModelDirectory: (sender: WebContents) => Promise<string | null>;
  detectAiModel: (modelPath: string) => Promise<AiModelInfo>;
  detectAiModels: (
    modelPath: string,
    selectedModelName?: string,
  ) => Promise<AiModelCatalog>;
  defaultAiModelExists: (modelPath: string) => Promise<boolean>;
  downloadDefaultAiModel: (
    modelPath: string,
    onProgress?: (progress: AiDownloadProgress) => void,
  ) => Promise<AiModelInfo>;
  tagFilesWithAi: (
    fileIds: number[],
    overwrite: boolean,
  ) => Promise<AiTaggingSummary>;
  openAlertDialog: (
    options: ConfirmDialogOptions,
    parent?: BrowserWindow | null,
  ) => Promise<void>;
  openProgressDialog: (
    progress: OperationProgress,
    parent?: BrowserWindow | null,
  ) => string;
  updateProgressDialog: (id: string, progress: OperationProgress) => void;
  broadcastFilesChanged: (payload?: Partial<FilesChangedPayload>) => void;
  normalizeIpcFileIds: NormalizeIpcFileIds;
}

function buildAiTaggingMessage(result: AiTaggingSummary): string {
  const lines = [
    `总数: ${result.total}`,
    `已打标: ${result.tagged}`,
    `已跳过: ${result.skipped}`,
    `失败: ${result.failed}`,
  ];

  const firstFailure = result.failures[0];

  if (firstFailure) {
    lines.push(`首个失败: #${firstFailure.fileId} ${firstFailure.message}`);
  }

  return lines.join("\n");
}

function getAiTaggingSummaryMessageKey(result: AiTaggingSummary): string {
  return result.failures[0]
    ? "window.ai.taggingSummaryWithFailure"
    : "window.ai.taggingSummary";
}

function buildAiTaggingSummaryMessageValues(
  result: AiTaggingSummary,
): Record<string, string | number> {
  const firstFailure = result.failures[0];
  return {
    total: result.total,
    tagged: result.tagged,
    skipped: result.skipped,
    failed: result.failed,
    firstFailureFileId: firstFailure?.fileId ?? "",
    firstFailureMessage: firstFailure?.message ?? "",
  };
}

function createEmptyAiTaggingSummary(): AiTaggingSummary {
  return {
    total: 0,
    tagged: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };
}

export function registerAiHandlers(
  ipcMain: IpcMain,
  context: AiHandlersContext,
): void {
  ipcMain.handle(IpcChannel.AI_GET_SETTINGS, () => context.getAiSettings());
  ipcMain.handle(IpcChannel.AI_UPDATE_SETTINGS, (_event, settings: unknown) => {
    const nextSettings = context.setAiSettings(normalizeAiSettings(settings));
    context.broadcastSettingsChanged("ai");
    return nextSettings;
  });
  ipcMain.handle(IpcChannel.AI_SELECT_MODEL_DIRECTORY, (event) =>
    context.chooseAiModelDirectory(event.sender),
  );
  ipcMain.handle(IpcChannel.AI_DETECT_MODEL, (_event, modelPath: unknown) =>
    context.detectAiModel(typeof modelPath === "string" ? modelPath : ""),
  );
  ipcMain.handle(
    IpcChannel.AI_DETECT_MODELS,
    (_event, modelPath: unknown, selectedModelName: unknown) =>
      context.detectAiModels(
        typeof modelPath === "string" ? modelPath : "",
        typeof selectedModelName === "string" ? selectedModelName : "",
      ),
  );
  ipcMain.handle(
    IpcChannel.AI_DOWNLOAD_DEFAULT_MODEL,
    async (event, modelPath: unknown) => {
      const normalizedPath =
        typeof modelPath === "string" ? modelPath.trim() : "";
      const parentWindow = BrowserWindow.fromWebContents(event.sender);

      if (!normalizedPath) {
        await context.openAlertDialog(
          {
            title: "模型路径为空",
            titleKey: "window.ai.emptyModelPathTitle",
            message: "请先配置模型路径。",
            messageKey: "window.ai.emptyModelPathMessage",
            confirmTextKey: "common.ok",
          },
          parentWindow,
        );
        return context.detectAiModel("");
      }

      if (await context.defaultAiModelExists(normalizedPath)) {
        await context.openAlertDialog(
          {
            title: "默认模型已存在",
            titleKey: "window.ai.downloadDefault",
            message: "模型路径下已经存在默认模型。",
            messageKey: "window.ai.downloadAlreadyExists",
            confirmTextKey: "common.ok",
          },
          parentWindow,
        );
        return context.detectAiModel(normalizedPath);
      }

      const progressDialogId = context.openProgressDialog(
        {
          title: "下载默认模型",
          titleKey: "window.ai.downloadDefault",
          total: 200,
          processed: 0,
          message: "准备下载默认模型",
          messageKey: "window.ai.downloadPreparing",
          completed: false,
        },
        parentWindow,
      );

      try {
        const result = await context.downloadDefaultAiModel(
          normalizedPath,
          (progress) => {
            const filePercent =
              progress.totalBytes > 0
                ? Math.min(
                    99,
                    Math.floor(
                      (progress.downloadedBytes / progress.totalBytes) * 100,
                    ),
                  )
                : 0;

            context.updateProgressDialog(progressDialogId, {
              title: "下载默认模型",
              titleKey: "window.ai.downloadDefault",
              total: progress.totalFiles * 100,
              processed: Math.min(
                progress.totalFiles * 100,
                progress.completedFiles * 100 + filePercent,
              ),
              message: `正在下载 ${progress.fileName}`,
              messageKey: "window.ai.downloadingFile",
              messageValues: { fileName: progress.fileName },
              completed: false,
            });
          },
        );

        context.updateProgressDialog(progressDialogId, {
          title: "下载默认模型",
          titleKey: "window.ai.downloadDefault",
          total: 200,
          processed: 200,
          message: "默认模型下载完成",
          messageKey: "window.ai.downloadComplete",
          completed: true,
        });

        return result;
      } catch (error) {
        context.updateProgressDialog(progressDialogId, {
          title: "下载默认模型",
          titleKey: "window.ai.downloadDefault",
          total: 200,
          processed: 0,
          message: "默认模型下载失败",
          messageKey: "window.ai.downloadFailed",
          completed: true,
        });

        await context.openAlertDialog(
          {
            title: "默认模型下载失败",
            titleKey: "window.ai.downloadFailed",
            message:
              error instanceof Error ? error.message : "默认模型下载失败",
            ...(error instanceof Error
              ? {}
              : { messageKey: "window.ai.downloadFailed" }),
            confirmTextKey: "common.ok",
          },
          parentWindow,
        );

        return context.detectAiModel(normalizedPath);
      }
    },
  );
  ipcMain.handle(
    IpcChannel.AI_TAG_FILES,
    async (event, fileIds: unknown, overwrite: unknown) => {
      const normalizedFileIds = context.normalizeIpcFileIds(fileIds);
      const parentWindow = BrowserWindow.fromWebContents(event.sender);

      if (normalizedFileIds.length === 0) {
        await context.openAlertDialog(
          {
            title: "人工智能打标",
            titleKey: "window.ai.taggingTitle",
            message: "没有可打标文件。",
            messageKey: "window.ai.noTaggableFiles",
            confirmTextKey: "common.ok",
          },
          parentWindow,
        );
        return createEmptyAiTaggingSummary();
      }

      const result = await context.tagFilesWithAi(
        normalizedFileIds,
        overwrite === true,
      );
      context.broadcastFilesChanged({
        kind: "ai-tags",
        fileIds: normalizedFileIds,
      });

      await context.openAlertDialog(
        {
          title: "人工智能打标",
          titleKey: "window.ai.taggingTitle",
          message: buildAiTaggingMessage(result),
          messageKey: getAiTaggingSummaryMessageKey(result),
          messageValues: buildAiTaggingSummaryMessageValues(result),
          confirmTextKey: "common.ok",
        },
        parentWindow,
      );

      return result;
    },
  );
}
