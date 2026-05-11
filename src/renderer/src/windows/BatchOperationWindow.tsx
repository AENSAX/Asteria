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
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [files, setFiles] = useState<BrowserFileRecord[]>([]);
  const [script, setScript] = useState(defaultScript);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("未加载");
  const [processedCount, setProcessedCount] = useState(0);
  const [logs, setLogs] = useState<BatchLogItem[]>([]);
  const fileIdKey = fileIds.join(",");

  const imageFiles = useMemo(
    () =>
      files.filter((file) =>
        IMAGE_EXTENSIONS.has((file.extension ?? "").toLowerCase()),
      ),
    [files],
  );

  useEffect(() => {
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
      setMessage("文件无效");
      return;
    }

    const idSet = new Set(fileIds);
    const selectedFiles = (await window.asteria.listBrowserFiles()).filter(
      (file) => idSet.has(file.id),
    );

    setFiles(selectedFiles);
    setMessage(
      `${selectedFiles.length} 个文件，${selectedFiles.filter((file) => IMAGE_EXTENSIONS.has((file.extension ?? "").toLowerCase())).length} 张图片`,
    );
  }

  async function runBatchOperation(): Promise<void> {
    if (!window.asteria || running) {
      return;
    }

    let processImage: ProcessFunction;

    try {
      processImage = compileProcessFunction(script);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "脚本无法运行");
      return;
    }

    setRunning(true);
    setProcessedCount(0);
    setLogs([]);

    try {
      for (let index = 0; index < imageFiles.length; index += 1) {
        const file = imageFiles[index];

        if (!file) {
          continue;
        }

        setMessage(
          `正在处理 ${index + 1} / ${imageFiles.length}: ${file.fileName}`,
        );

        try {
          await processOneFile(file, index, imageFiles.length, processImage);
          appendLog(file, "success", "已处理元数据");
        } catch (error) {
          appendLog(
            file,
            "failed",
            error instanceof Error ? error.message : "处理失败",
          );
        } finally {
          setProcessedCount(index + 1);
        }
      }

      setMessage(`完成：${imageFiles.length} 张图片`);
      await loadFiles();
    } finally {
      setRunning(false);
    }
  }

  function resetScript(): void {
    editorRef.current?.setValue(defaultScript);
    setScript(defaultScript);
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
            处理日志
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
              <div className="p-2 text-(--muted)">暂无日志</div>
            )}
          </div>
        </aside>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_96px_96px] gap-2 border-t border-(--line) bg-(--surface-bg) p-2 text-[11px]">
        <div className="min-w-0 text-(--muted)">
          函数接收 context，可读取文件元数据、标签和 URL，并可批量编辑标签与
          URL。
        </div>
        <button
          className="h-7 cursor-default border border-(--line-strong) bg-(--panel-strong) text-(--ink)"
          disabled={running}
          type="button"
          onClick={resetScript}
        >
          重置示例
        </button>
        <button
          className="h-7 cursor-default border border-(--line-strong) bg-(--accent) text-(--active-ink) disabled:bg-(--panel-strong) disabled:text-(--disabled-ink)"
          disabled={running || imageFiles.length === 0}
          type="button"
          onClick={() => void runBatchOperation()}
        >
          {running ? "处理中" : "运行"}
        </button>
      </div>
      <footer className="flex h-6 items-center gap-2 border-t border-(--line) px-2 text-[11px] text-(--muted)">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {message}
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

function compileProcessFunction(source: string): ProcessFunction {
  const processImage = new Function(`"use strict"; return (${source});`)();

  if (typeof processImage !== "function") {
    throw new Error("脚本必须返回一个函数");
  }

  return processImage as ProcessFunction;
}

async function processOneFile(
  file: BrowserFileRecord,
  index: number,
  total: number,
  processImage: ProcessFunction,
): Promise<void> {
  const context = await createBatchImageProcessContext(file, index, total);
  await processImage(context);
}

async function createBatchImageProcessContext(
  file: BrowserFileRecord,
  index: number,
  total: number,
): Promise<BatchImageProcessContext> {
  if (!window.asteria) {
    throw new Error("preload unavailable");
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
        throw new Error("URL 不存在");
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
        throw new Error("URL 不存在");
      }

      urls = await window.asteria.removeFileUrl([file.id], urlId, currentUrl);
      return urls;
    },
  };

  return context;
}
