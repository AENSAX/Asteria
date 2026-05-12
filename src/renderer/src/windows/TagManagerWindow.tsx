import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type {
  ManagedTagRecord,
  SortDirection,
  TagDraft,
  TagParentRecord,
  TagRecord,
  TagStyleRecord,
} from "../../../shared/ipc";
import { ResizableColumns } from "../components/ResizableColumns";
import { ResizableRows } from "../components/ResizableRows";
import { useBoxSelection } from "../hooks/useBoxSelection";
import { useShortcut } from "../hooks/useShortcut";
import { mergeIds } from "../utils/ids";
import { useLanguage } from "../utils/language";
import {
  formatTagLabel,
  getTagNamespaceClassName,
  getTagNamespaceStyle,
  parseTagText,
} from "../utils/tags";

type OperationTab = "basic" | "relations";

interface TagEntryToken extends TagDraft {
  key: string;
}

interface StagedTag extends TagDraft {
  key: string;
  localId: number;
}

interface RenameDialogState {
  localId: number;
  tagId: number;
  value: string;
}

interface StagedExistingTag {
  staged: StagedTag;
  tag: ManagedTagRecord;
}

type RelationKind = "parent" | "child";

interface RelationInputState {
  text: string;
  tokens: ManagedTagRecord[];
  selectedSuggestionIndex: number | null;
}

const tagSortKey = "name";
const tagSortDirection: SortDirection = "asc";

const managerShellClass =
  "grid h-full min-h-0 min-w-0 grid-cols-[180px_minmax(0,1fr)] bg-(--panel)";
const managerSidebarClass =
  "flex min-h-0 min-w-0 flex-col border-r border-(--line) bg-(--surface-bg)";
const managerSidebarHeaderClass =
  "h-7 border-b border-(--line) bg-(--panel-strong) px-2 leading-7 text-[11px] font-semibold";
const managerListClass = "min-h-0 flex-1 overflow-auto";
const managerListItemClass =
  "grid min-h-[26px] w-full grid-cols-[18px_minmax(0,1fr)_42px] items-center border-0 border-b border-(--line) bg-transparent px-2 text-left text-[11px] text-(--ink)";
const managerListItemActiveClass = "bg-(--surface-raised-bg)";
const managerInputClass =
  "h-6 min-w-0 border border-(--line-strong) bg-(--surface-inset-bg) px-1.5 text-(--ink)";
const managerButtonClass =
  "h-6 min-w-[70px] cursor-default border border-(--line-strong) bg-(--panel-strong) px-2 text-[11px] text-(--ink) disabled:text-(--disabled-ink)";
const managerPanelClass =
  "relative grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_24px] bg-(--panel)";
const sectionHeaderClass =
  "grid h-7 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-(--line) bg-(--panel-strong) px-2 text-[11px] font-semibold text-(--ink)";
const messageClass =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)";
const tagPillClass =
  "inline-flex min-h-5 max-w-full items-center overflow-hidden border border-(--line-strong) bg-(--tag-bg) px-1.5 text-[11px] text-(--ink)";
const tagPillSelectedClass = "tag-manager-pending";
const emptyClass = "p-2 text-[11px] text-(--muted)";
const operationPanelClass =
  "grid min-h-0 grid-rows-[27px_24px_minmax(0,1fr)] bg-(--surface-bg)";
const operationRowClass =
  "grid min-h-[30px] grid-cols-[minmax(110px,1fr)_76px_106px_minmax(112px,auto)] items-center gap-x-3 border-b border-(--line) px-2 text-[11px] text-(--ink)";
const operationHeadRowClass =
  "grid h-6 grid-cols-[minmax(110px,1fr)_76px_106px_minmax(112px,auto)] items-center gap-x-3 border-b border-(--line) bg-(--panel) px-2 text-[11px] font-semibold text-(--muted)";
const relationColumnClass =
  "grid min-h-0 grid-rows-[27px_auto_minmax(0,1fr)] border-r border-(--line) bg-(--surface-bg)";
const relationListClass =
  "relative min-h-0 overflow-auto bg-(--surface-bg) p-1.5";
const relationRowClass =
  "mb-1 block min-h-5 w-full overflow-hidden border border-transparent bg-transparent px-1.5 text-left text-[11px] text-(--ink) text-ellipsis whitespace-nowrap";
const relationRowSelectedClass = "tag-manager-pending";
const relationInputShellClass =
  "relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5 border-b border-(--line) bg-(--panel) p-1";
const relationInputClass =
  "tag-token-input min-h-6 border border-(--line-strong) bg-(--surface-inset-bg)";

function createRelationInputState(): RelationInputState {
  return {
    text: "",
    tokens: [],
    selectedSuggestionIndex: null,
  };
}

export function TagManagerWindow(): JSX.Element {
  const { t } = useLanguage();
  const [styles, setStyles] = useState<TagStyleRecord[]>([]);
  const [activeStyleId, setActiveStyleId] = useState<number | null>(null);
  const [tags, setTags] = useState<ManagedTagRecord[]>([]);
  const [styleInput, setStyleInput] = useState("");
  const [styleRenameInput, setStyleRenameInput] = useState("");
  const [tagText, setTagText] = useState("");
  const [tagTokens, setTagTokens] = useState<TagEntryToken[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<
    number | null
  >(null);
  const [stagedTags, setStagedTags] = useState<StagedTag[]>([]);
  const [selectedStagedIds, setSelectedStagedIds] = useState<number[]>([]);
  const [lastSelectedStagedId, setLastSelectedStagedId] = useState<
    number | null
  >(null);
  const [operationTab, setOperationTab] = useState<OperationTab>("basic");
  const [message, setMessage] = useState(() => t("window.tagManager.loading"));
  const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(
    null,
  );
  const [tagParents, setTagParents] = useState<TagParentRecord[]>([]);
  const [selectedRelationSourceIds, setSelectedRelationSourceIds] = useState<
    number[]
  >([]);
  const [lastRelationSourceId, setLastRelationSourceId] = useState<
    number | null
  >(null);
  const [selectedParentRelationIds, setSelectedParentRelationIds] = useState<
    number[]
  >([]);
  const [lastParentRelationId, setLastParentRelationId] = useState<
    number | null
  >(null);
  const [selectedChildRelationIds, setSelectedChildRelationIds] = useState<
    number[]
  >([]);
  const [lastChildRelationId, setLastChildRelationId] = useState<number | null>(
    null,
  );
  const [parentInput, setParentInput] = useState(createRelationInputState);
  const [childInput, setChildInput] = useState(createRelationInputState);
  const nextStagedIdRef = useRef(1);
  const stagedListRef = useRef<HTMLDivElement | null>(null);
  const relationSourceListRef = useRef<HTMLDivElement | null>(null);
  const parentRelationListRef = useRef<HTMLDivElement | null>(null);
  const childRelationListRef = useRef<HTMLDivElement | null>(null);
  const selectedStyle =
    styles.find((style) => style.id === activeStyleId) ?? null;
  const tagsByKey = useMemo(() => createTagMap(tags), [tags]);
  const suggestions = useMemo(
    () => createTagSuggestions(tags, tagText, tagTokens),
    [tagText, tagTokens, tags],
  );
  const stagedExistingTags = useMemo(
    () => createExistingStagedTags(stagedTags, tagsByKey),
    [stagedTags, tagsByKey],
  );
  const stagedExistingTagRecords = useMemo(
    () => stagedExistingTags.map(({ tag }) => tag),
    [stagedExistingTags],
  );
  const stagedMissingTags = useMemo(
    () => stagedTags.filter((tag) => !tagsByKey.has(tag.key)),
    [stagedTags, tagsByKey],
  );
  const commonParentTags = useMemo(
    () =>
      createCommonRelationTags(selectedRelationSourceIds, tagParents, "parent"),
    [selectedRelationSourceIds, tagParents],
  );
  const commonChildTags = useMemo(
    () =>
      createCommonRelationTags(selectedRelationSourceIds, tagParents, "child"),
    [selectedRelationSourceIds, tagParents],
  );
  const parentSuggestions = useMemo(
    () =>
      createRelationSuggestions(
        tags,
        parentInput.text,
        parentInput.tokens,
        selectedRelationSourceIds,
      ),
    [parentInput.text, parentInput.tokens, selectedRelationSourceIds, tags],
  );
  const childSuggestions = useMemo(
    () =>
      createRelationSuggestions(
        tags,
        childInput.text,
        childInput.tokens,
        selectedRelationSourceIds,
      ),
    [childInput.text, childInput.tokens, selectedRelationSourceIds, tags],
  );
  const boxSelection = useBoxSelection({
    containerRef: stagedListRef,
    itemSelector: "[data-box-select-id]",
    selectedIds: selectedStagedIds,
    startOnlyFromContainer: true,
    onSelect: setSelectedStagedIds,
    onLastSelectedId: setLastSelectedStagedId,
  });
  const relationSourceBoxSelection = useBoxSelection({
    containerRef: relationSourceListRef,
    itemSelector: "[data-box-select-id]",
    selectedIds: selectedRelationSourceIds,
    startOnlyFromContainer: true,
    onSelect: setSelectedRelationSourceIds,
    onLastSelectedId: setLastRelationSourceId,
  });
  const parentRelationBoxSelection = useBoxSelection({
    containerRef: parentRelationListRef,
    itemSelector: "[data-box-select-id]",
    selectedIds: selectedParentRelationIds,
    startOnlyFromContainer: true,
    onSelect: setSelectedParentRelationIds,
    onLastSelectedId: setLastParentRelationId,
  });
  const childRelationBoxSelection = useBoxSelection({
    containerRef: childRelationListRef,
    itemSelector: "[data-box-select-id]",
    selectedIds: selectedChildRelationIds,
    startOnlyFromContainer: true,
    onSelect: setSelectedChildRelationIds,
    onLastSelectedId: setLastChildRelationId,
  });
  const selectedTagCount =
    selectedStagedIds.length +
    selectedRelationSourceIds.length +
    selectedParentRelationIds.length +
    selectedChildRelationIds.length;

  useEffect(() => {
    void loadStyles();
    void loadTagParents();
  }, []);

  useEffect(() => {
    function clearStagedSelection(): void {
      setSelectedStagedIds([]);
      setLastSelectedStagedId(null);
    }

    function clearRelationSourceSelection(): void {
      setSelectedRelationSourceIds([]);
      setLastRelationSourceId(null);
    }

    function clearParentSelection(): void {
      setSelectedParentRelationIds([]);
      setLastParentRelationId(null);
    }

    function clearChildSelection(): void {
      setSelectedChildRelationIds([]);
      setLastChildRelationId(null);
    }

    function handleDocumentMouseDown(event: globalThis.MouseEvent): void {
      const target = event.target instanceof Element ? event.target : null;
      const itemGroup =
        target
          ?.closest<HTMLElement>("[data-tag-selection-group]")
          ?.dataset.tagSelectionGroup ?? null;
      const scopeGroup =
        target
          ?.closest<HTMLElement>("[data-tag-selection-scope]")
          ?.dataset.tagSelectionScope ?? null;
      const selectionGroup = itemGroup ?? scopeGroup;

      if (selectionGroup === "staged" && itemGroup) {
        clearRelationSourceSelection();
        clearParentSelection();
        clearChildSelection();
        return;
      }

      if (selectionGroup === "relation-source" && itemGroup) {
        clearStagedSelection();
        clearParentSelection();
        clearChildSelection();
        return;
      }

      if (selectionGroup === "relation-parent" && itemGroup) {
        clearStagedSelection();
        clearChildSelection();
        return;
      }

      if (selectionGroup === "relation-child" && itemGroup) {
        clearStagedSelection();
        clearParentSelection();
        return;
      }

      if (
        selectionGroup === "relation-editor" ||
        selectionGroup === "relation-tools"
      ) {
        clearStagedSelection();
        clearParentSelection();
        clearChildSelection();
        return;
      }

      if (selectionGroup === "relation-parent") {
        clearStagedSelection();
        clearParentSelection();
        clearChildSelection();
        return;
      }

      if (selectionGroup === "relation-child") {
        clearStagedSelection();
        clearParentSelection();
        clearChildSelection();
        return;
      }

      clearStagedSelection();
      clearRelationSourceSelection();
      clearParentSelection();
      clearChildSelection();
    }

    document.addEventListener("mousedown", handleDocumentMouseDown, true);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown, true);
    };
  }, []);

  useEffect(() => {
    void loadManagedTags();
  }, [activeStyleId]);

  useEffect(() => {
    setStyleRenameInput(selectedStyle?.displayName ?? "");
  }, [selectedStyle?.displayName, selectedStyle?.id]);

  useEffect(() => {
    setSelectedSuggestionIndex(null);
  }, [tagText]);

  useEffect(() => {
    if (
      selectedSuggestionIndex !== null &&
      selectedSuggestionIndex >= suggestions.length
    ) {
      setSelectedSuggestionIndex(null);
    }
  }, [selectedSuggestionIndex, suggestions.length]);

  useEffect(() => {
    setSelectedRelationSourceIds((currentIds) =>
      currentIds.filter((id) =>
        stagedExistingTagRecords.some((tag) => tag.id === id),
      ),
    );
  }, [stagedExistingTagRecords]);

  useEffect(() => {
    setSelectedParentRelationIds((currentIds) =>
      currentIds.filter((id) => commonParentTags.some((tag) => tag.id === id)),
    );
  }, [commonParentTags]);

  useEffect(() => {
    setSelectedChildRelationIds((currentIds) =>
      currentIds.filter((id) => commonChildTags.some((tag) => tag.id === id)),
    );
  }, [commonChildTags]);

  useEffect(() => {
    if (
      parentInput.selectedSuggestionIndex !== null &&
      parentInput.selectedSuggestionIndex >= parentSuggestions.length
    ) {
      setParentInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex: null,
      }));
    }
  }, [parentInput.selectedSuggestionIndex, parentSuggestions.length]);

  useEffect(() => {
    if (
      childInput.selectedSuggestionIndex !== null &&
      childInput.selectedSuggestionIndex >= childSuggestions.length
    ) {
      setChildInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex: null,
      }));
    }
  }, [childInput.selectedSuggestionIndex, childSuggestions.length]);

  useShortcut("select-all", () => {
    const ids = stagedTags.map((tag) => tag.localId);
    setSelectedStagedIds(ids);
    setLastSelectedStagedId(ids[ids.length - 1] ?? null);
  });

  async function loadStyles(nextActiveStyleId?: number): Promise<void> {
    if (!window.asteria) {
      setMessage(t("app.status.preloadUnavailable"));
      return;
    }

    const nextStyles = await window.asteria.listTagStyles();
    const activeExists = nextStyles.some((style) => style.id === activeStyleId);
    const fallbackStyleId =
      nextActiveStyleId ??
      (activeExists ? activeStyleId : (nextStyles[0]?.id ?? null));

    setStyles(nextStyles);
    setActiveStyleId(fallbackStyleId);
    setMessage(
      t("window.tagManager.loadedStyle", { count: nextStyles.length }),
    );
  }

  async function loadManagedTags(): Promise<void> {
    if (!window.asteria || activeStyleId === null) {
      setTags([]);
      return;
    }

    setTags(
      await window.asteria.listManagedTags(
        activeStyleId,
        tagSortKey,
        tagSortDirection,
      ),
    );
  }

  async function loadTagParents(): Promise<void> {
    if (!window.asteria) {
      setTagParents([]);
      return;
    }

    setTagParents(await window.asteria.listTagParents());
  }

  function selectStyle(styleId: number): void {
    setActiveStyleId(styleId);
    setTagText("");
    setTagTokens([]);
    setStagedTags([]);
    setSelectedStagedIds([]);
    setLastSelectedStagedId(null);
    resetRelationSelection();
  }

  async function createStyle(): Promise<void> {
    if (!window.asteria || !styleInput.trim()) {
      return;
    }

    try {
      const nextStyles = await window.asteria.createTagStyle(styleInput);
      const createdStyle =
        nextStyles.find((style) => style.displayName === styleInput.trim()) ??
        nextStyles[0];
      setStyles(nextStyles);
      setActiveStyleId(createdStyle?.id ?? null);
      setStyleInput("");
      setMessage(t("window.tagManager.createdStyle"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.tagManager.createFailed"),
      );
    }
  }

  async function activateStyle(): Promise<void> {
    if (!window.asteria || activeStyleId === null) {
      return;
    }

    try {
      const nextStyles = await window.asteria.setActiveTagStyle(activeStyleId);
      setStyles(nextStyles);
      setMessage(t("window.tagManager.activatedStyle"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.tagManager.activateFailed"),
      );
    }
  }

  async function renameStyle(): Promise<void> {
    if (!window.asteria || activeStyleId === null || !styleRenameInput.trim()) {
      return;
    }

    try {
      setStyles(
        await window.asteria.renameTagStyle(activeStyleId, styleRenameInput),
      );
      setMessage(t("window.tagManager.renamedStyle"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.tagManager.renameFailed"),
      );
    }
  }

  async function deleteStyle(): Promise<void> {
    if (!window.asteria || activeStyleId === null || !selectedStyle) {
      return;
    }

    const confirmed = await window.asteria.confirmDialog({
      title: t("window.tagManager.confirmDeleteStyleTitle"),
      message: t("window.tagManager.confirmDeleteStyleMessage", {
        name: selectedStyle.displayName,
        count: selectedStyle.tagCount,
      }),
    });

    if (!confirmed) {
      return;
    }

    try {
      const result = await window.asteria.deleteTagStyle(activeStyleId);
      setStyles(result.styles);
      setActiveStyleId(result.styles[0]?.id ?? null);
      setStagedTags([]);
      setSelectedStagedIds([]);
      setLastSelectedStagedId(null);
      resetRelationSelection();
      await loadTagParents();
      setMessage(
        t("window.tagManager.deletedStyle", { count: result.deletedTagCount }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.tagManager.deleteStyleFailed"),
      );
    }
  }

  function handleEntryKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setSelectedSuggestionIndex((index) =>
        index === null ? 0 : Math.min(index + 1, suggestions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setSelectedSuggestionIndex((index) =>
        index === null ? suggestions.length - 1 : Math.max(index - 1, 0),
      );
      return;
    }

    if (event.key === "Backspace" && tagText.length === 0) {
      setTagTokens((currentTokens) => currentTokens.slice(0, -1));
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (tagText.trim()) {
      const suggestion =
        selectedSuggestionIndex === null
          ? null
          : suggestions[selectedSuggestionIndex];

      if (suggestion) {
        addTokenFromDraft(suggestion);
        return;
      }

      addTokenFromText(tagText);
      return;
    }

    if (tagTokens.length > 0) {
      moveTokensToStaging();
    }
  }

  function addTokenFromText(value: string): void {
    const draft = parseTagText(value);

    if (draft) {
      addTokenFromDraft(draft);
    }
  }

  function addTokenFromDraft(draft: TagDraft): void {
    const key = createTagKey(draft);

    setTagTokens((currentTokens) =>
      currentTokens.some((token) => token.key === key)
        ? currentTokens
        : [
            ...currentTokens,
            {
              namespace: draft.namespace.trim(),
              name: draft.name.trim(),
              key,
            },
          ],
    );
    setTagText("");
    setSelectedSuggestionIndex(null);
  }

  function moveTokensToStaging(): void {
    if (tagTokens.length === 0 || tagText.trim()) {
      return;
    }

    setStagedTags((currentTags) => {
      const existingKeys = new Set(currentTags.map((tag) => tag.key));
      const nextTags = [...currentTags];

      for (const token of tagTokens) {
        if (existingKeys.has(token.key)) {
          continue;
        }

        existingKeys.add(token.key);
        nextTags.push({
          localId: nextStagedIdRef.current,
          key: token.key,
          namespace: token.namespace,
          name: token.name,
        });
        nextStagedIdRef.current += 1;
      }

      return nextTags;
    });
    setTagTokens([]);
    setMessage(t("window.tagManager.stagedTags", { count: tagTokens.length }));
  }

  function handleStagedTagMouseDown(
    event: MouseEvent<HTMLElement>,
    tag: StagedTag,
    index: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const isSelected = selectedStagedIds.includes(tag.localId);

    if (event.shiftKey && lastSelectedStagedId !== null) {
      const anchorIndex = stagedTags.findIndex(
        (item) => item.localId === lastSelectedStagedId,
      );

      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        const rangeIds = stagedTags
          .slice(start, end + 1)
          .map((item) => item.localId);

        setSelectedStagedIds((currentIds) =>
          event.ctrlKey ? mergeIds(currentIds, rangeIds) : rangeIds,
        );
      }

      return;
    }

    if (event.ctrlKey) {
      if (isSelected) {
        removeStagedTags(selectedStagedIds);
        return;
      }

      setSelectedStagedIds((currentIds) => [...currentIds, tag.localId]);
      setLastSelectedStagedId(tag.localId);
      return;
    }

    if (isSelected && selectedStagedIds.length === 1) {
      removeStagedTags([tag.localId]);
      return;
    }

    setSelectedStagedIds([tag.localId]);
    setLastSelectedStagedId(tag.localId);
  }

  function handleRelationSourceMouseDown(
    event: MouseEvent<HTMLElement>,
    tag: ManagedTagRecord,
    index: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    if (event.shiftKey && lastRelationSourceId !== null) {
      const anchorIndex = stagedExistingTagRecords.findIndex(
        (item) => item.id === lastRelationSourceId,
      );

      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        const rangeIds = stagedExistingTagRecords
          .slice(start, end + 1)
          .map((item) => item.id);

        setSelectedRelationSourceIds((currentIds) =>
          event.ctrlKey ? mergeIds(currentIds, rangeIds) : rangeIds,
        );
      }

      return;
    }

    if (event.ctrlKey) {
      setSelectedRelationSourceIds((currentIds) =>
        currentIds.includes(tag.id)
          ? currentIds.filter((id) => id !== tag.id)
          : [...currentIds, tag.id],
      );
      setLastRelationSourceId(tag.id);
      return;
    }

    setSelectedRelationSourceIds([tag.id]);
    setLastRelationSourceId(tag.id);
  }

  function handleRelationTagMouseDown(
    event: MouseEvent<HTMLElement>,
    tag: TagRecord,
    tagsInColumn: TagRecord[],
    kind: RelationKind,
    index: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const selectedIds =
      kind === "parent" ? selectedParentRelationIds : selectedChildRelationIds;
    const lastSelectedId =
      kind === "parent" ? lastParentRelationId : lastChildRelationId;
    const setSelectedIds =
      kind === "parent"
        ? setSelectedParentRelationIds
        : setSelectedChildRelationIds;
    const setLastSelectedId =
      kind === "parent" ? setLastParentRelationId : setLastChildRelationId;
    const isSelected = selectedIds.includes(tag.id);

    if (event.shiftKey && lastSelectedId !== null) {
      const anchorIndex = tagsInColumn.findIndex(
        (item) => item.id === lastSelectedId,
      );

      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, index);
        const end = Math.max(anchorIndex, index);
        const rangeIds = tagsInColumn
          .slice(start, end + 1)
          .map((item) => item.id);

        setSelectedIds((currentIds) =>
          event.ctrlKey ? mergeIds(currentIds, rangeIds) : rangeIds,
        );
      }

      return;
    }

    if (event.ctrlKey) {
      if (isSelected) {
        void removeRelationTags(selectedIds, kind);
        return;
      }

      setSelectedIds((currentIds) => [...currentIds, tag.id]);
      setLastSelectedId(tag.id);
      return;
    }

    if (isSelected && selectedIds.length === 1) {
      void removeRelationTags([tag.id], kind);
      return;
    }

    setSelectedIds([tag.id]);
    setLastSelectedId(tag.id);
  }

  function handleRelationInputKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    kind: RelationKind,
  ): void {
    if (event.nativeEvent.isComposing) {
      return;
    }

    const input = kind === "parent" ? parentInput : childInput;
    const suggestions =
      kind === "parent" ? parentSuggestions : childSuggestions;
    const setInput = kind === "parent" ? setParentInput : setChildInput;

    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex:
          currentInput.selectedSuggestionIndex === null
            ? 0
            : Math.min(
                currentInput.selectedSuggestionIndex + 1,
                suggestions.length - 1,
              ),
      }));
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex:
          currentInput.selectedSuggestionIndex === null
            ? suggestions.length - 1
            : Math.max(currentInput.selectedSuggestionIndex - 1, 0),
      }));
      return;
    }

    if (event.key === "Backspace" && input.text.length === 0) {
      setInput((currentInput) => ({
        ...currentInput,
        tokens: currentInput.tokens.slice(0, -1),
      }));
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (input.text.trim()) {
      const suggestion =
        input.selectedSuggestionIndex === null
          ? null
          : suggestions[input.selectedSuggestionIndex];

      if (suggestion) {
        addRelationInputToken(suggestion, kind);
      }

      return;
    }

    if (input.tokens.length > 0) {
      void addRelationTags(kind);
    }
  }

  function setRelationInputText(value: string, kind: RelationKind): void {
    const setInput = kind === "parent" ? setParentInput : setChildInput;
    setInput((currentInput) => ({
      ...currentInput,
      text: value,
      selectedSuggestionIndex: null,
    }));
  }

  function addRelationInputToken(
    tag: ManagedTagRecord,
    kind: RelationKind,
  ): void {
    const setInput = kind === "parent" ? setParentInput : setChildInput;

    setInput((currentInput) => {
      if (currentInput.tokens.some((token) => token.id === tag.id)) {
        return {
          ...currentInput,
          text: "",
          selectedSuggestionIndex: null,
        };
      }

      return {
        text: "",
        tokens: [...currentInput.tokens, tag],
        selectedSuggestionIndex: null,
      };
    });
  }

  async function addRelationTags(kind: RelationKind): Promise<void> {
    if (!window.asteria || selectedRelationSourceIds.length === 0) {
      return;
    }

    const input = kind === "parent" ? parentInput : childInput;

    if (input.tokens.length === 0 || input.text.trim()) {
      return;
    }

    let addedCount = 0;

    for (const sourceId of selectedRelationSourceIds) {
      for (const token of input.tokens) {
        const childTagId = kind === "parent" ? sourceId : token.id;
        const parentTagId = kind === "parent" ? token.id : sourceId;

        if (
          childTagId === parentTagId ||
          hasDirectParentRelation(tagParents, childTagId, parentTagId)
        ) {
          continue;
        }

        try {
          await window.asteria.addTagParent(childTagId, parentTagId);
          addedCount += 1;
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : t("window.tagManager.parentAddFailed"),
          );
        }
      }
    }

    if (kind === "parent") {
      setParentInput(createRelationInputState());
    } else {
      setChildInput(createRelationInputState());
    }

    await loadTagParents();
    setMessage(
      t("window.tagManager.parentRelationsAdded", { count: addedCount }),
    );
  }

  async function removeRelationTags(
    relationTagIds: number[],
    kind: RelationKind,
  ): Promise<void> {
    if (
      !window.asteria ||
      selectedRelationSourceIds.length === 0 ||
      relationTagIds.length === 0
    ) {
      return;
    }

    let removedCount = 0;

    for (const sourceId of selectedRelationSourceIds) {
      for (const relationTagId of relationTagIds) {
        const childTagId = kind === "parent" ? sourceId : relationTagId;
        const parentTagId = kind === "parent" ? relationTagId : sourceId;

        if (!hasDirectParentRelation(tagParents, childTagId, parentTagId)) {
          continue;
        }

        try {
          await window.asteria.removeTagParent(childTagId, parentTagId);
          removedCount += 1;
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : t("window.tagManager.parentRemoveFailed"),
          );
        }
      }
    }

    if (kind === "parent") {
      setSelectedParentRelationIds([]);
      setLastParentRelationId(null);
    } else {
      setSelectedChildRelationIds([]);
      setLastChildRelationId(null);
    }

    await loadTagParents();
    setMessage(
      t("window.tagManager.parentRelationsRemoved", { count: removedCount }),
    );
  }

  async function openRelationTreeWindow(): Promise<void> {
    const tagIds =
      selectedRelationSourceIds.length > 0
        ? selectedRelationSourceIds
        : stagedExistingTagRecords.map((tag) => tag.id);

    if (!window.asteria || tagIds.length === 0) {
      setMessage(t("window.tagManager.noRelationTreeTags"));
      return;
    }

    await window.asteria.openTagRelationTreeWindow(tagIds);
  }

  function removeStagedTags(localIds: number[]): void {
    setStagedTags((currentTags) =>
      currentTags.filter((tag) => !localIds.includes(tag.localId)),
    );
    setSelectedStagedIds([]);
    setLastSelectedStagedId(null);
  }

  async function createMissingTag(stagedTag: StagedTag): Promise<void> {
    if (!window.asteria || activeStyleId === null) {
      return;
    }

    try {
      const created = await window.asteria.createManagedTag(activeStyleId, {
        namespace: stagedTag.namespace,
        name: stagedTag.name,
      });
      updateStagedTag(stagedTag.localId, created);
      await refreshTagsAndStyles();
      setMessage(t("window.tagManager.createdTag"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.tagManager.createFailed"),
      );
    }
  }

  async function createAllMissingTags(): Promise<void> {
    if (
      !window.asteria ||
      activeStyleId === null ||
      stagedMissingTags.length === 0
    ) {
      return;
    }

    let createdCount = 0;

    for (const stagedTag of stagedMissingTags) {
      try {
        const created = await window.asteria.createManagedTag(activeStyleId, {
          namespace: stagedTag.namespace,
          name: stagedTag.name,
        });
        updateStagedTag(stagedTag.localId, created);
        createdCount += 1;
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : t("window.tagManager.createFailed"),
        );
      }
    }

    await refreshTagsAndStyles();
    setMessage(t("window.tagManager.createdTags", { count: createdCount }));
  }

  function openRenameDialog(staged: StagedTag, tag: ManagedTagRecord): void {
    setRenameDialog({
      localId: staged.localId,
      tagId: tag.id,
      value: formatTagLabel(tag),
    });
  }

  async function saveRenameDialog(): Promise<void> {
    if (!window.asteria || !renameDialog) {
      return;
    }

    const draft = parseTagText(renameDialog.value);

    if (!draft) {
      setMessage(t("window.tagManager.invalidTag"));
      return;
    }

    try {
      const renamed = await window.asteria.renameManagedTag(
        renameDialog.tagId,
        draft,
      );
      updateStagedTag(renameDialog.localId, renamed);
      setRenameDialog(null);
      await refreshTagsAndStyles();
      setMessage(t("window.tagManager.renamedTag"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.tagManager.renameFailed"),
      );
    }
  }

  async function deleteExistingTag(
    staged: StagedTag,
    tag: ManagedTagRecord,
  ): Promise<void> {
    if (!window.asteria) {
      return;
    }

    const confirmed = await window.asteria.confirmDialog({
      title: t("window.tagManager.confirmDeleteTagsTitle"),
      message: t("window.tagManager.confirmDeleteSingleTagMessage", {
        name: formatTagLabel(tag),
      }),
    });

    if (!confirmed) {
      return;
    }

    try {
      const result = await window.asteria.deleteManagedTag(tag.id);
      removeStagedTags([staged.localId]);
      await refreshTagsAndStyles();
      setMessage(
        t("window.tagManager.deletedTags", {
          tagCount: result.deletedTagCount,
          fileCount: result.deletedFileCount,
        }),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.tagManager.deleteFailed"),
      );
    }
  }

  async function refreshTagsAndStyles(): Promise<void> {
    await loadManagedTags();
    await loadStyles(activeStyleId ?? undefined);
    await loadTagParents();
  }

  function resetRelationSelection(): void {
    setSelectedRelationSourceIds([]);
    setLastRelationSourceId(null);
    setSelectedParentRelationIds([]);
    setLastParentRelationId(null);
    setSelectedChildRelationIds([]);
    setLastChildRelationId(null);
    setParentInput(createRelationInputState());
    setChildInput(createRelationInputState());
  }

  function updateStagedTag(localId: number, tag: TagDraft): void {
    const nextKey = createTagKey(tag);

    setStagedTags((currentTags) => {
      const nextTags = currentTags.map((currentTag) =>
        currentTag.localId === localId
          ? {
              ...currentTag,
              key: nextKey,
              namespace: tag.namespace,
              name: tag.name,
            }
          : currentTag,
      );
      const seenKeys = new Set<string>();

      return nextTags.filter((currentTag) => {
        if (seenKeys.has(currentTag.key)) {
          return false;
        }

        seenKeys.add(currentTag.key);
        return true;
      });
    });
  }

  function renderRelationInput(kind: RelationKind): JSX.Element {
    const input = kind === "parent" ? parentInput : childInput;
    const suggestions =
      kind === "parent" ? parentSuggestions : childSuggestions;
    const placeholder =
      kind === "parent"
        ? t("window.tagManager.addParentPlaceholder")
        : t("window.tagManager.addChildPlaceholder");
    const ariaLabel =
      kind === "parent"
        ? t("window.tagManager.addParentInput")
        : t("window.tagManager.addChildInput");

    return (
      <div
        className={relationInputShellClass}
        data-tag-selection-scope="relation-editor"
      >
        {suggestions.length > 0 ? (
          <div className="absolute left-1 right-[74px] top-[31px] z-[6] border border-(--line-strong) bg-(--panel)">
            {suggestions.map((tag, index) => (
              <button
                className={getTagNamespaceClassName(
                  tag,
                  index === input.selectedSuggestionIndex
                    ? "grid h-6 w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-2 border-0 border-b border-(--line) bg-(--accent-weak) px-1.5 text-left text-[11px] text-(--ink)"
                    : "grid h-6 w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-2 border-0 border-b border-(--line) bg-transparent px-1.5 text-left text-[11px] text-(--ink)",
                )}
                key={tag.id}
                style={getTagNamespaceStyle(tag)}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  addRelationInputToken(tag, kind);
                }}
              >
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {formatTagLabel(tag)}
                </span>
                <span className="text-right text-(--muted)">
                  {tag.fileCount}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <div className={relationInputClass}>
          {input.tokens.map((token) => (
            <span
              className={getTagNamespaceClassName(token, tagPillClass)}
              key={token.id}
              style={getTagNamespaceStyle(token)}
              title={formatTagLabel(token)}
            >
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {formatTagLabel(token)}
              </span>
            </span>
          ))}
          <input
            aria-label={ariaLabel}
            placeholder={input.tokens.length === 0 ? placeholder : ""}
            value={input.text}
            onChange={(event) => setRelationInputText(event.target.value, kind)}
            onKeyDown={(event) => handleRelationInputKeyDown(event, kind)}
          />
        </div>
        <button
          className={managerButtonClass}
          disabled={
            selectedRelationSourceIds.length === 0 ||
            input.tokens.length === 0 ||
            Boolean(input.text.trim())
          }
          type="button"
          onClick={() => void addRelationTags(kind)}
        >
          {t("window.tagManager.addRelation")}
        </button>
      </div>
    );
  }

  function renderRelationTagList(kind: RelationKind): JSX.Element {
    const relationTags = kind === "parent" ? commonParentTags : commonChildTags;
    const selectedIds =
      kind === "parent" ? selectedParentRelationIds : selectedChildRelationIds;
    const listRef =
      kind === "parent" ? parentRelationListRef : childRelationListRef;
    const box =
      kind === "parent"
        ? parentRelationBoxSelection
        : childRelationBoxSelection;
    const emptyMessage =
      selectedRelationSourceIds.length === 0
        ? t("window.tagManager.noRelationSourceSelected")
        : kind === "parent"
          ? t("window.tagManager.noCommonParents")
          : t("window.tagManager.noCommonChildren");

    return (
      <div
        className={relationListClass}
        data-tag-selection-scope={`relation-${kind}`}
        ref={listRef}
        onMouseDownCapture={box.handleMouseDownCapture}
      >
        {relationTags.length > 0 ? (
          relationTags.map((tag, index) => (
            <button
              className={getTagNamespaceClassName(
                tag,
                selectedIds.includes(tag.id)
                  ? `${relationRowClass} ${relationRowSelectedClass}`
                  : relationRowClass,
              )}
              data-box-select-id={tag.id}
              data-tag-selection-group={`relation-${kind}`}
              key={tag.id}
              style={getTagNamespaceStyle(tag)}
              title={formatTagLabel(tag)}
              type="button"
              onMouseDown={(event) =>
                handleRelationTagMouseDown(
                  event,
                  tag,
                  relationTags,
                  kind,
                  index,
                )
              }
            >
              {formatTagLabel(tag)}
            </button>
          ))
        ) : (
          <div className={emptyClass}>{emptyMessage}</div>
        )}
        {box.selectionBox ? (
          <div
            className="absolute z-40 border border-(--accent) bg-(--accent-overlay) pointer-events-none"
            style={box.selectionBox}
          />
        ) : null}
      </div>
    );
  }

  return (
    <ResizableColumns
      className={managerShellClass}
      defaultLeftWidth={180}
      minLeftWidth={130}
      minRightWidth={520}
      storageKey="asteria:tag-manager-sidebar-width"
      left={
        <aside className={managerSidebarClass}>
          <header className={managerSidebarHeaderClass}>
            {t("window.tagManager.styleList")}
          </header>
          <div className={managerListClass}>
            {styles.map((style) => (
              <button
                className={`${managerListItemClass} ${
                  style.id === activeStyleId ? managerListItemActiveClass : ""
                }`}
                aria-current={style.id === activeStyleId ? "true" : undefined}
                key={style.id}
                type="button"
                onClick={() => selectStyle(style.id)}
              >
                <span className="text-center text-(--success-ink)">
                  {style.isDefault ? "√" : ""}
                </span>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {style.displayName}
                </span>
                <span className="text-right text-(--muted)">
                  {style.tagCount}
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 border-t border-(--line) p-2">
            <input
              className={managerInputClass}
              aria-label={t("window.tagManager.newStyle")}
              placeholder={t("window.tagManager.newStylePlaceholder")}
              value={styleInput}
              onChange={(event) => setStyleInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void createStyle();
                }
              }}
            />
            <button
              className={managerButtonClass}
              type="button"
              onClick={() => void createStyle()}
            >
              {t("window.tagManager.create")}
            </button>
          </div>
        </aside>
      }
      right={
        <main className={managerPanelClass}>
          <ResizableRows
            className="h-full bg-(--panel)"
            defaultTopHeight={290}
            minTopHeight={150}
            minBottomHeight={170}
            storageKey="asteria:tag-manager-main-top-height"
            top={
              <ResizableColumns
                className="h-full bg-(--panel)"
                defaultLeftWidth={460}
                minLeftWidth={280}
                minRightWidth={360}
                storageKey="asteria:tag-manager-top-style-width"
                left={
                  <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border-b border-(--line) bg-(--panel) p-2">
                    <div className="grid min-w-0 gap-1.5">
                      <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold text-(--ink)">
                        {selectedStyle?.displayName ??
                          t("window.tagManager.noStyleSelected")}
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                        <input
                          className={managerInputClass}
                          aria-label={t("window.tagManager.renameStyle")}
                          placeholder={t(
                            "window.tagManager.renameStylePlaceholder",
                          )}
                          value={styleRenameInput}
                          onChange={(event) =>
                            setStyleRenameInput(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              void renameStyle();
                            }
                          }}
                        />
                        <button
                          className={managerButtonClass}
                          disabled={activeStyleId === null}
                          type="button"
                          onClick={() => void renameStyle()}
                        >
                          {t("window.tagManager.rename")}
                        </button>
                      </div>
                      <div className={messageClass}>
                        {selectedStyle
                          ? t("window.tagManager.styleSummary", {
                              count: selectedStyle.tagCount,
                            })
                          : t("window.tagManager.noStyleSelected")}
                      </div>
                      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-1.5">
                        <button
                          className={managerButtonClass}
                          disabled={activeStyleId === null}
                          type="button"
                          onClick={() => void activateStyle()}
                        >
                          {t("window.tagManager.enableStyle")}
                        </button>
                        <button
                          className={managerButtonClass}
                          disabled={activeStyleId === null}
                          type="button"
                          onClick={() => void deleteStyle()}
                        >
                          {t("window.tagManager.deleteStyle")}
                        </button>
                        <span />
                      </div>
                    </div>
                  </section>
                }
                right={
                  <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-(--panel)">
                    <div className="relative border-b border-(--line) bg-(--surface-input-panel-bg)">
                      {suggestions.length > 0 ? (
                        <div className="absolute left-0 right-0 top-full z-[5] border border-(--line-strong) bg-(--panel)">
                          {suggestions.map((tag, index) => (
                            <button
                              className={getTagNamespaceClassName(
                                tag,
                                index === selectedSuggestionIndex
                                  ? "grid h-6 w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-2 border-0 border-b border-(--line) bg-(--accent-weak) px-1.5 text-left text-[11px] text-(--ink)"
                                  : "grid h-6 w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-2 border-0 border-b border-(--line) bg-transparent px-1.5 text-left text-[11px] text-(--ink)",
                              )}
                              key={tag.id}
                              style={getTagNamespaceStyle(tag)}
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                addTokenFromDraft(tag);
                              }}
                            >
                              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                                {formatTagLabel(tag)}
                              </span>
                              <span className="text-right text-(--muted)">
                                {tag.fileCount}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="grid min-h-[32px] grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5 p-1">
                        <div className="tag-token-input min-h-6 border border-(--line-strong) bg-(--surface-inset-bg)">
                          {tagTokens.map((token) => (
                            <span
                              className={getTagNamespaceClassName(
                                token,
                                tagPillClass,
                              )}
                              key={token.key}
                              style={getTagNamespaceStyle(token)}
                              title={formatTagLabel(token)}
                            >
                              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                                {formatTagLabel(token)}
                              </span>
                            </span>
                          ))}
                          <input
                            aria-label={t("window.tagManager.tagEntry")}
                            placeholder={
                              tagTokens.length === 0
                                ? t("window.tagManager.tagEntryPlaceholder")
                                : ""
                            }
                            value={tagText}
                            onChange={(event) => setTagText(event.target.value)}
                            onKeyDown={handleEntryKeyDown}
                          />
                        </div>
                        <button
                          className={managerButtonClass}
                          disabled={
                            activeStyleId === null ||
                            tagTokens.length === 0 ||
                            Boolean(tagText.trim())
                          }
                          type="button"
                          onClick={moveTokensToStaging}
                        >
                          {t("window.tagManager.moveToStaging")}
                        </button>
                      </div>
                    </div>

                    <section className="grid min-h-0 grid-rows-[27px_minmax(0,1fr)]">
                      <header className={sectionHeaderClass}>
                        <span>{t("window.tagManager.stagingArea")}</span>
                        <span className="font-normal text-(--muted)">
                          {t("window.tagManager.stagingCount", {
                            count: stagedTags.length,
                          })}
                        </span>
                      </header>
                      <div
                        className="relative flex min-h-0 flex-wrap content-start gap-1 overflow-auto bg-(--surface-bg) p-1.5"
                        data-tag-selection-scope="staged"
                        ref={stagedListRef}
                        onMouseDownCapture={boxSelection.handleMouseDownCapture}
                      >
                        {stagedTags.length > 0 ? (
                          stagedTags.map((tag, index) => (
                            <button
                              className={getTagNamespaceClassName(
                                tag,
                                selectedStagedIds.includes(tag.localId)
                                  ? `${tagPillClass} ${tagPillSelectedClass}`
                                  : tagPillClass,
                              )}
                              data-box-select-id={tag.localId}
                              data-tag-selection-group="staged"
                              key={tag.localId}
                              style={getTagNamespaceStyle(tag)}
                              title={formatTagLabel(tag)}
                              type="button"
                              onMouseDown={(event) =>
                                handleStagedTagMouseDown(event, tag, index)
                              }
                            >
                              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                                {formatTagLabel(tag)}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className={emptyClass}>
                            {t("window.tagManager.noStagedTags")}
                          </div>
                        )}
                        {boxSelection.selectionBox ? (
                          <div
                            className="absolute z-40 border border-(--accent) bg-(--accent-overlay) pointer-events-none"
                            style={boxSelection.selectionBox}
                          />
                        ) : null}
                      </div>
                    </section>
                  </section>
                }
              />
            }
            bottom={
              <section className="grid min-h-0 grid-rows-[28px_minmax(0,1fr)] bg-(--panel)">
                <nav className="grid grid-cols-[auto_auto_minmax(0,1fr)] border-b border-(--line) bg-(--panel-strong)">
                  <button
                    className={`h-7 border-0 border-r border-(--line) px-3 text-[11px] ${
                      operationTab === "basic"
                        ? "bg-(--surface-raised-bg) text-(--ink)"
                        : "bg-transparent text-(--muted)"
                    }`}
                    type="button"
                    onClick={() => setOperationTab("basic")}
                  >
                    {t("window.tagManager.basicInfo")}
                  </button>
                  <button
                    className={`h-7 border-0 border-r border-(--line) px-3 text-[11px] ${
                      operationTab === "relations"
                        ? "bg-(--surface-raised-bg) text-(--ink)"
                        : "bg-transparent text-(--muted)"
                    }`}
                    type="button"
                    onClick={() => setOperationTab("relations")}
                  >
                    {t("window.tagManager.tagRelations")}
                  </button>
                  <span className="px-2 leading-7 text-[11px] text-(--muted)">
                    {t("window.tagManager.operationArea")}
                  </span>
                </nav>

                {operationTab === "basic" ? (
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
                        <div className={operationHeadRowClass}>
                          <span>{t("window.tagManager.nameColumn")}</span>
                          <span className="text-right">
                            {t("window.tagManager.fileCountColumn")}
                          </span>
                          <span>{t("window.tagManager.createdAtColumn")}</span>
                          <span>{t("window.tagManager.operationColumn")}</span>
                        </div>
                        <div className="min-h-0 overflow-auto">
                          {stagedExistingTags.length > 0 ? (
                            stagedExistingTags.map(({ staged, tag }) => (
                              <div
                                className={operationRowClass}
                                key={staged.localId}
                              >
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
                                    className="h-6 min-w-[54px] border border-(--line-strong) bg-(--panel-strong) px-1.5 text-[11px] text-(--ink)"
                                    type="button"
                                    onClick={() =>
                                      openRenameDialog(staged, tag)
                                    }
                                  >
                                    {t("window.tagManager.rename")}
                                  </button>
                                  <button
                                    className="h-6 min-w-[54px] border border-(--line-strong) bg-(--panel-strong) px-1.5 text-[11px] text-(--ink)"
                                    type="button"
                                    onClick={() =>
                                      void deleteExistingTag(staged, tag)
                                    }
                                  >
                                    {t("window.tagManager.delete")}
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
                      <div className="grid min-h-0 grid-rows-[27px_24px_minmax(0,1fr)_30px] bg-(--surface-bg)">
                        <header className={sectionHeaderClass}>
                          <span>{t("window.tagManager.tagsToCreate")}</span>
                          <span className="font-normal text-(--muted)">
                            {stagedMissingTags.length}
                          </span>
                        </header>
                        <div className={operationHeadRowClass}>
                          <span>{t("window.tagManager.nameColumn")}</span>
                          <span className="text-right">
                            {t("window.tagManager.fileCountColumn")}
                          </span>
                          <span>{t("window.tagManager.createdAtColumn")}</span>
                          <span>{t("window.tagManager.operationColumn")}</span>
                        </div>
                        <div className="min-h-0 overflow-auto">
                          {stagedMissingTags.length > 0 ? (
                            stagedMissingTags.map((staged) => (
                              <div
                                className={operationRowClass}
                                key={staged.localId}
                              >
                                <span
                                  className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--ink)"
                                  title={formatTagLabel(staged)}
                                >
                                  {formatTagLabel(staged)}
                                </span>
                                <span className="text-right tabular-nums text-(--muted)">
                                  -
                                </span>
                                <span className="text-(--muted)">-</span>
                                <span className="flex justify-end">
                                  <button
                                    className="h-6 min-w-[54px] border border-(--line-strong) bg-(--panel-strong) px-1.5 text-[11px] text-(--ink)"
                                    disabled={activeStyleId === null}
                                    type="button"
                                    onClick={() =>
                                      void createMissingTag(staged)
                                    }
                                  >
                                    {t("window.tagManager.create")}
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
                            disabled={
                              activeStyleId === null ||
                              stagedMissingTags.length === 0
                            }
                            type="button"
                            onClick={() => void createAllMissingTags()}
                          >
                            {t("window.tagManager.createAll")}
                          </button>
                        </footer>
                      </div>
                    }
                  />
                ) : (
                  <section className="grid min-h-0 grid-cols-[minmax(180px,0.8fr)_minmax(240px,0.72fr)_minmax(240px,0.72fr)_minmax(260px,1fr)] bg-(--panel)">
                    <section className="grid min-h-0 grid-rows-[27px_minmax(0,1fr)] border-r border-(--line) bg-(--surface-bg)">
                      <header className={sectionHeaderClass}>
                        <span>{t("window.tagManager.relationSourceTags")}</span>
                        <span className="font-normal text-(--muted)">
                          {selectedRelationSourceIds.length} /{" "}
                          {stagedExistingTagRecords.length}
                        </span>
                      </header>
                      <div
                        className={relationListClass}
                        data-tag-selection-scope="relation-source"
                        ref={relationSourceListRef}
                        onMouseDownCapture={
                          relationSourceBoxSelection.handleMouseDownCapture
                        }
                      >
                        {stagedExistingTagRecords.length > 0 ? (
                          stagedExistingTagRecords.map((tag, index) => (
                            <button
                              className={getTagNamespaceClassName(
                                tag,
                                selectedRelationSourceIds.includes(tag.id)
                                  ? `${relationRowClass} ${relationRowSelectedClass}`
                                  : relationRowClass,
                              )}
                              data-box-select-id={tag.id}
                              data-tag-selection-group="relation-source"
                              key={tag.id}
                              style={getTagNamespaceStyle(tag)}
                              title={formatTagLabel(tag)}
                              type="button"
                              onMouseDown={(event) =>
                                handleRelationSourceMouseDown(event, tag, index)
                              }
                            >
                              {formatTagLabel(tag)}
                            </button>
                          ))
                        ) : (
                          <div className={emptyClass}>
                            {t("window.tagManager.noExistingStagedTags")}
                          </div>
                        )}
                        {relationSourceBoxSelection.selectionBox ? (
                          <div
                            className="absolute z-40 border border-(--accent) bg-(--accent-overlay) pointer-events-none"
                            style={relationSourceBoxSelection.selectionBox}
                          />
                        ) : null}
                      </div>
                    </section>

                    <section className={relationColumnClass}>
                      <header className={sectionHeaderClass}>
                        <span>{t("window.tagManager.directParents")}</span>
                        <span className="font-normal text-(--muted)">
                          {commonParentTags.length}
                        </span>
                      </header>
                      {renderRelationInput("parent")}
                      {renderRelationTagList("parent")}
                    </section>

                    <section className={relationColumnClass}>
                      <header className={sectionHeaderClass}>
                        <span>{t("window.tagManager.directChildren")}</span>
                        <span className="font-normal text-(--muted)">
                          {commonChildTags.length}
                        </span>
                      </header>
                      {renderRelationInput("child")}
                      {renderRelationTagList("child")}
                    </section>

                    <section
                      className="relative min-h-0 bg-(--surface-bg)"
                      data-tag-selection-scope="relation-tools"
                    >
                      <button
                        className="absolute bottom-2 right-2 h-7 min-w-[92px] border border-(--line-strong) bg-(--panel-strong) px-2 text-[11px] text-(--ink)"
                        type="button"
                        onClick={() => void openRelationTreeWindow()}
                      >
                        {t("window.tagManager.openRelationTree")}
                      </button>
                    </section>
                  </section>
                )}
              </section>
            }
          />

          <footer className="flex items-center justify-between border-t border-(--line) bg-(--surface-bg) px-2 text-[11px] text-(--muted)">
            <span>{message}</span>
            <span>
              {t("window.tagManager.selectedCount", {
                count: selectedTagCount,
              })}
            </span>
          </footer>

          {renameDialog ? (
            <div className="absolute inset-0 z-50 grid place-items-center bg-black/20">
              <section className="grid w-[340px] gap-2 border border-(--line-strong) bg-(--bg) p-3 text-[11px] text-(--ink) shadow-lg">
                <header className="font-semibold">
                  {t("window.tagManager.renameTag")}
                </header>
                <input
                  autoFocus
                  className={managerInputClass}
                  aria-label={t("window.tagManager.renameTag")}
                  value={renameDialog.value}
                  onChange={(event) =>
                    setRenameDialog({
                      ...renameDialog,
                      value: event.target.value,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void saveRenameDialog();
                    }

                    if (event.key === "Escape") {
                      setRenameDialog(null);
                    }
                  }}
                />
                <footer className="flex justify-end gap-1">
                  <button
                    className={managerButtonClass}
                    type="button"
                    onClick={() => setRenameDialog(null)}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    className={managerButtonClass}
                    type="button"
                    onClick={() => void saveRenameDialog()}
                  >
                    {t("common.save")}
                  </button>
                </footer>
              </section>
            </div>
          ) : null}
        </main>
      }
    />
  );
}

function createTagMap(tags: ManagedTagRecord[]): Map<string, ManagedTagRecord> {
  const map = new Map<string, ManagedTagRecord>();

  for (const tag of tags) {
    map.set(createTagKey(tag), tag);
  }

  return map;
}

function createTagSuggestions(
  tags: ManagedTagRecord[],
  text: string,
  tokens: TagEntryToken[],
): ManagedTagRecord[] {
  const query = text.trim().toLowerCase();

  if (!query) {
    return [];
  }

  const tokenKeys = new Set(tokens.map((token) => token.key));

  return tags
    .filter((tag) => {
      if (tokenKeys.has(createTagKey(tag))) {
        return false;
      }

      const label = formatTagLabel(tag).toLowerCase();
      const displayName = tag.displayName?.toLowerCase() ?? "";
      return label.includes(query) || displayName.includes(query);
    })
    .sort((left, right) => {
      const leftLabel = formatTagLabel(left).toLowerCase();
      const rightLabel = formatTagLabel(right).toLowerCase();
      const leftStarts = leftLabel.startsWith(query) ? 0 : 1;
      const rightStarts = rightLabel.startsWith(query) ? 0 : 1;

      if (leftStarts !== rightStarts) {
        return leftStarts - rightStarts;
      }

      if ((right.fileCount ?? 0) !== (left.fileCount ?? 0)) {
        return (right.fileCount ?? 0) - (left.fileCount ?? 0);
      }

      return leftLabel.localeCompare(rightLabel);
    })
    .slice(0, 10);
}

function createExistingStagedTags(
  stagedTags: StagedTag[],
  tagsByKey: Map<string, ManagedTagRecord>,
): StagedExistingTag[] {
  return stagedTags.flatMap((staged) => {
    const tag = tagsByKey.get(staged.key);
    return tag ? [{ staged, tag }] : [];
  });
}

function createCommonRelationTags(
  sourceTagIds: number[],
  relations: TagParentRecord[],
  kind: RelationKind,
): TagRecord[] {
  if (sourceTagIds.length === 0) {
    return [];
  }

  const relationGroups = sourceTagIds.map((sourceTagId) => {
    const relatedTags =
      kind === "parent"
        ? relations
            .filter((relation) => relation.child.id === sourceTagId)
            .map((relation) => relation.parent)
        : relations
            .filter((relation) => relation.parent.id === sourceTagId)
            .map((relation) => relation.child);

    return new Map(relatedTags.map((tag) => [tag.id, tag]));
  });
  const [firstGroup, ...remainingGroups] = relationGroups;

  if (!firstGroup) {
    return [];
  }

  return [...firstGroup.values()]
    .filter((tag) => remainingGroups.every((group) => group.has(tag.id)))
    .sort((left, right) =>
      formatTagLabel(left).localeCompare(formatTagLabel(right)),
    );
}

function createRelationSuggestions(
  tags: ManagedTagRecord[],
  text: string,
  tokens: ManagedTagRecord[],
  excludedTagIds: number[],
): ManagedTagRecord[] {
  const query = text.trim().toLowerCase();

  if (!query) {
    return [];
  }

  const tokenIds = new Set(tokens.map((token) => token.id));
  const excludedIds = new Set(excludedTagIds);

  return tags
    .filter((tag) => {
      if (tokenIds.has(tag.id) || excludedIds.has(tag.id)) {
        return false;
      }

      const label = formatTagLabel(tag).toLowerCase();
      const displayName = tag.displayName?.toLowerCase() ?? "";
      return label.includes(query) || displayName.includes(query);
    })
    .sort((left, right) => {
      const leftLabel = formatTagLabel(left).toLowerCase();
      const rightLabel = formatTagLabel(right).toLowerCase();
      const leftStarts = leftLabel.startsWith(query) ? 0 : 1;
      const rightStarts = rightLabel.startsWith(query) ? 0 : 1;

      if (leftStarts !== rightStarts) {
        return leftStarts - rightStarts;
      }

      if ((right.fileCount ?? 0) !== (left.fileCount ?? 0)) {
        return (right.fileCount ?? 0) - (left.fileCount ?? 0);
      }

      return leftLabel.localeCompare(rightLabel);
    })
    .slice(0, 10);
}

function hasDirectParentRelation(
  relations: TagParentRecord[],
  childTagId: number,
  parentTagId: number,
): boolean {
  return relations.some(
    (relation) =>
      relation.child.id === childTagId && relation.parent.id === parentTagId,
  );
}

function createTagKey(tag: Pick<TagDraft, "namespace" | "name">): string {
  return `${tag.namespace.trim().toLowerCase()}:${tag.name
    .trim()
    .toLowerCase()}`;
}

function formatDate(value: string): string {
  const [date] = value.split(" ");
  return date || value;
}
