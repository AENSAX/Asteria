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
    <section className="url-manager-window">
      <div className="url-create-row">
        <input
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

      <div className="url-list">
        {urls.length > 0 ? (
          urls.map((url) => (
            <div className="url-row" key={`${url.id}:${url.url}`}>
              {editingUrlId === url.id ? (
                <input
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
                <span title={url.url}>{url.url}</span>
              )}
              <span>{url.fileCount}</span>
              {editingUrlId === url.id ? (
                <ActionFeedbackButton label="保存" onAction={() => saveUrl(url)} />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingUrlId(url.id);
                    setEditingText(url.url);
                  }}
                >
                  修改
                </button>
              )}
              <button type="button" onClick={() => void removeUrl(url)}>
                删除
              </button>
            </div>
          ))
        ) : (
          <div className="managed-tag-empty">没有url</div>
        )}
      </div>
      <footer className="view-status">{message}</footer>
    </section>
  );
}
