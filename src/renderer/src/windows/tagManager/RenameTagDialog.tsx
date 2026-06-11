import type { ManagedTagRenamePreview } from "../../../../shared/ipc";
import { useLanguage } from "../../utils/language";
import { managerButtonClass, managerInputClass } from "./classNames";
import type { RenameDialogState } from "./tagManagerData";

interface RenameTagDialogProps {
  dialog: RenameDialogState;
  preview: ManagedTagRenamePreview | null;
  previewMessage: string;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function RenameTagDialog({
  dialog,
  preview,
  previewMessage,
  onValueChange,
  onSave,
  onClose,
}: RenameTagDialogProps): JSX.Element {
  const { t } = useLanguage();

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/20">
      <section className="grid w-[340px] gap-2 border border-(--line-strong) bg-(--bg) p-3 text-[12px] text-(--ink) shadow-lg">
        <header className="font-semibold">
          {t("window.tagManager.renameTag")}
        </header>
        <input
          autoFocus
          className={managerInputClass}
          aria-label={t("window.tagManager.renameTag")}
          value={dialog.value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSave();
            }

            if (event.key === "Escape") {
              onClose();
            }
          }}
        />
        <div className="grid gap-1 border border-(--line) bg-(--surface-bg) p-2 text-(--muted)">
          <div className="font-semibold text-(--ink)">
            {t("window.tagManager.renamePreview")}
          </div>
          {preview ? (
            <>
              <div>
                {t("window.tagManager.renamePreviewFiles", {
                  directCount: preview.directFileCount,
                  effectiveCount: preview.effectiveFileCount,
                  impliedCount: preview.impliedFileCount,
                })}
              </div>
              <div>
                {t("window.tagManager.renamePreviewParents", {
                  parentCount: preview.directParentCount,
                  childCount: preview.directChildCount,
                })}
              </div>
              <div>
                {t("window.tagManager.renamePreviewSiblings", {
                  aliasCount: preview.aliasCount,
                  canonicalCount: preview.canonicalTargetCount,
                })}
              </div>
              {preview.duplicateTagId ? (
                <div className="text-(--warning-ink)">
                  {t("window.tagManager.renamePreviewDuplicate")}
                </div>
              ) : null}
            </>
          ) : (
            <div>
              {previewMessage || t("window.tagManager.renamePreviewLoading")}
            </div>
          )}
        </div>
        <footer className="flex justify-end gap-1">
          <button className={managerButtonClass} type="button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className={managerButtonClass}
            disabled={Boolean(preview?.duplicateTagId)}
            type="button"
            onClick={onSave}
          >
            {t("common.save")}
          </button>
        </footer>
      </section>
    </div>
  );
}
