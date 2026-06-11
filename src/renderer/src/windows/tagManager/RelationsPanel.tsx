import { useRef } from "react";
import type { MouseEvent } from "react";
import type {
  ManagedTagRecord,
  TagRecord,
  TagSiblingRecord,
} from "../../../../shared/ipc";
import { ResizableColumns } from "../../components/ResizableColumns";
import { Icon } from "../../components/Icon";
import { useBoxSelection } from "../../hooks/useBoxSelection";
import { useLanguage } from "../../utils/language";
import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle,
} from "../../utils/tags";
import {
  emptyClass,
  relationListClass,
  relationRowClass,
  relationRowSelectedClass,
  sectionHeaderClass,
} from "./classNames";
import { RelationTagInput } from "./RelationTagInput";
import type { RelationKind } from "./tagManagerData";
import type { RelationTagInputController } from "./useRelationTagInput";

interface RelationsPanelProps {
  sourceTags: ManagedTagRecord[];
  selectedSourceIds: number[];
  onSelectSourceIds: (ids: number[]) => void;
  onLastSourceId: (id: number | null) => void;
  onSourceMouseDown: (
    event: MouseEvent<HTMLElement>,
    tag: ManagedTagRecord,
    index: number,
  ) => void;
  parentInput: RelationTagInputController;
  childInput: RelationTagInputController;
  canonicalInput: RelationTagInputController;
  aliasInput: RelationTagInputController;
  commonParentTags: TagRecord[];
  commonChildTags: TagRecord[];
  commonCanonicalTags: TagRecord[];
  selectedCanonicalTargets: TagSiblingRecord[];
  selectedTagAliases: TagSiblingRecord[];
  onAddRelationTags: (kind: RelationKind) => void;
  onRemoveRelationTags: (relationTagIds: number[], kind: RelationKind) => void;
  onSetCanonical: () => void;
  onAddAliases: () => void;
  onRemoveSiblingAliases: (aliasTagIds: number[]) => void;
  onOpenRelationTree: (kind: "parent" | "sibling") => void;
}

const subSectionHeaderClass =
  "h-[22px] border-b border-(--line) bg-(--panel) px-2 leading-[22px] text-[12px] font-semibold text-(--muted)";

export function RelationsPanel({
  sourceTags,
  selectedSourceIds,
  onSelectSourceIds,
  onLastSourceId,
  onSourceMouseDown,
  parentInput,
  childInput,
  canonicalInput,
  aliasInput,
  commonParentTags,
  commonChildTags,
  commonCanonicalTags,
  selectedCanonicalTargets,
  selectedTagAliases,
  onAddRelationTags,
  onRemoveRelationTags,
  onSetCanonical,
  onAddAliases,
  onRemoveSiblingAliases,
  onOpenRelationTree,
}: RelationsPanelProps): JSX.Element {
  const { t } = useLanguage();
  const sourceListRef = useRef<HTMLDivElement | null>(null);
  const sourceBoxSelection = useBoxSelection({
    containerRef: sourceListRef,
    itemSelector: "[data-box-select-id]",
    selectedIds: selectedSourceIds,
    startOnlyFromContainer: true,
    onSelect: onSelectSourceIds,
    onLastSelectedId: onLastSourceId,
  });

  function renderTagSpan(tag: TagRecord): JSX.Element {
    return (
      <span
        className={getTagNamespaceClassName(
          tag,
          "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
        )}
        style={getTagNamespaceStyle(tag)}
        title={formatTagLabel(tag)}
      >
        {formatTagLabel(tag)}
      </span>
    );
  }

  function renderRelationTagList(kind: RelationKind): JSX.Element {
    const relationTags = kind === "parent" ? commonParentTags : commonChildTags;
    const emptyMessage =
      selectedSourceIds.length === 0
        ? t("window.tagManager.noRelationSourceSelected")
        : kind === "parent"
          ? t("window.tagManager.noCommonParents")
          : t("window.tagManager.noCommonChildren");

    return (
      <div
        className={relationListClass}
        data-tag-selection-scope={`relation-${kind}`}
      >
        {relationTags.length > 0 ? (
          relationTags.map((tag) => (
            <div
              className="mb-1 grid min-h-6 grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)_52px] items-center gap-1 border-b border-(--line) px-1"
              key={tag.id}
            >
              {kind === "parent" ? (
                <>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)">
                    {t("window.tagManager.selectedRelationTags")}
                  </span>
                  <span className="grid place-items-center text-(--muted)">
                    <Icon name="arrow-right" size={12} />
                  </span>
                  {renderTagSpan(tag)}
                </>
              ) : (
                <>
                  {renderTagSpan(tag)}
                  <span className="grid place-items-center text-(--muted)">
                    <Icon name="arrow-right" size={12} />
                  </span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)">
                    {t("window.tagManager.selectedRelationTags")}
                  </span>
                </>
              )}
              <button
                aria-label={t("window.tagManager.removeRelation")}
                className="ui-button ui-button-compact ui-icon-button"
                title={t("window.tagManager.removeRelation")}
                type="button"
                onClick={() => onRemoveRelationTags([tag.id], kind)}
              >
                <Icon name="x" />
              </button>
            </div>
          ))
        ) : (
          <div className={emptyClass}>{emptyMessage}</div>
        )}
      </div>
    );
  }

  function renderSourcePanel(): JSX.Element {
    return (
      <section className="grid min-h-0 grid-rows-[27px_minmax(0,1fr)] bg-(--surface-bg)">
        <header className={sectionHeaderClass}>
          <span>{t("window.tagManager.relationSourceTags")}</span>
          <span className="font-normal text-(--muted)">
            {selectedSourceIds.length} / {sourceTags.length}
          </span>
        </header>
        <div
          className={relationListClass}
          data-tag-selection-scope="relation-source"
          ref={sourceListRef}
          onMouseDownCapture={sourceBoxSelection.handleMouseDownCapture}
        >
          {sourceTags.length > 0 ? (
            sourceTags.map((tag, index) => (
              <button
                className={getTagNamespaceClassName(
                  tag,
                  selectedSourceIds.includes(tag.id)
                    ? `${relationRowClass} ${relationRowSelectedClass}`
                    : relationRowClass,
                )}
                data-box-select-id={tag.id}
                data-tag-selection-group="relation-source"
                key={tag.id}
                style={getTagNamespaceStyle(tag)}
                title={formatTagLabel(tag)}
                type="button"
                onMouseDown={(event) => onSourceMouseDown(event, tag, index)}
              >
                {formatTagLabel(tag)}
              </button>
            ))
          ) : (
            <div className={emptyClass}>
              {t("window.tagManager.noExistingStagedTags")}
            </div>
          )}
          {sourceBoxSelection.selectionBox ? (
            <div
              className="absolute z-40 border border-(--accent) bg-(--accent-overlay) pointer-events-none"
              style={sourceBoxSelection.selectionBox}
            />
          ) : null}
        </div>
      </section>
    );
  }

  function renderParentTools(): JSX.Element {
    return (
      <section
        className="grid min-h-0 grid-rows-[27px_minmax(110px,1fr)_minmax(110px,1fr)_auto] border-r border-(--line) bg-(--surface-bg)"
        data-tag-selection-scope="relation-tools"
      >
        <header className={sectionHeaderClass}>
          <span>{t("window.tagManager.parents")}</span>
          <span className="font-normal text-(--muted)">
            {commonParentTags.length + commonChildTags.length}
          </span>
        </header>

        <section className="grid min-h-0 grid-rows-[22px_auto_minmax(0,1fr)] border-b border-(--line)">
          <header className={subSectionHeaderClass}>
            {t("window.tagManager.setSelectedChildren")}
          </header>
          <RelationTagInput
            actionDisabled={selectedSourceIds.length === 0}
            ariaLabel={t("window.tagManager.addParentInput")}
            buttonLabel={t("window.tagManager.addRelation")}
            controller={parentInput}
            placeholder={t("window.tagManager.addParentPlaceholder")}
            selectionScope="relation-editor"
            onAction={() => onAddRelationTags("parent")}
          />
          <div className="grid min-h-0 grid-rows-[22px_minmax(0,1fr)]">
            <header className="px-2 leading-[22px] text-[12px] font-semibold text-(--muted)">
              {t("window.tagManager.commonParents")}
            </header>
            {renderRelationTagList("parent")}
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[22px_auto_minmax(0,1fr)]">
          <header className={subSectionHeaderClass}>
            {t("window.tagManager.setSelectedParents")}
          </header>
          <RelationTagInput
            actionDisabled={selectedSourceIds.length === 0}
            ariaLabel={t("window.tagManager.addChildInput")}
            buttonLabel={t("window.tagManager.addRelation")}
            controller={childInput}
            placeholder={t("window.tagManager.addChildPlaceholder")}
            selectionScope="relation-editor"
            onAction={() => onAddRelationTags("child")}
          />
          <div className="grid min-h-0 grid-rows-[22px_minmax(0,1fr)]">
            <header className="px-2 leading-[22px] text-[12px] font-semibold text-(--muted)">
              {t("window.tagManager.commonChildren")}
            </header>
            {renderRelationTagList("child")}
          </div>
        </section>

        <footer className="flex justify-end border-t border-(--line) bg-(--panel) p-1.5">
          <button
            className="ui-button ui-button-lg"
            type="button"
            onClick={() => onOpenRelationTree("parent")}
          >
            {t("window.tagManager.openRelationTree")}
          </button>
        </footer>
      </section>
    );
  }

  function renderSiblingTools(): JSX.Element {
    const aliasDisabled = selectedSourceIds.length !== 1;

    return (
      <section
        className="grid min-h-0 grid-rows-[27px_minmax(110px,1fr)_minmax(110px,1fr)_auto] bg-(--surface-bg)"
        data-tag-selection-scope="relation-tools"
      >
        <header className={sectionHeaderClass}>
          <span>{t("window.tagManager.aliasesAndCanonical")}</span>
          <span className="font-normal text-(--muted)">
            {selectedCanonicalTargets.length + selectedTagAliases.length}
          </span>
        </header>

        <section className="grid min-h-0 grid-rows-[22px_auto_minmax(0,1fr)] border-b border-(--line)">
          <header className={subSectionHeaderClass}>
            {t("window.tagManager.setSelectedAliases")}
          </header>
          <RelationTagInput
            actionDisabled={selectedSourceIds.length === 0}
            ariaLabel={t("window.tagManager.setCanonicalInput")}
            buttonLabel={t("window.tagManager.setCanonical")}
            controller={canonicalInput}
            placeholder={t("window.tagManager.setCanonicalPlaceholder")}
            selectionScope="relation-tools"
            onAction={onSetCanonical}
          />
          <div className="min-h-0 overflow-auto bg-(--surface-bg) p-1.5 text-[12px] text-(--ink)">
            <header className="mb-1 text-[12px] font-semibold text-(--muted)">
              {t("window.tagManager.commonCanonical")}
            </header>
            {selectedSourceIds.length === 0 ? (
              <div className={emptyClass}>
                {t("window.tagManager.noRelationSourceSelected")}
              </div>
            ) : commonCanonicalTags.length > 0 ? (
              commonCanonicalTags.map((tag) => (
                <div
                  className="mb-1 grid min-h-6 grid-cols-[minmax(0,1fr)_52px] items-center gap-1 border-b border-(--line) px-1"
                  key={tag.id}
                >
                  {renderTagSpan(tag)}
                  <button
                    aria-label={t("window.tagManager.removeSibling")}
                    className="ui-button ui-button-compact ui-icon-button"
                    title={t("window.tagManager.removeSibling")}
                    type="button"
                    onClick={() =>
                      onRemoveSiblingAliases(
                        selectedCanonicalTargets.map(
                          (record) => record.alias.id,
                        ),
                      )
                    }
                  >
                    <Icon name="x" />
                  </button>
                </div>
              ))
            ) : (
              <div className={emptyClass}>
                {t("window.tagManager.noCommonCanonicalTags")}
              </div>
            )}
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[22px_auto_minmax(0,1fr)]">
          <header className={subSectionHeaderClass}>
            {t("window.tagManager.addAliasesToCanonical")}
          </header>
          <RelationTagInput
            actionDisabled={aliasDisabled}
            ariaLabel={t("window.tagManager.addAliasesInput")}
            buttonLabel={t("window.tagManager.addAliases")}
            controller={aliasInput}
            disabledPlaceholder={t("window.tagManager.selectSingleCanonicalTag")}
            inputDisabled={aliasDisabled}
            placeholder={t("window.tagManager.addAliasesPlaceholder")}
            selectionScope="relation-tools"
            onAction={onAddAliases}
          />
          <div className="min-h-0 overflow-auto bg-(--surface-bg) p-1.5 text-[12px] text-(--ink)">
            <header className="mb-1 text-[12px] font-semibold text-(--muted)">
              {t("window.tagManager.aliasesOfSelectedTags")}
            </header>
            {selectedSourceIds.length === 0 ? (
              <div className={emptyClass}>
                {t("window.tagManager.noRelationSourceSelected")}
              </div>
            ) : selectedTagAliases.length > 0 ? (
              selectedTagAliases.map((record) => (
                <div
                  className="mb-1 grid min-h-6 grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)_52px] items-center gap-1 border-b border-(--line) px-1"
                  key={record.alias.id}
                >
                  {renderTagSpan(record.alias)}
                  <span className="grid place-items-center text-(--muted)">
                    <Icon name="arrow-right" size={12} />
                  </span>
                  {renderTagSpan(record.canonical)}
                  <button
                    aria-label={t("window.tagManager.removeSibling")}
                    className="ui-button ui-button-compact ui-icon-button"
                    title={t("window.tagManager.removeSibling")}
                    type="button"
                    onClick={() => onRemoveSiblingAliases([record.alias.id])}
                  >
                    <Icon name="x" />
                  </button>
                </div>
              ))
            ) : (
              <div className={emptyClass}>
                {t("window.tagManager.noAliasTags")}
              </div>
            )}
          </div>
        </section>

        <footer className="flex justify-end border-t border-(--line) bg-(--panel) p-1.5">
          <button
            className="ui-button ui-button-lg"
            type="button"
            onClick={() => onOpenRelationTree("sibling")}
          >
            {t("window.tagManager.openRelationTree")}
          </button>
        </footer>
      </section>
    );
  }

  return (
    <ResizableColumns
      className="h-full bg-(--panel)"
      defaultLeftWidth={500}
      minLeftWidth={180}
      minRightWidth={620}
      storageKey="asteria:tag-manager-relation-source-width"
      left={renderSourcePanel()}
      right={
        <ResizableColumns
          className="h-full bg-(--panel)"
          defaultLeftWidth={700}
          minLeftWidth={300}
          minRightWidth={300}
          storageKey="asteria:tag-manager-relation-semantic-width"
          left={renderParentTools()}
          right={renderSiblingTools()}
        />
      }
    />
  );
}
