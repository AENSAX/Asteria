import { useEffect, useMemo, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js";
import "monaco-editor/min/vs/editor/editor.main.css";
import type {
  BrowserFileRecord,
  FileTagRecord,
  FileUrlRecord,
  TagDraft,
} from "../../../shared/ipc";
import { IMAGE_EXTENSIONS } from "../../../shared/media";
import {
  useLanguage,
  type TranslationFunction,
  type TranslationKey,
  type TranslationValues,
} from "../utils/language";

interface BatchOperationWindowProps {
  fileIds: number[];
}

type ProcessFunction = (
  context: BatchImageProcessContext,
) => void | Promise<void>;

interface BatchImageProcessContext {
  file: BrowserFileRecord;
  index: number;
  total: number;
  tags: FileTagRecord[];
  urls: FileUrlRecord[];
  addTags: (tags: TagDraft[]) => Promise<FileTagRecord[]>;
  removeTags: (tagIds: number[]) => Promise<FileTagRecord[]>;
  addUrl: (url: string) => Promise<FileUrlRecord[]>;
  updateUrl: (
    urlId: number,
    nextUrl: string,
    previousUrl?: string,
  ) => Promise<FileUrlRecord[]>;
  removeUrl: (urlId: number, url?: string) => Promise<FileUrlRecord[]>;
}

interface BatchLogItem {
  fileId: number;
  fileName: string;
  status: "success" | "failed" | "skipped";
  message: string;
}

type BatchMessage =
  | {
      kind: "key";
      key: TranslationKey;
      values?: TranslationValues;
    }
  | {
      kind: "text";
      text: string;
    };

const defaultScript = `/**
 * type BatchImageProcessContext = {
 *   file: {
 *     id: number;
 *     fileName: string;
 *     extension: string | null;
 *     originalPath: string;
 *     importedAt: string;
 *     updatedAt: string;
 *     domain: "pending" | "library" | "trash";
 *     isFavorite: boolean;
 *   };
 *   index: number;
 *   total: number;
 *   tags: Array<{
 *     id: number;
 *     styleName: string;
 *     namespace: string;
 *     name: string;
 *     displayName: string | null;
 *     createdAt: string;
 *   }>;
 *   urls: Array<{
 *     id: number;
 *     fileId: number;
 *     url: string;
 *     normalizedUrl: string | null;
 *     source: string | null;
 *     createdAt: string;
 *     updatedAt: string;
 *   }>;
 *   addTags: (tags: Array<{ namespace: string; name: string; id?: number }>) => Promise<BatchImageProcessContext["tags"]>;
 *   removeTags: (tagIds: number[]) => Promise<BatchImageProcessContext["tags"]>;
 *   addUrl: (url: string) => Promise<BatchImageProcessContext["urls"]>;
 *   updateUrl: (urlId: number, nextUrl: string, previousUrl?: string) => Promise<BatchImageProcessContext["urls"]>;
 *   removeUrl: (urlId: number, url?: string) => Promise<BatchImageProcessContext["urls"]>;
 * };
 */
async function process(context) {
  if (context.file.importedAt.startsWith("2026")) {
    await context.addTags([{ namespace: "year", name: "2026" }]);
  }
}`;

export function BatchOperationWindow({
  fileIds,
}: BatchOperationWindowProps): JSX.Element {
  const { t } = useLanguage();
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [files, setFiles] = useState<BrowserFileRecord[]>([]);
  const [script, setScript] = useState(defaultScript);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<BatchMessage>({
    kind: "key",
    key: "window.batchOperation.loading",
  });
  const [processedCount, setProcessedCount] = useState(0);
  const [logs, setLogs] = useState<BatchLogItem[]>([]);
  const fileIdKey = fileIds.join(",");

  const imageFiles = useMemo(
    () => files.filter(isImageFile),
    [files],
  );

  useEffect(() => {
    resetRunState();
    void loadFiles();
  }, [fileIdKey]);

  useEffect(() => {
    if (!editorContainerRef.current || editorRef.current) {
      return;
    }

    editorRef.current = monaco.editor.create(editorContainerRef.current, {
      value: defaultScript,
      language: "javascript",
      theme: "vs-light",
      automaticLayout: true,
      fontSize: 12,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
    });

    const disposable = editorRef.current.onDidChangeModelContent(() => {
      setScript(editorRef.current?.getValue() ?? "");
    });

    return () => {
      disposable.dispose();
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  async function loadFiles(): Promise<void> {
    if (!window.asteria || fileIds.length === 0) {
      setFiles([]);
      setMessage({ kind: "key", key: "window.batchOperation.invalid" });
      return;
    }

    const idSet = new Set(fileIds);
    const selectedFiles = (await window.asteria.listBrowserFiles()).filter(
      (file) => idSet.has(file.id),
    );

    setFiles(selectedFiles);
    setMessage({
      kind: "key",
      key: "window.batchOperation.count",
      values: {
        count: selectedFiles.length,
        imageCount: selectedFiles.filter(isImageFile).length,
      },
    });
  }

  async function runBatchOperation(): Promise<void> {
    if (!window.asteria || running) {
      return;
    }

    let processImage: ProcessFunction;

    try {
      processImage = compileProcessFunction(script, t);
    } catch (error) {
      setMessage({
        kind: "text",
        text:
          error instanceof Error ? error.message : t("window.batchOperation.compileFailed"),
      });
      return;
    }

    setRunning(true);
    resetRunState();

    try {
      for (let index = 0; index < imageFiles.length; index += 1) {
        const file = imageFiles[index];

        if (!file) {
          continue;
        }

        setMessage({
          kind: "key",
          key: "window.batchOperation.processing",
          values: {
            current: index + 1,
            total: imageFiles.length,
            name: file.fileName,
          },
        });

        try {
          await processOneFile(file, index, imageFiles.length, processImage, t);
          appendLog(file, "success", t("window.batchOperation.metadataProcessed"));
        } catch (error) {
          appendLog(
            file,
            "failed",
            error instanceof Error
              ? error.message
              : t("window.batchOperation.processFailed"),
          );
        } finally {
          setProcessedCount(index + 1);
        }
      }

      setMessage({
        kind: "key",
        key: "window.batchOperation.complete",
        values: { count: imageFiles.length },
      });
      await loadFiles();
    } finally {
      setRunning(false);
    }
  }

  function resetScript(): void {
    editorRef.current?.setValue(defaultScript);
    setScript(defaultScript);
  }

  function resetRunState(): void {
    setProcessedCount(0);
    setLogs([]);
  }

  function appendLog(
    file: BrowserFileRecord,
    status: BatchLogItem["status"],
    nextMessage: string,
  ): void {
    setLogs((currentLogs) => [
      {
        fileId: file.id,
        fileName: file.fileName,
        status,
        message: nextMessage,
      },
      ...currentLogs,
    ]);
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_112px_24px] border border-(--line) bg-(--panel)">
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-h-0 min-w-0 border-r border-(--line)">
          <div ref={editorContainerRef} className="h-full min-h-0 min-w-0" />
        </div>
        <aside className="grid min-h-0 grid-rows-[28px_minmax(0,1fr)] bg-(--surface-bg)">
          <header className="border-b border-(--line) bg-(--panel-strong) px-2 text-[11px] font-semibold leading-7">
            {t("window.batchOperation.logs")}
          </header>
          <div className="min-h-0 overflow-auto text-[11px]">
            {logs.length > 0 ? (
              logs.map((log) => (
                <div
                  className="grid gap-0.5 border-b border-(--line) px-2 py-1.5"
                  key={`${log.fileId}-${log.status}-${log.message}`}
                >
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--ink)">
                    {log.fileName}
                  </span>
                  <span
                    className={
                      log.status === "failed"
                        ? "text-(--danger)"
                        : "text-(--muted)"
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-2 text-(--muted)">{t("window.batchOperation.noLogs")}</div>
            )}
          </div>
        </aside>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_96px_96px] gap-2 border-t border-(--line) bg-(--surface-bg) p-2 text-[11px]">
        <div className="min-w-0 text-(--muted)">
          {t("window.batchOperation.description")}
        </div>
        <button
          className="ui-button"
          disabled={running}
          type="button"
          onClick={resetScript}
        >
          {t("window.batchOperation.resetExample")}
        </button>
        <button
          className="ui-button ui-button-primary"
          disabled={running || imageFiles.length === 0}
          type="button"
          onClick={() => void runBatchOperation()}
        >
          {running ? t("window.batchOperation.running") : t("window.batchOperation.run")}
        </button>
      </div>
      <footer className="flex h-6 items-center gap-2 border-t border-(--line) px-2 text-[11px] text-(--muted)">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {formatBatchMessage(message, t)}
        </span>
        {running ? (
          <span>
            {processedCount} / {imageFiles.length}
          </span>
        ) : null}
      </footer>
    </section>
  );
}

function compileProcessFunction(
  source: string,
  t: TranslationFunction,
): ProcessFunction {
  const processImage = new Function(`"use strict"; return (${source});`)();

  if (typeof processImage !== "function") {
    throw new Error(t("window.batchOperation.notFunction"));
  }

  return processImage as ProcessFunction;
}

function isImageFile(file: BrowserFileRecord): boolean {
  return IMAGE_EXTENSIONS.has((file.extension ?? "").toLowerCase());
}

async function processOneFile(
  file: BrowserFileRecord,
  index: number,
  total: number,
  processImage: ProcessFunction,
  t: TranslationFunction,
): Promise<void> {
  const context = await createBatchImageProcessContext(file, index, total, t);
  await processImage(context);
}

async function createBatchImageProcessContext(
  file: BrowserFileRecord,
  index: number,
  total: number,
  t: TranslationFunction,
): Promise<BatchImageProcessContext> {
  if (!window.asteria) {
    throw new Error(t("app.status.preloadUnavailable"));
  }

  let [tags, urls] = await Promise.all([
    window.asteria.listFileTags(file.id),
    window.asteria.listFileUrls([file.id]),
  ]);
  const context = {
    file,
    index,
    total,
    get tags(): FileTagRecord[] {
      return tags;
    },
    get urls(): FileUrlRecord[] {
      return urls;
    },
    addTags: async (drafts: TagDraft[]) => {
      tags = await window.asteria.addFileTags(file.id, drafts);
      return tags;
    },
    removeTags: async (tagIds: number[]) => {
      tags = await window.asteria.removeFileTags(file.id, tagIds);
      return tags;
    },
    addUrl: async (url: string) => {
      urls = await window.asteria.addFileUrl([file.id], url);
      return urls;
    },
    updateUrl: async (urlId: number, nextUrl: string, previousUrl?: string) => {
      const currentUrl =
        previousUrl ?? urls.find((item) => item.id === urlId)?.url;

      if (!currentUrl) {
        throw new Error(t("window.batchOperation.urlMissing"));
      }

      urls = await window.asteria.updateFileUrl(
        [file.id],
        urlId,
        currentUrl,
        nextUrl,
      );
      return urls;
    },
    removeUrl: async (urlId: number, url?: string) => {
      const currentUrl = url ?? urls.find((item) => item.id === urlId)?.url;

      if (!currentUrl) {
        throw new Error(t("window.batchOperation.urlMissing"));
      }

      urls = await window.asteria.removeFileUrl([file.id], urlId, currentUrl);
      return urls;
    },
  };

  return context;
}

function formatBatchMessage(
  message: BatchMessage,
  t: TranslationFunction,
): string {
  if (message.kind === "text") {
    return message.text;
  }

  return t(message.key, message.values);
}
