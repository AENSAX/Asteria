import { useEffect, useState } from 'react';
import type { BrowserFileRecord } from '../../../shared/ipc';
import { FavoriteButton } from '../components/FavoriteButton';
import { FileRatingStack } from '../components/FileRatingStack';
import { isImageExtension, isVideoExtension } from '../utils/media';

export function FavoritesWindow(): JSX.Element {
  const [files, setFiles] = useState<BrowserFileRecord[]>([]);
  const [message, setMessage] = useState('未加载');

  useEffect(() => {
    void loadFavorites();
  }, []);

  useEffect(() => {
    if (!window.asteria) {
      return undefined;
    }

    const unsubscribeFilesChanged = window.asteria.onFilesChanged(() => {
      void loadFavorites();
    });

    const unsubscribeFavoriteChanged = window.asteria.onFileFavoriteChanged((fileId, favorite) => {
      setFiles((currentFiles) => {
        if (favorite) {
          if (currentFiles.some((file) => file.id === fileId)) {
            return patchFavoriteFiles(currentFiles, fileId, favorite);
          }

          void loadFavorites();
          return currentFiles;
        }

        return currentFiles.filter((file) => file.id !== fileId);
      });
    });

    return () => {
      unsubscribeFilesChanged();
      unsubscribeFavoriteChanged();
    };
  }, []);

  async function loadFavorites(): Promise<void> {
    if (!window.asteria) {
      setMessage('preload unavailable');
      return;
    }

    const nextFiles = await window.asteria.listFavoriteFiles();
    setFiles(nextFiles);
    setMessage(`${nextFiles.length} 个文件`);
  }

  async function openFileDetail(fileId: number): Promise<void> {
    await window.asteria?.openFileDetailWindow(fileId);
  }

  async function toggleFavorite(file: BrowserFileRecord): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const nextFavorite = !file.isFavorite;
    setFiles((currentFiles) =>
      nextFavorite
        ? patchFavoriteFiles(currentFiles, file.id, nextFavorite)
        : currentFiles.filter((item) => item.id !== file.id)
    );

    try {
      await window.asteria.setFileFavorite(file.id, nextFavorite);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '收藏更新失败');
      await loadFavorites();
    }
  }

  return (
    <section className="module-view favorite-window">
      <div className="browser-grid favorite-grid">
        {files.length > 0 ? (
          files.map((file) => (
            <article className="browser-cell" key={file.id} title={file.originalPath}>
              <FileRatingStack className="browser-rating-stack" ratings={file.ratings} />
              <FavoriteButton active={Boolean(file.isFavorite)} onToggle={() => void toggleFavorite(file)} />
              <button className="favorite-media-button" type="button" onClick={() => void openFileDetail(file.id)}>
                {renderFavoriteMedia(file)}
              </button>
            </article>
          ))
        ) : (
          <div className="browser-empty">没有收藏文件</div>
        )}
      </div>
      <footer className="view-status">{message}</footer>
    </section>
  );
}

function patchFavoriteFiles(
  files: BrowserFileRecord[],
  fileId: number,
  favorite: boolean
): BrowserFileRecord[] {
  let changed = false;
  const nextFiles = files.map((file) => {
    if (file.id !== fileId || file.isFavorite === favorite) {
      return file;
    }

    changed = true;
    return { ...file, isFavorite: favorite };
  });

  return changed ? nextFiles : files;
}

function renderFavoriteMedia(file: BrowserFileRecord): JSX.Element {
  const extension = file.extension?.toLowerCase() ?? '';

  if (isImageExtension(extension)) {
    return <img alt={file.fileName} src={file.thumbnailUrl} />;
  }

  if (isVideoExtension(extension)) {
    return <video muted preload="metadata" src={file.mediaUrl} />;
  }

  return <span>{extension || 'file'}</span>;
}
