import { useEffect, useState } from "react";
import type { FileUrlRecord } from "../../../shared/ipc";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { useLanguage } from "../utils/language";

interface UrlManagerWindowProps {
  fileIds: number[];
}

export function UrlManagerWindow({
  fileIds,
}: UrlManagerWindowProps): JSX.Element {
  const { t } = useLanguage();
  const [urls, setUrls] = useState<FileUrlRecord[]>([]);
  const [input, setInput] = useState("");
  const [editingUrlId, setEditingUrlId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [message, setMessage] = useState(() => t("common.loading"));
  const fileIdKey = fileIds.join(",");

  useEffect(() => {
    void loadUrls();
  }, [fileIdKey]);

  async function loadUrls(): Promise<void> {
    if (!window.asteria || fileIds.length === 0) {
      setUrls([]);
      setMessage(t("window.url.invalidFile"));
      return;
    }

    try {
      const nextUrls = await window.asteria.listFileUrls(fileIds);
      setUrls(nextUrls);
      setMessage(
        fileIds.length > 1
          ? t("window.url.sharedList", { count: fileIds.length })
          : t("window.url.list"),
      );
    } catch (error) {
      setUrls([]);
      setMessage(error instanceof Error ? error.message : t("window.url.loadFailed"));
    }
  }

  async function addUrl(): Promise<void> {
    if (!window.asteria || !input.trim()) {
      return;
    }

    const nextUrls = await window.asteria.addFileUrl(fileIds, input);
    setUrls(nextUrls);
    setInput("");
  }

  async function saveUrl(url: FileUrlRecord): Promise<void> {
    if (!window.asteria || !editingText.trim()) {
      return;
    }

    const nextUrls = await window.asteria.updateFileUrl(
      fileIds,
      url.id,
      url.url,
      editingText,
    );
    setUrls(nextUrls);
    setEditingUrlId(null);
    setEditingText("");
  }

  async function removeUrl(url: FileUrlRecord): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextUrls = await window.asteria.removeFileUrl(
      fileIds,
      url.id,
      url.url,
    );
    setUrls(nextUrls);
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_24px] border border-(--line) bg-(--panel)">
      <div className="grid grid-cols-[minmax(0,1fr)_58px] gap-1.5 border-b border-(--line) p-2">
        <input
          className="h-6 min-w-0 border border-(--line-strong) bg-(--surface-inset-bg) px-1.5 text-(--ink)"
          aria-label={t("window.url.addInput")}
          placeholder={t("window.url.addPlaceholder")}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void addUrl();
            }
          }}
        />
        <button className="ui-button" type="button" onClick={() => void addUrl()}>
          {t("window.url.add")}
        </button>
      </div>

      <div className="min-h-0 overflow-auto p-2">
        {urls.length > 0 ? (
          urls.map((url) => (
            <div
              className="grid min-h-6 grid-cols-[minmax(0,1fr)_48px_58px_58px] border-b border-l border-r border-(--line) bg-(--panel)"
              key={`${url.id}:${url.url}`}
            >
              {editingUrlId === url.id ? (
                <input
                  className="h-6 min-w-0 border-0 border-r border-(--line) bg-(--surface-inset-bg) px-1.5 text-(--ink)"
                  aria-label={t("window.url.edit")}
                  value={editingText}
                  onChange={(event) => setEditingText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void saveUrl(url);
                    }
                  }}
                />
              ) : (
                <span
                  className="min-w-0 overflow-hidden px-2 leading-6 text-ellipsis whitespace-nowrap"
                  title={url.url}
                >
                  {url.url}
                </span>
              )}
              <span className="px-2 text-right leading-6 text-(--muted)">
                {url.fileCount}
              </span>
              {editingUrlId === url.id ? (
                <ActionFeedbackButton
                  className="ui-button-fill min-w-0 border-y-0 border-l-0 border-r-(--line)"
                  label={t("common.save")}
                  onAction={() => saveUrl(url)}
                />
              ) : (
                <button
                  className="ui-button ui-button-fill min-w-0 border-y-0 border-l-0 border-r-(--line)"
                  type="button"
                  onClick={() => {
                    setEditingUrlId(url.id);
                    setEditingText(url.url);
                  }}
                >
                  {t("common.modify")}
                </button>
              )}
              <button
                className="ui-button ui-button-fill min-w-0 border-0"
                type="button"
                onClick={() => void removeUrl(url)}
              >
                {t("common.delete")}
              </button>
            </div>
          ))
        ) : (
          <div className="p-2 text-(--muted)">{t("window.url.noUrl")}</div>
        )}
      </div>
      <footer className="flex h-6 items-center border-t border-(--line) px-2 text-(--muted)">
        {message}
      </footer>
    </section>
  );
}
