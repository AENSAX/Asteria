import type { KeyboardEvent } from "react";
import type { ManagedTagRecord } from "../../../../shared/ipc";
import { Icon } from "../../components/Icon";
import { ResizableColumns } from "../../components/ResizableColumns";
import { formatDate } from "../../utils/format";
import { useLanguage } from "../../utils/language";
import { formatTagLabel } from "../../utils/tags";
import {
  emptyClass,
  managerButtonClass,
  managerInputClass,
  messageClass,
  operationHeadRowClass,
  operationPanelClass,
  operationRowClass,
  sectionHeaderClass,
} from "./classNames";
import {
  type PendingCreateTag,
  type StagedExistingTag,
  type StagedTag,
} from "./tagManagerData";

interface BasicOperationsPanelProps {
  stagedExistingTags: StagedExistingTag[];
  pendingCreateTags: PendingCreateTag[];
  createTagText: string;
  createTagWarning: string | null;
  createDisabled: boolean;
  onCreateTagTextChange: (value: string) => void;
  onCreateTagKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onOpenRenameDialog: (staged: StagedTag, tag: ManagedTagRecord) => void;
  onDeleteExistingTag: (staged: StagedTag, tag: ManagedTagRecord) => void;
  onRemovePendingCreateTag: (localId: number) => void;
  onCreatePendingTags: () => void;
}

export function BasicOperationsPanel({
  stagedExistingTags,
  pendingCreateTags,
  createTagText,
  createTagWarning,
  createDisabled,
  onCreateTagTextChange,
  onCreateTagKeyDown,
  onOpenRenameDialog,
  onDeleteExistingTag,
  onRemovePendingCreateTag,
  onCreatePendingTags,
}: BasicOperationsPanelProps): JSX.Element {
  const { t } = useLanguage();

  function renderColumnHead(): JSX.Element {
    return (
      <div className={operationHeadRowClass}>
        <span>{t("window.tagManager.nameColumn")}</span>
        <span className="text-right">
          {t("window.tagManager.fileCountColumn")}
        </span>
        <span>{t("window.tagManager.createdAtColumn")}</span>
        <span>{t("window.tagManager.operationColumn")}</span>
      </div>
    );
  }

  return (
    <ResizableColumns
      className="h-full bg-(--panel)"
      defaultLeftWidth={620}
      minLeftWidth={360}
      minRightWidth={260}
      storageKey="asteria:tag-manager-basic-width"
      left={
        <div className={operationPanelClass}>
          <header className={sectionHeaderClass}>
            <span>{t("window.tagManager.existingTags")}</span>
            <span className="font-normal text-(--muted)">
              {stagedExistingTags.length}
            </span>
          </header>
          {renderColumnHead()}
          <div className="min-h-0 overflow-auto">
            {stagedExistingTags.length > 0 ? (
              stagedExistingTags.map(({ staged, tag }) => (
                <div className={operationRowClass} key={staged.localId}>
                  <span
                    className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                    title={formatTagLabel(tag)}
                  >
                    {formatTagLabel(tag)}
                  </span>
                  <span className="text-right tabular-nums text-(--muted)">
                    {tag.fileCount}
                  </span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)">
                    {formatDate(tag.createdAt)}
                  </span>
                  <span className="flex min-w-0 justify-end gap-1">
                    <button
                      aria-label={t("window.tagManager.rename")}
                      className="ui-button ui-button-compact ui-icon-button"
                      title={t("window.tagManager.rename")}
                      type="button"
                      onClick={() => onOpenRenameDialog(staged, tag)}
                    >
                      <Icon name="pencil" />
                    </button>
                    <button
                      aria-label={t("common.delete")}
                      className="ui-button ui-button-compact ui-icon-button"
                      title={t("common.delete")}
                      type="button"
                      onClick={() => onDeleteExistingTag(staged, tag)}
                    >
                      <Icon name="trash" />
                    </button>
                  </span>
                </div>
              ))
            ) : (
              <div className={emptyClass}>
                {t("window.tagManager.noExistingStagedTags")}
              </div>
            )}
          </div>
        </div>
      }
      right={
        <div className="grid min-h-0 grid-rows-[27px_auto_24px_minmax(0,1fr)_30px] bg-(--surface-bg)">
          <header className={sectionHeaderClass}>
            <span>{t("window.tagManager.tagsToCreate")}</span>
            <span className="font-normal text-(--muted)">
              {pendingCreateTags.length}
            </span>
          </header>
          <div className="grid gap-1.5 border-b border-(--line) bg-(--panel) p-1.5">
            <input
              className={managerInputClass}
              aria-label={t("window.tagManager.createTagInput")}
              placeholder={t("window.tagManager.createTagPlaceholder")}
              value={createTagText}
              onChange={(event) => onCreateTagTextChange(event.target.value)}
              onKeyDown={onCreateTagKeyDown}
            />
            {createTagWarning ? (
              <div className={messageClass}>{createTagWarning}</div>
            ) : null}
          </div>
          {renderColumnHead()}
          <div className="min-h-0 overflow-auto">
            {pendingCreateTags.length > 0 ? (
              pendingCreateTags.map((pendingTag) => (
                <div className={operationRowClass} key={pendingTag.localId}>
                  <span
                    className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--ink)"
                    title={formatTagLabel(pendingTag)}
                  >
                    {formatTagLabel(pendingTag)}
                  </span>
                  <span className="text-right tabular-nums text-(--muted)">
                    -
                  </span>
                  <span className="text-(--muted)">-</span>
                  <span className="flex justify-end">
                    <button
                      aria-label={t("common.delete")}
                      className="ui-button ui-button-compact ui-icon-button"
                      title={t("common.delete")}
                      type="button"
                      onClick={() => onRemovePendingCreateTag(pendingTag.localId)}
                    >
                      <Icon name="trash" />
                    </button>
                  </span>
                </div>
              ))
            ) : (
              <div className={emptyClass}>
                {t("window.tagManager.noMissingStagedTags")}
              </div>
            )}
          </div>
          <footer className="flex items-center justify-end border-t border-(--line) px-2">
            <button
              className={managerButtonClass}
              disabled={createDisabled || pendingCreateTags.length === 0}
              type="button"
              onClick={onCreatePendingTags}
            >
              {t("common.create")}
            </button>
          </footer>
        </div>
      }
    />
  );
}
