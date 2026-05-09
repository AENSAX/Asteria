import { useEffect, useState } from 'react';
import type { FileUrlRecord } from '../../../shared/ipc';
import { ActionFeedbackButton } from '../components/ActionFeedbackButton';

interface UrlManagerWindowProps {
  fileIds: number[];
}

export function UrlManagerWindow({ fileIds }: UrlManagerWindowProps): JSX.Element {
  const [urls, setUrls] = useState<FileUrlRecord[]>([]);
  const [input, setInput] = useState('');
  const [editingUrlId, setEditingUrlId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [message, setMessage] = useState('未加载');
  const fileIdKey = fileIds.join(',');

  useEffect(() => {
    void loadUrls();
  }, [fileIdKey]);

  async function loadUrls(): Promise<void> {
    if (!window.asteria || fileIds.length === 0) {
      setUrls([]);
      setMessage('文件无效');
      return;
    }

    try {
      const nextUrls = await window.asteria.listFileUrls(fileIds);
      setUrls(nextUrls);
      setMessage(fileIds.length > 1 ? `${fileIds.length} 个文件的共同url` : 'url列表');
    } catch (error) {
      setUrls([]);
      setMessage(error instanceof Error ? error.message : '加载失败');
    }
  }

  async function addUrl(): Promise<void> {
    if (!window.asteria || !input.trim()) {
      return;
    }

    const nextUrls = await window.asteria.addFileUrl(fileIds, input);
    setUrls(nextUrls);
    setInput('');
  }

  async function saveUrl(url: FileUrlRecord): Promise<void> {
    if (!window.asteria || !editingText.trim()) {
      return;
    }

    const nextUrls = await window.asteria.updateFileUrl(fileIds, url.id, url.url, editingText);
    setUrls(nextUrls);
    setEditingUrlId(null);
    setEditingText('');
  }

  async function removeUrl(url: FileUrlRecord): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextUrls = await window.asteria.removeFileUrl(fileIds, url.id, url.url);
    setUrls(nextUrls);
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_24px] border border-[var(--line)] bg-[var(--panel)]">
      <div className="grid grid-cols-[minmax(0,1fr)_58px] gap-1.5 border-b border-[var(--line)] p-2">
        <input
          className="h-6 min-w-0 border border-[var(--line-strong)] bg-[var(--surface-inset-bg)] px-1.5 text-[var(--ink)]"
          aria-label="新增url"
          placeholder="输入url以增加"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void addUrl();
            }
          }}
        />
        <button type="button" onClick={() => void addUrl()}>
          新增
        </button>
      </div>

      <div className="min-h-0 overflow-auto p-2">
        {urls.length > 0 ? (
          urls.map((url) => (
            <div className="grid min-h-6 grid-cols-[minmax(0,1fr)_48px_58px_58px] border-b border-l border-r border-[var(--line)] bg-[var(--panel)]" key={`${url.id}:${url.url}`}>
              {editingUrlId === url.id ? (
                <input
                  className="h-6 min-w-0 border-0 border-r border-[var(--line)] bg-[var(--surface-inset-bg)] px-1.5 text-[var(--ink)]"
                  aria-label="修改url"
                  value={editingText}
                  onChange={(event) => setEditingText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void saveUrl(url);
                    }
                  }}
                />
              ) : (
                <span className="min-w-0 overflow-hidden px-2 leading-6 text-ellipsis whitespace-nowrap" title={url.url}>{url.url}</span>
              )}
              <span className="px-2 text-right leading-6 text-[var(--muted)]">{url.fileCount}</span>
              {editingUrlId === url.id ? (
                <ActionFeedbackButton className="h-6 border-0 border-r border-[var(--line)] bg-[var(--panel-strong)] px-2 text-[11px]" label="保存" onAction={() => saveUrl(url)} />
              ) : (
                <button
                  className="h-6 border-0 border-r border-[var(--line)] bg-[var(--panel-strong)] px-2 text-[11px]"
                  type="button"
                  onClick={() => {
                    setEditingUrlId(url.id);
                    setEditingText(url.url);
                  }}
                >
                  修改
                </button>
              )}
              <button className="h-6 border-0 bg-[var(--panel-strong)] px-2 text-[11px]" type="button" onClick={() => void removeUrl(url)}>
                删除
              </button>
            </div>
          ))
        ) : (
          <div className="p-2 text-[var(--muted)]">没有url</div>
        )}
      </div>
      <footer className="flex h-6 items-center border-t border-[var(--line)] px-2 text-[var(--muted)]">{message}</footer>
    </section>
  );
}
