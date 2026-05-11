import type { RatingGroupRecord } from "../../../shared/ipc";

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
  return (
    <div
      className="fixed z-30 w-[142px] border border-(--line-strong) bg-(--panel) p-1 [&>button]:block [&>button]:h-6 [&>button]:w-full [&>button]:cursor-default [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-2 [&>button]:text-left [&>button]:text-[11px] [&>button]:text-(--ink) [&>button:hover]:bg-(--accent-weak)"
      style={{ left: x, top: y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={() => onManageUrl(fileIds)}>
        管理url
      </button>
      {canManageTags ? (
        <button type="button" onClick={() => onManageTags(fileIds)}>
          管理标签
        </button>
      ) : null}
      {canBatchOperate ? (
        <button type="button" onClick={() => onBatchOperate(fileIds)}>
          批量操作
        </button>
      ) : null}
      {canOpenExternally ? (
        <button type="button" onClick={() => onOpenExternally(fileIds)}>
          使用默认方式打开
        </button>
      ) : null}
      {canAiRetag ? (
        <button type="button" onClick={() => onAiRetag(fileIds)}>
          使用模型打标（覆盖）
        </button>
      ) : null}
      {canAiAppendTag ? (
        <button type="button" onClick={() => onAiAppendTag(fileIds)}>
          使用模型打标（追加）
        </button>
      ) : null}
      {canTranslateTags ? (
        <button type="button" onClick={() => onTranslateTags(fileIds)}>
          翻译标签
        </button>
      ) : null}
      <button type="button" onClick={() => onExport(fileIds)}>
        导出
      </button>
      {canScreening ? (
        <button type="button" onClick={() => onOpenScreening(fileIds)}>
          筛选入库
        </button>
      ) : null}
      {activeRatingGroups.map((group) => (
        <button
          key={group.id}
          type="button"
          onClick={() => onOpenRating(fileIds, group)}
        >
          设置:{group.name}
        </button>
      ))}
      <button type="button" onClick={() => onTrash(fileIds)}>
        放入回收站
      </button>
    </div>
  );
}
