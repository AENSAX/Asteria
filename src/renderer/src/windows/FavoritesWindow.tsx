import { useEffect, useState } from "react";
import type { BrowserFileRecord } from "../../../shared/ipc";
import { FavoriteButton } from "../components/FavoriteButton";
import { FileRatingStack } from "../components/FileRatingStack";
import { isImageExtension, isVideoExtension } from "../utils/media";
import { useLanguage } from "../utils/language";

export function FavoritesWindow(): JSX.Element {
  const { t } = useLanguage();
  const [files, setFiles] = useState<BrowserFileRecord[]>([]);
  const [message, setMessage] = useState(() => t("common.loading"));

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

    const unsubscribeFavoriteChanged = window.asteria.onFileFavoriteChanged(
      (fileId, favorite) => {
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
      },
    );

    return () => {
      unsubscribeFilesChanged();
      unsubscribeFavoriteChanged();
    };
  }, []);

  async function loadFavorites(): Promise<void> {
    if (!window.asteria) {
      setMessage(t("app.status.preloadUnavailable"));
      return;
    }

    const nextFiles = await window.asteria.listFavoriteFiles();
    setFiles(nextFiles);
    setMessage(t("window.favorite.fileCount", { count: nextFiles.length }));
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
        : currentFiles.filter((item) => item.id !== file.id),
    );

    try {
      await window.asteria.setFileFavorite(file.id, nextFavorite);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("window.favorite.updateFailed"));
      await loadFavorites();
    }
  }

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_24px] bg-(--panel)">
      <div className="grid auto-rows-[128px] grid-cols-[repeat(auto-fill,128px)] content-start justify-start gap-2 overflow-auto p-2">
        {files.length > 0 ? (
          files.map((file) => (
            <article
              className="relative grid h-32 w-32 overflow-hidden border border-(--line) bg-(--surface-bg)"
              key={file.id}
              title={file.originalPath}
            >
              <FileRatingStack ratings={file.ratings} />
              <FavoriteButton
                active={Boolean(file.isFavorite)}
                onToggle={() => void toggleFavorite(file)}
              />
              <button
                className="grid h-full w-full place-items-center border-0 bg-transparent p-0"
                type="button"
                onClick={() => void openFileDetail(file.id)}
              >
                {renderFavoriteMedia(file)}
              </button>
            </article>
          ))
        ) : (
          <div className="text-(--muted)">{t("window.favorite.noFiles")}</div>
        )}
      </div>
      <footer className="flex h-6 items-center border-t border-(--line) px-2 text-(--muted)">
        {message}
      </footer>
    </section>
  );
}

function patchFavoriteFiles(
  files: BrowserFileRecord[],
  fileId: number,
  favorite: boolean,
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
  const extension = file.extension?.toLowerCase() ?? "";

  if (isImageExtension(extension)) {
    return (
      <img
        className="block max-h-full max-w-full object-contain"
        alt={file.fileName}
        src={file.thumbnailUrl}
      />
    );
  }

  if (isVideoExtension(extension)) {
    return (
      <video
        className="block max-h-full max-w-full object-contain"
        muted
        preload="metadata"
        src={file.mediaUrl}
      />
    );
  }

  return <span className="text-(--muted)">{extension || "file"}</span>;
}
