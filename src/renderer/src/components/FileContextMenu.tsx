import type { RatingGroupRecord } from "../../../shared/ipc";
import { useLanguage } from "../utils/language";

interface FileContextMenuProps {
  x: number;
  y: number;
  fileIds: number[];
  canManageTags: boolean;
  canBatchOperate: boolean;
  canOpenExternally: boolean;
  canAiRetag: boolean;
  canAiAppendTag: boolean;
  canTranslateTags: boolean;
  canScreening: boolean;
  activeRatingGroups: RatingGroupRecord[];
  onManageUrl: (fileIds: number[]) => void;
  onManageTags: (fileIds: number[]) => void;
  onBatchOperate: (fileIds: number[]) => void;
  onAiRetag: (fileIds: number[]) => void;
  onAiAppendTag: (fileIds: number[]) => void;
  onTranslateTags: (fileIds: number[]) => void;
  onExport: (fileIds: number[]) => void;
  onOpenExternally: (fileIds: number[]) => void;
  onOpenScreening: (fileIds: number[]) => void;
  onOpenRating: (fileIds: number[], group: RatingGroupRecord) => void;
  onTrash: (fileIds: number[]) => void;
}

export function FileContextMenu({
  x,
  y,
  fileIds,
  canAiRetag,
  canAiAppendTag,
  canTranslateTags,
  canManageTags,
  canBatchOperate,
  canOpenExternally,
  canScreening,
  activeRatingGroups,
  onManageUrl,
  onManageTags,
  onBatchOperate,
  onAiRetag,
  onAiAppendTag,
  onTranslateTags,
  onExport,
  onOpenExternally,
  onOpenScreening,
  onOpenRating,
  onTrash,
}: FileContextMenuProps): JSX.Element {
  const { t } = useLanguage();
  return (
    <div
      className="fixed z-30 inline-flex w-fit max-w-[calc(100vw-16px)] flex-col border border-(--line-strong) bg-(--panel) p-1 [&>button]:block [&>button]:h-6 [&>button]:w-full [&>button]:cursor-default [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-2 [&>button]:text-left [&>button]:text-[11px] [&>button]:text-(--ink) [&>button]:whitespace-nowrap [&>button]:overflow-hidden [&>button]:text-ellipsis [&>button:hover]:bg-(--accent-weak)"
      style={{ left: x, top: y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={() => onManageUrl(fileIds)}>
        {t("window.contextMenu.manageUrl")}
      </button>
      {canManageTags ? (
        <button type="button" onClick={() => onManageTags(fileIds)}>
          {t("window.contextMenu.manageTags")}
        </button>
      ) : null}
      {canBatchOperate ? (
        <button type="button" onClick={() => onBatchOperate(fileIds)}>
          {t("window.contextMenu.batchOperate")}
        </button>
      ) : null}
      {canOpenExternally ? (
        <button type="button" onClick={() => onOpenExternally(fileIds)}>
          {t("window.contextMenu.openDefault")}
        </button>
      ) : null}
      {canAiRetag ? (
        <button type="button" onClick={() => onAiRetag(fileIds)}>
          {t("window.contextMenu.aiRetagOverwrite")}
        </button>
      ) : null}
      {canAiAppendTag ? (
        <button type="button" onClick={() => onAiAppendTag(fileIds)}>
          {t("window.contextMenu.aiRetagAppend")}
        </button>
      ) : null}
      {canTranslateTags ? (
        <button type="button" onClick={() => onTranslateTags(fileIds)}>
          {t("window.contextMenu.translateTags")}
        </button>
      ) : null}
      <button type="button" onClick={() => onExport(fileIds)}>
        {t("window.contextMenu.export")}
      </button>
      {canScreening ? (
        <button type="button" onClick={() => onOpenScreening(fileIds)}>
          {t("window.contextMenu.screening")}
        </button>
      ) : null}
      {activeRatingGroups.map((group) => (
        <button
          key={group.id}
          type="button"
          onClick={() => onOpenRating(fileIds, group)}
        >
          {t("window.contextMenu.ratingSet", { name: group.name })}
        </button>
      ))}
      <button type="button" onClick={() => onTrash(fileIds)}>
        {t("window.contextMenu.trash")}
      </button>
    </div>
  );
}
