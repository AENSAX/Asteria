import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type {
  ManagedTagSortKey,
  ManagedTagRecord,
  ManagedTagRenamePreview,
  SortDirection,
  TagDraft,
  TagParentRecord,
  TagRecord,
  TagSiblingRecord,
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

interface StagedTag extends TagDraft {
  key: string;
  localId: number;
}

interface PendingCreateTag extends TagDraft {
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

interface VirtualManagedTagRow {
  tag: ManagedTagRecord;
  top: number;
}

const tagSortKey = "name";
const tagSortDirection: SortDirection = "asc";
const TAG_CATALOG_ROW_HEIGHT = 28;
const TAG_CATALOG_OVERSCAN_PX = 180;

const managerShellClass =
  "grid h-full min-h-0 min-w-0 grid-cols-[180px_minmax(0,1fr)] bg-(--panel)";
const managerSidebarClass =
  "flex min-h-0 min-w-0 flex-col border-r border-(--line) bg-(--surface-bg)";
const managerSidebarHeaderClass =
  "grid h-7 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-(--line) bg-(--panel-strong) px-2 text-[11px] font-semibold";
const managerListClass = "min-h-0 flex-1 overflow-auto";
const managerListItemClass =
  "grid min-h-[26px] w-full grid-cols-[18px_minmax(0,1fr)_42px] items-center border-0 border-b border-(--line) bg-transparent px-2 text-left text-[11px] text-(--ink)";
const managerListItemActiveClass = "bg-(--surface-raised-bg)";
const managerInputClass =
  "h-6 min-w-0 border border-(--line-strong) bg-(--surface-inset-bg) px-1.5 text-(--ink)";
const managerButtonClass = "ui-button min-w-[70px]";
const tagCatalogRowClass =
  "absolute left-0 right-0 grid w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-1 border-0 border-b border-(--line) bg-transparent px-2 text-left text-[11px] text-(--ink) hover:bg-(--accent-weak)";
const tagCatalogHeadClass =
  "grid h-6 grid-cols-[minmax(0,1fr)_44px] items-center gap-1 border-b border-(--line) bg-(--panel) px-2 text-[11px] font-semibold text-(--muted)";
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
  const [tagListQuery, setTagListQuery] = useState("");
  const [tagListSortKey, setTagListSortKey] =
    useState<ManagedTagSortKey>("name");
  const [tagListSortDirection, setTagListSortDirection] =
    useState<SortDirection>("asc");
  const [tagCatalogViewport, setTagCatalogViewport] = useState({
    scrollTop: 0,
    height: 0,
  });
  const [styleInput, setStyleInput] = useState("");
  const [styleRenameInput, setStyleRenameInput] = useState("");
  const [createTagText, setCreateTagText] = useState("");
  const [pendingCreateTags, setPendingCreateTags] = useState<
    PendingCreateTag[]
  >([]);
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
  const [renamePreview, setRenamePreview] =
    useState<ManagedTagRenamePreview | null>(null);
  const [renamePreviewMessage, setRenamePreviewMessage] = useState("");
  const [tagParents, setTagParents] = useState<TagParentRecord[]>([]);
  const [tagSiblings, setTagSiblings] = useState<TagSiblingRecord[]>([]);
  const [selectedRelationSourceIds, setSelectedRelationSourceIds] = useState<
    number[]
  >([]);
  const [lastRelationSourceId, setLastRelationSourceId] = useState<
    number | null
  >(null);
  const [parentInput, setParentInput] = useState(createRelationInputState);
  const [childInput, setChildInput] = useState(createRelationInputState);
  const [canonicalInput, setCanonicalInput] = useState(
    createRelationInputState,
  );
  const [aliasInput, setAliasInput] = useState(createRelationInputState);
  const nextStagedIdRef = useRef(1);
  const nextPendingCreateIdRef = useRef(1);
  const stagedListRef = useRef<HTMLDivElement | null>(null);
  const relationSourceListRef = useRef<HTMLDivElement | null>(null);
  const tagCatalogListRef = useRef<HTMLDivElement | null>(null);
  const tagCatalogFrameRef = useRef<number | null>(null);
  const selectedStyle =
    styles.find((style) => style.id === activeStyleId) ?? null;
  const tagsByKey = useMemo(() => createTagMap(tags), [tags]);
  const displayedTags = useMemo(
    () =>
      sortManagedTags(
        filterManagedTags(tags, tagListQuery, tagParents, tagSiblings),
        tagListSortKey,
        tagListSortDirection,
      ),
    [
      tagListQuery,
      tagListSortDirection,
      tagListSortKey,
      tagParents,
      tagSiblings,
      tags,
    ],
  );
  const visibleTagCatalogRows = useMemo(
    () =>
      pickVisibleManagedTagRows(
        displayedTags,
        tagCatalogViewport.scrollTop,
        tagCatalogViewport.height,
      ),
    [displayedTags, tagCatalogViewport.height, tagCatalogViewport.scrollTop],
  );
  const createTagDraft = useMemo(
    () => parseTagText(createTagText),
    [createTagText],
  );
  const existingCreateTag = createTagDraft
    ? (tagsByKey.get(createTagKey(createTagDraft)) ?? null)
    : null;
  const pendingCreateKey = createTagDraft ? createTagKey(createTagDraft) : "";
  const pendingCreateTagExists =
    Boolean(pendingCreateKey) &&
    pendingCreateTags.some((tag) => tag.key === pendingCreateKey);
  const stagedExistingTags = useMemo(
    () => createExistingStagedTags(stagedTags, tagsByKey),
    [stagedTags, tagsByKey],
  );
  const stagedExistingTagRecords = useMemo(
    () => stagedExistingTags.map(({ tag }) => tag),
    [stagedExistingTags],
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
  const canonicalSuggestions = useMemo(
    () =>
      createRelationSuggestions(
        tags,
        canonicalInput.text,
        canonicalInput.tokens,
        selectedRelationSourceIds,
      ),
    [
      canonicalInput.text,
      canonicalInput.tokens,
      selectedRelationSourceIds,
      tags,
    ],
  );
  const aliasSuggestions = useMemo(
    () =>
      createRelationSuggestions(
        tags,
        aliasInput.text,
        aliasInput.tokens,
        selectedRelationSourceIds,
      ),
    [aliasInput.text, aliasInput.tokens, selectedRelationSourceIds, tags],
  );
  const commonCanonicalTags = useMemo(
    () => createCommonCanonicalTags(selectedRelationSourceIds, tagSiblings),
    [selectedRelationSourceIds, tagSiblings],
  );
  const selectedCanonicalTargets = useMemo(
    () => createCanonicalTargetRows(selectedRelationSourceIds, tagSiblings),
    [selectedRelationSourceIds, tagSiblings],
  );
  const selectedTagAliases = useMemo(
    () => createAliasRows(selectedRelationSourceIds, tagSiblings),
    [selectedRelationSourceIds, tagSiblings],
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
  const selectedTagCount =
    selectedStagedIds.length + selectedRelationSourceIds.length;

  useEffect(() => {
    void loadStyles();
    void loadTagParents();
    void loadTagSiblings();
  }, []);

  useEffect(() => {
    updateTagCatalogViewport();
  }, [displayedTags.length]);

  useEffect(() => {
    const list = tagCatalogListRef.current;

    if (!list) {
      return undefined;
    }

    const observer = new ResizeObserver(updateTagCatalogViewport);
    observer.observe(list);
    updateTagCatalogViewport();

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const list = tagCatalogListRef.current;

    if (list) {
      list.scrollTop = 0;
    }

    updateTagCatalogViewport();
  }, [activeStyleId, tagListQuery, tagListSortDirection, tagListSortKey]);

  useEffect(() => {
    return () => {
      if (tagCatalogFrameRef.current !== null) {
        cancelAnimationFrame(tagCatalogFrameRef.current);
      }
    };
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

    function handleDocumentMouseDown(event: globalThis.MouseEvent): void {
      const target = event.target instanceof Element ? event.target : null;
      const itemGroup =
        target?.closest<HTMLElement>("[data-tag-selection-group]")?.dataset
          .tagSelectionGroup ?? null;
      const scopeGroup =
        target?.closest<HTMLElement>("[data-tag-selection-scope]")?.dataset
          .tagSelectionScope ?? null;
      const selectionGroup = itemGroup ?? scopeGroup;

      if (selectionGroup === "staged" && itemGroup) {
        clearRelationSourceSelection();
        return;
      }

      if (selectionGroup === "relation-source" && itemGroup) {
        clearStagedSelection();
        return;
      }

      if (
        selectionGroup === "relation-editor" ||
        selectionGroup === "relation-tools" ||
        selectionGroup === "relation-parent" ||
        selectionGroup === "relation-child"
      ) {
        clearStagedSelection();
        return;
      }

      clearStagedSelection();
      clearRelationSourceSelection();
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
    void loadRenamePreview();
  }, [renameDialog?.tagId, renameDialog?.value]);

  useEffect(() => {
    setSelectedRelationSourceIds((currentIds) =>
      currentIds.filter((id) =>
        stagedExistingTagRecords.some((tag) => tag.id === id),
      ),
    );
  }, [stagedExistingTagRecords]);

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

  useEffect(() => {
    if (
      canonicalInput.selectedSuggestionIndex !== null &&
      canonicalInput.selectedSuggestionIndex >= canonicalSuggestions.length
    ) {
      setCanonicalInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex: null,
      }));
    }
  }, [canonicalInput.selectedSuggestionIndex, canonicalSuggestions.length]);

  useEffect(() => {
    if (
      aliasInput.selectedSuggestionIndex !== null &&
      aliasInput.selectedSuggestionIndex >= aliasSuggestions.length
    ) {
      setAliasInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex: null,
      }));
    }
  }, [aliasInput.selectedSuggestionIndex, aliasSuggestions.length]);

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
    setMessage("");
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

  async function loadTagSiblings(): Promise<void> {
    if (!window.asteria) {
      setTagSiblings([]);
      return;
    }

    setTagSiblings(await window.asteria.listTagSiblings());
  }

  function updateTagCatalogViewport(): void {
    const list = tagCatalogListRef.current;

    if (!list) {
      setTagCatalogViewport({ scrollTop: 0, height: 0 });
      return;
    }

    setTagCatalogViewport({
      scrollTop: list.scrollTop,
      height: list.clientHeight,
    });
  }

  function scheduleTagCatalogViewportUpdate(): void {
    if (tagCatalogFrameRef.current !== null) {
      cancelAnimationFrame(tagCatalogFrameRef.current);
    }

    tagCatalogFrameRef.current = requestAnimationFrame(() => {
      tagCatalogFrameRef.current = null;
      updateTagCatalogViewport();
    });
  }

  function selectStyle(styleId: number): void {
    setActiveStyleId(styleId);
    setTagListQuery("");
    setCreateTagText("");
    setPendingCreateTags([]);
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

  function handleCanonicalInputKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "ArrowDown" && canonicalSuggestions.length > 0) {
      event.preventDefault();
      setCanonicalInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex:
          currentInput.selectedSuggestionIndex === null
            ? 0
            : Math.min(
                currentInput.selectedSuggestionIndex + 1,
                canonicalSuggestions.length - 1,
              ),
      }));
      return;
    }

    if (event.key === "ArrowUp" && canonicalSuggestions.length > 0) {
      event.preventDefault();
      setCanonicalInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex:
          currentInput.selectedSuggestionIndex === null
            ? canonicalSuggestions.length - 1
            : Math.max(currentInput.selectedSuggestionIndex - 1, 0),
      }));
      return;
    }

    if (event.key === "Backspace" && canonicalInput.text.length === 0) {
      setCanonicalInput((currentInput) => ({
        ...currentInput,
        tokens: currentInput.tokens.slice(0, -1),
      }));
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (canonicalInput.text.trim()) {
      const suggestion =
        canonicalInput.selectedSuggestionIndex === null
          ? null
          : canonicalSuggestions[canonicalInput.selectedSuggestionIndex];

      if (suggestion) {
        addCanonicalInputToken(suggestion);
      }

      return;
    }

    if (canonicalInput.tokens.length > 0) {
      void setCanonicalTagForSelectedSources();
    }
  }

  function handleAliasInputKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "ArrowDown" && aliasSuggestions.length > 0) {
      event.preventDefault();
      setAliasInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex:
          currentInput.selectedSuggestionIndex === null
            ? 0
            : Math.min(
                currentInput.selectedSuggestionIndex + 1,
                aliasSuggestions.length - 1,
              ),
      }));
      return;
    }

    if (event.key === "ArrowUp" && aliasSuggestions.length > 0) {
      event.preventDefault();
      setAliasInput((currentInput) => ({
        ...currentInput,
        selectedSuggestionIndex:
          currentInput.selectedSuggestionIndex === null
            ? aliasSuggestions.length - 1
            : Math.max(currentInput.selectedSuggestionIndex - 1, 0),
      }));
      return;
    }

    if (event.key === "Backspace" && aliasInput.text.length === 0) {
      setAliasInput((currentInput) => ({
        ...currentInput,
        tokens: currentInput.tokens.slice(0, -1),
      }));
      return;
    }

    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (aliasInput.text.trim()) {
      const suggestion =
        aliasInput.selectedSuggestionIndex === null
          ? null
          : aliasSuggestions[aliasInput.selectedSuggestionIndex];

      if (suggestion) {
        addAliasInputToken(suggestion);
      }

      return;
    }

    if (aliasInput.tokens.length > 0) {
      void addAliasesToSelectedCanonical();
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

  function setCanonicalInputText(value: string): void {
    setCanonicalInput((currentInput) => ({
      ...currentInput,
      text: value,
      selectedSuggestionIndex: null,
    }));
  }

  function addCanonicalInputToken(tag: ManagedTagRecord): void {
    setCanonicalInput({
      text: "",
      tokens: [tag],
      selectedSuggestionIndex: null,
    });
  }

  function setAliasInputText(value: string): void {
    setAliasInput((currentInput) => ({
      ...currentInput,
      text: value,
      selectedSuggestionIndex: null,
    }));
  }

  function addAliasInputToken(tag: ManagedTagRecord): void {
    setAliasInput((currentInput) => {
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

  async function showRelationErrorDialog(errors: string[]): Promise<void> {
    if (!window.asteria || errors.length === 0) {
      return;
    }

    const uniqueErrors = [...new Set(errors)];

    setMessage(uniqueErrors[0] ?? "");
    await window.asteria.alertDialog({
      title: t("window.tagManager.relationErrorTitle"),
      message: uniqueErrors.join("\n"),
    });
  }

  function collectRelationError(
    errors: string[],
    error: unknown,
    fallbackMessage: string,
  ): void {
    errors.push(error instanceof Error ? error.message : fallbackMessage);
  }

  async function addSiblingRelations(
    aliasTagIds: number[],
    canonicalTagId: number,
  ): Promise<{ updatedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let updatedCount = 0;

    if (!window.asteria) {
      return { updatedCount, errors };
    }

    for (const aliasTagId of aliasTagIds) {
      if (aliasTagId === canonicalTagId) {
        errors.push(t("window.tagManager.siblingSelfRelation"));
        continue;
      }

      try {
        await window.asteria.addTagSibling(aliasTagId, canonicalTagId);
        updatedCount += 1;
      } catch (error) {
        collectRelationError(
          errors,
          error,
          t("window.tagManager.siblingSetFailed"),
        );
      }
    }

    return { updatedCount, errors };
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
    const errors: string[] = [];

    for (const sourceId of selectedRelationSourceIds) {
      for (const token of input.tokens) {
        const childTagId = kind === "parent" ? sourceId : token.id;
        const parentTagId = kind === "parent" ? token.id : sourceId;

        if (childTagId === parentTagId) {
          errors.push(t("window.tagManager.parentSelfRelation"));
          continue;
        }

        if (hasDirectParentRelation(tagParents, childTagId, parentTagId)) {
          continue;
        }

        try {
          await window.asteria.addTagParent(childTagId, parentTagId);
          addedCount += 1;
        } catch (error) {
          collectRelationError(
            errors,
            error,
            t("window.tagManager.parentAddFailed"),
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

    if (errors.length > 0) {
      await showRelationErrorDialog(errors);
    }
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

    await loadTagParents();
    setMessage(
      t("window.tagManager.parentRelationsRemoved", { count: removedCount }),
    );
  }

  async function setCanonicalTagForSelectedSources(): Promise<void> {
    if (!window.asteria || selectedRelationSourceIds.length === 0) {
      return;
    }

    const canonicalTag = canonicalInput.tokens[0];

    if (!canonicalTag || canonicalInput.text.trim()) {
      return;
    }

    const { updatedCount, errors } = await addSiblingRelations(
      selectedRelationSourceIds,
      canonicalTag.id,
    );

    setCanonicalInput(createRelationInputState());
    await loadTagSiblings();
    setMessage(t("window.tagManager.siblingsSet", { count: updatedCount }));

    if (errors.length > 0) {
      await showRelationErrorDialog(errors);
    }
  }

  async function addAliasesToSelectedCanonical(): Promise<void> {
    if (!window.asteria || selectedRelationSourceIds.length !== 1) {
      return;
    }

    const canonicalTagId = selectedRelationSourceIds[0];

    if (
      !canonicalTagId ||
      aliasInput.tokens.length === 0 ||
      aliasInput.text.trim()
    ) {
      return;
    }

    const { updatedCount, errors } = await addSiblingRelations(
      aliasInput.tokens.map((tag) => tag.id),
      canonicalTagId,
    );

    setAliasInput(createRelationInputState());
    await loadTagSiblings();
    setMessage(t("window.tagManager.siblingsSet", { count: updatedCount }));

    if (errors.length > 0) {
      await showRelationErrorDialog(errors);
    }
  }

  async function removeSiblingAliases(aliasTagIds: number[]): Promise<void> {
    if (!window.asteria || aliasTagIds.length === 0) {
      return;
    }

    let removedCount = 0;

    for (const aliasTagId of aliasTagIds) {
      try {
        await window.asteria.removeTagSibling(aliasTagId);
        removedCount += 1;
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : t("window.tagManager.siblingRemoveFailed"),
        );
      }
    }

    await loadTagSiblings();
    setMessage(t("window.tagManager.siblingsRemoved", { count: removedCount }));
  }

  async function openRelationTreeWindow(
    kind: "parent" | "sibling" = "parent",
  ): Promise<void> {
    const tagIds =
      selectedRelationSourceIds.length > 0
        ? selectedRelationSourceIds
        : stagedExistingTagRecords.map((tag) => tag.id);

    if (!window.asteria || tagIds.length === 0) {
      setMessage(t("window.tagManager.noRelationTreeTags"));
      return;
    }

    await window.asteria.openTagRelationTreeWindow(tagIds, kind);
  }

  function removeStagedTags(localIds: number[]): void {
    setStagedTags((currentTags) =>
      currentTags.filter((tag) => !localIds.includes(tag.localId)),
    );
    setSelectedStagedIds([]);
    setLastSelectedStagedId(null);
  }

  function stageManagedTag(tag: ManagedTagRecord): void {
    addManagedTagToStaging(tag);
    setMessage(t("window.tagManager.stagedTags", { count: 1 }));
  }

  function addManagedTagToStaging(tag: ManagedTagRecord): void {
    const key = createTagKey(tag);

    setStagedTags((currentTags) => {
      if (currentTags.some((currentTag) => currentTag.key === key)) {
        return currentTags;
      }

      const stagedTag: StagedTag = {
        localId: nextStagedIdRef.current,
        key,
        namespace: tag.namespace,
        name: tag.name,
      };
      nextStagedIdRef.current += 1;

      return [...currentTags, stagedTag];
    });
  }

  function handleCreateTagKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.nativeEvent.isComposing || event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    queueCreateTagFromInput();
  }

  function queueCreateTagFromInput(): void {
    if (activeStyleId === null) {
      return;
    }

    if (!createTagDraft) {
      setMessage(t("window.tagManager.invalidTagInput"));
      return;
    }

    if (existingCreateTag) {
      setMessage(t("window.tagManager.tagAlreadyExists"));
      return;
    }

    if (pendingCreateTagExists) {
      setMessage(t("window.tagManager.tagAlreadyPendingCreate"));
      return;
    }

    const pendingTag: PendingCreateTag = {
      localId: nextPendingCreateIdRef.current,
      key: createTagKey(createTagDraft),
      namespace: createTagDraft.namespace.trim(),
      name: createTagDraft.name.trim(),
    };

    nextPendingCreateIdRef.current += 1;
    setPendingCreateTags((currentTags) => [...currentTags, pendingTag]);
    setCreateTagText("");
  }

  function removePendingCreateTag(localId: number): void {
    setPendingCreateTags((currentTags) =>
      currentTags.filter((tag) => tag.localId !== localId),
    );
  }

  async function createPendingTags(): Promise<void> {
    if (
      !window.asteria ||
      activeStyleId === null ||
      pendingCreateTags.length === 0
    ) {
      return;
    }

    const createdKeys = new Set<string>();
    let failureMessage = "";

    for (const pendingTag of pendingCreateTags) {
      try {
        const created = await window.asteria.createManagedTag(activeStyleId, {
          namespace: pendingTag.namespace,
          name: pendingTag.name,
        });
        addManagedTagToStaging(created);
        createdKeys.add(pendingTag.key);
      } catch (error) {
        failureMessage =
          error instanceof Error
            ? error.message
            : t("window.tagManager.createFailed");
      }
    }

    if (createdKeys.size > 0) {
      setPendingCreateTags((currentTags) =>
        currentTags.filter((tag) => !createdKeys.has(tag.key)),
      );
      await refreshTagsAndStyles();
      setMessage(
        t("window.tagManager.createdTags", { count: createdKeys.size }),
      );
      return;
    }

    setMessage(failureMessage || t("window.tagManager.createFailed"));
  }

  function openRenameDialog(staged: StagedTag, tag: ManagedTagRecord): void {
    setRenameDialog({
      localId: staged.localId,
      tagId: tag.id,
      value: formatTagLabel(tag),
    });
  }

  function closeRenameDialog(): void {
    setRenameDialog(null);
    setRenamePreview(null);
    setRenamePreviewMessage("");
  }

  async function loadRenamePreview(): Promise<void> {
    if (!window.asteria || !renameDialog) {
      setRenamePreview(null);
      setRenamePreviewMessage("");
      return;
    }

    const draft = parseTagText(renameDialog.value);

    if (!draft) {
      setRenamePreview(null);
      setRenamePreviewMessage(t("window.tagManager.invalidTag"));
      return;
    }

    setRenamePreview(null);
    setRenamePreviewMessage(t("window.tagManager.renamePreviewLoading"));

    try {
      const preview = await window.asteria.previewManagedTagRename(
        renameDialog.tagId,
        draft,
      );
      setRenamePreview(preview);
      setRenamePreviewMessage("");
    } catch (error) {
      setRenamePreview(null);
      setRenamePreviewMessage(
        error instanceof Error
          ? error.message
          : t("window.tagManager.renamePreviewFailed"),
      );
    }
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
      closeRenameDialog();
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
    const deleted = await deleteManagedTagWithConfirmation(tag);

    if (deleted) {
      removeStagedTags([staged.localId]);
    }
  }

  async function deleteManagedTagWithConfirmation(
    tag: ManagedTagRecord,
  ): Promise<boolean> {
    if (!window.asteria) {
      return false;
    }

    const confirmed = await window.asteria.confirmDialog({
      title: t("window.tagManager.confirmDeleteTagsTitle"),
      message: t("window.tagManager.confirmDeleteSingleTagMessage", {
        name: formatTagLabel(tag),
      }),
    });

    if (!confirmed) {
      return false;
    }

    try {
      const result = await window.asteria.deleteManagedTag(tag.id);
      const deletedKey = createTagKey(tag);

      setStagedTags((currentTags) =>
        currentTags.filter((currentTag) => currentTag.key !== deletedKey),
      );
      setSelectedStagedIds([]);
      setLastSelectedStagedId(null);
      resetRelationSelection();
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
      return false;
    }

    return true;
  }

  async function refreshTagsAndStyles(): Promise<void> {
    await loadManagedTags();
    await loadStyles(activeStyleId ?? undefined);
    await loadTagParents();
    await loadTagSiblings();
  }

  function resetRelationSelection(): void {
    setSelectedRelationSourceIds([]);
    setLastRelationSourceId(null);
    setParentInput(createRelationInputState());
    setChildInput(createRelationInputState());
    setCanonicalInput(createRelationInputState());
    setAliasInput(createRelationInputState());
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
                  <span className="text-center text-(--muted)">{"->"}</span>
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
                </>
              ) : (
                <>
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
                  <span className="text-center text-(--muted)">{"->"}</span>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)">
                    {t("window.tagManager.selectedRelationTags")}
                  </span>
                </>
              )}
              <button
                className="ui-button ui-button-compact"
                type="button"
                onClick={() => void removeRelationTags([tag.id], kind)}
              >
                {t("window.tagManager.removeRelation")}
              </button>
            </div>
          ))
        ) : (
          <div className={emptyClass}>{emptyMessage}</div>
        )}
      </div>
    );
  }

  function renderRelationSourcePanel(): JSX.Element {
    return (
      <section className="grid min-h-0 grid-rows-[27px_minmax(0,1fr)] bg-(--surface-bg)">
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
          onMouseDownCapture={relationSourceBoxSelection.handleMouseDownCapture}
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
          <header className="h-[22px] border-b border-(--line) bg-(--panel) px-2 leading-[22px] text-[11px] font-semibold text-(--muted)">
            {t("window.tagManager.setSelectedChildren")}
          </header>
          {renderRelationInput("parent")}
          <div className="grid min-h-0 grid-rows-[22px_minmax(0,1fr)]">
            <header className="px-2 leading-[22px] text-[11px] font-semibold text-(--muted)">
              {t("window.tagManager.commonParents")}
            </header>
            {renderRelationTagList("parent")}
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[22px_auto_minmax(0,1fr)]">
          <header className="h-[22px] border-b border-(--line) bg-(--panel) px-2 leading-[22px] text-[11px] font-semibold text-(--muted)">
            {t("window.tagManager.setSelectedParents")}
          </header>
          {renderRelationInput("child")}
          <div className="grid min-h-0 grid-rows-[22px_minmax(0,1fr)]">
            <header className="px-2 leading-[22px] text-[11px] font-semibold text-(--muted)">
              {t("window.tagManager.commonChildren")}
            </header>
            {renderRelationTagList("child")}
          </div>
        </section>

        <footer className="flex justify-end border-t border-(--line) bg-(--panel) p-1.5">
          <button
            className="ui-button min-w-[92px]"
            type="button"
            onClick={() => void openRelationTreeWindow("parent")}
          >
            {t("window.tagManager.openRelationTree")}
          </button>
        </footer>
      </section>
    );
  }

  function renderCanonicalInput(): JSX.Element {
    return (
      <div
        className={relationInputShellClass}
        data-tag-selection-scope="relation-tools"
      >
        {canonicalSuggestions.length > 0 ? (
          <div className="absolute left-1 right-[74px] top-[31px] z-[6] border border-(--line-strong) bg-(--panel)">
            {canonicalSuggestions.map((tag, index) => (
              <button
                className={getTagNamespaceClassName(
                  tag,
                  index === canonicalInput.selectedSuggestionIndex
                    ? "grid h-6 w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-2 border-0 border-b border-(--line) bg-(--accent-weak) px-1.5 text-left text-[11px] text-(--ink)"
                    : "grid h-6 w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-2 border-0 border-b border-(--line) bg-transparent px-1.5 text-left text-[11px] text-(--ink)",
                )}
                key={tag.id}
                style={getTagNamespaceStyle(tag)}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  addCanonicalInputToken(tag);
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
          {canonicalInput.tokens.map((token) => (
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
            aria-label={t("window.tagManager.setCanonicalInput")}
            placeholder={
              canonicalInput.tokens.length === 0
                ? t("window.tagManager.setCanonicalPlaceholder")
                : ""
            }
            value={canonicalInput.text}
            onChange={(event) => setCanonicalInputText(event.target.value)}
            onKeyDown={handleCanonicalInputKeyDown}
          />
        </div>
        <button
          className={managerButtonClass}
          disabled={
            selectedRelationSourceIds.length === 0 ||
            canonicalInput.tokens.length === 0 ||
            Boolean(canonicalInput.text.trim())
          }
          type="button"
          onClick={() => void setCanonicalTagForSelectedSources()}
        >
          {t("window.tagManager.setCanonical")}
        </button>
      </div>
    );
  }

  function renderAliasInput(): JSX.Element {
    const disabled = selectedRelationSourceIds.length !== 1;

    return (
      <div
        className={relationInputShellClass}
        data-tag-selection-scope="relation-tools"
      >
        {!disabled && aliasSuggestions.length > 0 ? (
          <div className="absolute left-1 right-[74px] top-[31px] z-[6] border border-(--line-strong) bg-(--panel)">
            {aliasSuggestions.map((tag, index) => (
              <button
                className={getTagNamespaceClassName(
                  tag,
                  index === aliasInput.selectedSuggestionIndex
                    ? "grid h-6 w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-2 border-0 border-b border-(--line) bg-(--accent-weak) px-1.5 text-left text-[11px] text-(--ink)"
                    : "grid h-6 w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-2 border-0 border-b border-(--line) bg-transparent px-1.5 text-left text-[11px] text-(--ink)",
                )}
                key={tag.id}
                style={getTagNamespaceStyle(tag)}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  addAliasInputToken(tag);
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
          {aliasInput.tokens.map((token) => (
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
            aria-label={t("window.tagManager.addAliasesInput")}
            disabled={disabled}
            placeholder={
              disabled
                ? t("window.tagManager.selectSingleCanonicalTag")
                : aliasInput.tokens.length === 0
                  ? t("window.tagManager.addAliasesPlaceholder")
                  : ""
            }
            value={aliasInput.text}
            onChange={(event) => setAliasInputText(event.target.value)}
            onKeyDown={handleAliasInputKeyDown}
          />
        </div>
        <button
          className={managerButtonClass}
          disabled={
            disabled ||
            aliasInput.tokens.length === 0 ||
            Boolean(aliasInput.text.trim())
          }
          type="button"
          onClick={() => void addAliasesToSelectedCanonical()}
        >
          {t("window.tagManager.addAliases")}
        </button>
      </div>
    );
  }

  function renderSiblingTools(): JSX.Element {
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
          <header className="h-[22px] border-b border-(--line) bg-(--panel) px-2 leading-[22px] text-[11px] font-semibold text-(--muted)">
            {t("window.tagManager.setSelectedAliases")}
          </header>
          {renderCanonicalInput()}
          <div className="min-h-0 overflow-auto bg-(--surface-bg) p-1.5 text-[11px] text-(--ink)">
            <header className="mb-1 text-[11px] font-semibold text-(--muted)">
              {t("window.tagManager.commonCanonical")}
            </header>
            {selectedRelationSourceIds.length === 0 ? (
              <div className={emptyClass}>
                {t("window.tagManager.noRelationSourceSelected")}
              </div>
            ) : commonCanonicalTags.length > 0 ? (
              commonCanonicalTags.map((tag) => (
                <div
                  className="mb-1 grid min-h-6 grid-cols-[minmax(0,1fr)_52px] items-center gap-1 border-b border-(--line) px-1"
                  key={tag.id}
                >
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
                  <button
                    className="ui-button ui-button-compact"
                    type="button"
                    onClick={() =>
                      void removeSiblingAliases(
                        selectedCanonicalTargets.map(
                          (record) => record.alias.id,
                        ),
                      )
                    }
                  >
                    {t("window.tagManager.removeSibling")}
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
          <header className="h-[22px] border-b border-(--line) bg-(--panel) px-2 leading-[22px] text-[11px] font-semibold text-(--muted)">
            {t("window.tagManager.addAliasesToCanonical")}
          </header>
          {renderAliasInput()}
          <div className="min-h-0 overflow-auto bg-(--surface-bg) p-1.5 text-[11px] text-(--ink)">
            <header className="mb-1 text-[11px] font-semibold text-(--muted)">
              {t("window.tagManager.aliasesOfSelectedTags")}
            </header>
            {selectedRelationSourceIds.length === 0 ? (
              <div className={emptyClass}>
                {t("window.tagManager.noRelationSourceSelected")}
              </div>
            ) : selectedTagAliases.length > 0 ? (
              selectedTagAliases.map((record) => (
                <div
                  className="mb-1 grid min-h-6 grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)_52px] items-center gap-1 border-b border-(--line) px-1"
                  key={record.alias.id}
                >
                  <span
                    className={getTagNamespaceClassName(
                      record.alias,
                      "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
                    )}
                    style={getTagNamespaceStyle(record.alias)}
                    title={formatTagLabel(record.alias)}
                  >
                    {formatTagLabel(record.alias)}
                  </span>
                  <span className="text-center text-(--muted)">{"->"}</span>
                  <span
                    className={getTagNamespaceClassName(
                      record.canonical,
                      "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
                    )}
                    style={getTagNamespaceStyle(record.canonical)}
                    title={formatTagLabel(record.canonical)}
                  >
                    {formatTagLabel(record.canonical)}
                  </span>
                  <button
                    className="ui-button ui-button-compact"
                    type="button"
                    onClick={() => void removeSiblingAliases([record.alias.id])}
                  >
                    {t("window.tagManager.removeSibling")}
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
            className="ui-button min-w-[92px]"
            type="button"
            onClick={() => void openRelationTreeWindow("sibling")}
          >
            {t("window.tagManager.openRelationTree")}
          </button>
        </footer>
      </section>
    );
  }

  function renderTagCatalogPanel(): JSX.Element {
    return (
      <section className="grid h-full min-h-0 min-w-0 grid-rows-[27px_auto_auto_auto_24px_minmax(0,1fr)] border-r border-(--line) bg-(--surface-bg)">
        <header className={sectionHeaderClass}>
          <span>{t("window.tagManager.currentStyleTags")}</span>
          <span className="font-normal text-(--muted)">
            {displayedTags.length} / {tags.length}
          </span>
        </header>
        <div className="grid gap-1.5 border-b border-(--line) bg-(--panel) p-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
            <input
              className={managerInputClass}
              aria-label={t("window.tagManager.renameStyle")}
              placeholder={t("window.tagManager.renameStylePlaceholder")}
              value={styleRenameInput}
              onChange={(event) => setStyleRenameInput(event.target.value)}
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
          <div className="flex flex-wrap gap-1.5">
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
          </div>
        </div>
        <div className="border-b border-(--line) bg-(--panel) p-1.5">
          <input
            className={`${managerInputClass} w-full`}
            aria-label={t("window.tagManager.searchTags")}
            placeholder={t("window.tagManager.searchTagsPlaceholder")}
            value={tagListQuery}
            onChange={(event) => setTagListQuery(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5 border-b border-(--line) bg-(--panel) p-1.5">
          <select
            className={managerInputClass}
            aria-label={t("window.tagManager.sortField")}
            value={tagListSortKey}
            onChange={(event) =>
              setTagListSortKey(event.target.value as ManagedTagSortKey)
            }
          >
            <option value="name">{t("window.tagManager.sortName")}</option>
            <option value="createdAt">
              {t("window.tagManager.sortCreatedAt")}
            </option>
            <option value="fileCount">
              {t("window.tagManager.sortFileCount")}
            </option>
          </select>
          <select
            className={managerInputClass}
            aria-label={t("window.tagManager.sortDirection")}
            value={tagListSortDirection}
            onChange={(event) =>
              setTagListSortDirection(event.target.value as SortDirection)
            }
          >
            <option value="asc">{t("window.tagManager.sortAsc")}</option>
            <option value="desc">{t("window.tagManager.sortDesc")}</option>
          </select>
        </div>
        <div className={tagCatalogHeadClass}>
          <span>{t("window.tagManager.nameColumn")}</span>
          <span className="text-right">
            {t("window.tagManager.fileCountColumn")}
          </span>
        </div>
        <div
          className="min-h-0 overflow-auto"
          ref={tagCatalogListRef}
          onScroll={scheduleTagCatalogViewportUpdate}
        >
          {displayedTags.length > 0 ? (
            <div
              className="relative min-w-0"
              style={{
                height: displayedTags.length * TAG_CATALOG_ROW_HEIGHT,
              }}
            >
              {visibleTagCatalogRows.map((row) =>
                renderTagCatalogRow(row.tag, row.top),
              )}
            </div>
          ) : (
            <div className={emptyClass}>{t("window.tagManager.noTags")}</div>
          )}
        </div>
      </section>
    );
  }

  function renderTagCatalogRow(
    tag: ManagedTagRecord,
    top: number,
  ): JSX.Element {
    return (
      <button
        className={getTagNamespaceClassName(tag, tagCatalogRowClass)}
        key={tag.id}
        style={{
          ...getTagNamespaceStyle(tag),
          height: TAG_CATALOG_ROW_HEIGHT,
          top,
        }}
        title={formatTagLabel(tag)}
        type="button"
        onClick={() => stageManagedTag(tag)}
      >
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left text-inherit">
          {formatTagLabel(tag)}
        </span>
        <span className="text-right tabular-nums text-(--muted)">
          {tag.fileCount}
        </span>
      </button>
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
            <span>{t("window.tagManager.styleList")}</span>
            <span className="font-normal text-(--muted)">
              {t("window.tagManager.loadedStyle", { count: styles.length })}
            </span>
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
        <ResizableColumns
          className="h-full bg-(--panel)"
          defaultLeftWidth={260}
          minLeftWidth={200}
          minRightWidth={520}
          storageKey="asteria:tag-manager-tag-catalog-width"
          left={renderTagCatalogPanel()}
          right={
            <main className={managerPanelClass}>
              <ResizableRows
                className="h-full bg-(--panel)"
                defaultTopHeight={290}
                minTopHeight={150}
                minBottomHeight={170}
                storageKey="asteria:tag-manager-main-top-height"
                top={
                  <section className="grid h-full min-h-0 min-w-0 grid-rows-[27px_minmax(0,1fr)] bg-(--panel)">
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
                }
                bottom={
                  <section className="grid min-h-0 grid-rows-[28px_minmax(0,1fr)] bg-(--panel)">
                    <nav className="flex border-b border-(--line) bg-(--panel-strong)">
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
                              <span>
                                {t("window.tagManager.createdAtColumn")}
                              </span>
                              <span>
                                {t("window.tagManager.operationColumn")}
                              </span>
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
                                        className="ui-button min-w-[54px] px-1.5"
                                        type="button"
                                        onClick={() =>
                                          openRenameDialog(staged, tag)
                                        }
                                      >
                                        {t("window.tagManager.rename")}
                                      </button>
                                      <button
                                        className="ui-button min-w-[54px] px-1.5"
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
                                aria-label={t(
                                  "window.tagManager.createTagInput",
                                )}
                                placeholder={t(
                                  "window.tagManager.createTagPlaceholder",
                                )}
                                value={createTagText}
                                onChange={(event) =>
                                  setCreateTagText(event.target.value)
                                }
                                onKeyDown={handleCreateTagKeyDown}
                              />
                              {existingCreateTag ? (
                                <div className={messageClass}>
                                  {t("window.tagManager.tagAlreadyExists")}
                                </div>
                              ) : pendingCreateTagExists ? (
                                <div className={messageClass}>
                                  {t(
                                    "window.tagManager.tagAlreadyPendingCreate",
                                  )}
                                </div>
                              ) : createTagText.trim() && !createTagDraft ? (
                                <div className={messageClass}>
                                  {t("window.tagManager.invalidTagInput")}
                                </div>
                              ) : null}
                            </div>
                            <div className={operationHeadRowClass}>
                              <span>{t("window.tagManager.nameColumn")}</span>
                              <span className="text-right">
                                {t("window.tagManager.fileCountColumn")}
                              </span>
                              <span>
                                {t("window.tagManager.createdAtColumn")}
                              </span>
                              <span>
                                {t("window.tagManager.operationColumn")}
                              </span>
                            </div>
                            <div className="min-h-0 overflow-auto">
                              {pendingCreateTags.length > 0 ? (
                                pendingCreateTags.map((pendingTag) => (
                                  <div
                                    className={operationRowClass}
                                    key={pendingTag.localId}
                                  >
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
                                        className="ui-button min-w-[54px] px-1.5"
                                        type="button"
                                        onClick={() =>
                                          removePendingCreateTag(
                                            pendingTag.localId,
                                          )
                                        }
                                      >
                                        {t("window.tagManager.delete")}
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
                                  pendingCreateTags.length === 0
                                }
                                type="button"
                                onClick={() => void createPendingTags()}
                              >
                                {t("window.tagManager.create")}
                              </button>
                            </footer>
                          </div>
                        }
                      />
                    ) : (
                      <ResizableColumns
                        className="h-full bg-(--panel)"
                        defaultLeftWidth={500}
                        minLeftWidth={180}
                        minRightWidth={620}
                        storageKey="asteria:tag-manager-relation-source-width"
                        left={renderRelationSourcePanel()}
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
                          closeRenameDialog();
                        }
                      }}
                    />
                    <div className="grid gap-1 border border-(--line) bg-(--surface-bg) p-2 text-(--muted)">
                      <div className="font-semibold text-(--ink)">
                        {t("window.tagManager.renamePreview")}
                      </div>
                      {renamePreview ? (
                        <>
                          <div>
                            {t("window.tagManager.renamePreviewFiles", {
                              directCount: renamePreview.directFileCount,
                              effectiveCount: renamePreview.effectiveFileCount,
                              impliedCount: renamePreview.impliedFileCount,
                            })}
                          </div>
                          <div>
                            {t("window.tagManager.renamePreviewParents", {
                              parentCount: renamePreview.directParentCount,
                              childCount: renamePreview.directChildCount,
                            })}
                          </div>
                          <div>
                            {t("window.tagManager.renamePreviewSiblings", {
                              aliasCount: renamePreview.aliasCount,
                              canonicalCount:
                                renamePreview.canonicalTargetCount,
                            })}
                          </div>
                          {renamePreview.duplicateTagId ? (
                            <div className="text-(--warning-ink)">
                              {t("window.tagManager.renamePreviewDuplicate")}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div>
                          {renamePreviewMessage ||
                            t("window.tagManager.renamePreviewLoading")}
                        </div>
                      )}
                    </div>
                    <footer className="flex justify-end gap-1">
                      <button
                        className={managerButtonClass}
                        type="button"
                        onClick={closeRenameDialog}
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        className={managerButtonClass}
                        disabled={Boolean(renamePreview?.duplicateTagId)}
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

function filterManagedTags(
  tags: ManagedTagRecord[],
  queryText: string,
  parents: TagParentRecord[],
  siblings: TagSiblingRecord[],
): ManagedTagRecord[] {
  const query = queryText.trim().toLowerCase();

  if (!query) {
    return tags;
  }

  const relatedLabelsByTagId = createRelatedTagSearchLabels(parents, siblings);

  return tags.filter((tag) => {
    const labels = [
      formatTagLabel(tag),
      tag.displayName ?? "",
      tag.styleName,
      ...(relatedLabelsByTagId.get(tag.id) ?? []),
    ];

    return labels.some((label) => label.toLowerCase().includes(query));
  });
}

function createRelatedTagSearchLabels(
  parents: TagParentRecord[],
  siblings: TagSiblingRecord[],
): Map<number, string[]> {
  const labelsByTagId = new Map<number, string[]>();

  function addLabel(tagId: number, relatedTag: TagRecord): void {
    const labels = labelsByTagId.get(tagId) ?? [];

    labels.push(formatTagLabel(relatedTag), relatedTag.displayName ?? "");
    labelsByTagId.set(tagId, labels);
  }

  for (const relation of parents) {
    addLabel(relation.child.id, relation.parent);
    addLabel(relation.parent.id, relation.child);
  }

  for (const relation of siblings) {
    addLabel(relation.alias.id, relation.canonical);
    addLabel(relation.canonical.id, relation.alias);
  }

  return labelsByTagId;
}

function sortManagedTags(
  tags: ManagedTagRecord[],
  sortKey: ManagedTagSortKey,
  direction: SortDirection,
): ManagedTagRecord[] {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...tags].sort((left, right) => {
    if (sortKey === "createdAt") {
      return left.createdAt.localeCompare(right.createdAt) * multiplier;
    }

    if (sortKey === "fileCount") {
      const countCompare = left.fileCount - right.fileCount;

      if (countCompare !== 0) {
        return countCompare * multiplier;
      }
    }

    return (
      formatTagLabel(left).localeCompare(formatTagLabel(right)) * multiplier
    );
  });
}

function pickVisibleManagedTagRows(
  tags: ManagedTagRecord[],
  scrollTop: number,
  viewportHeight: number,
): VirtualManagedTagRow[] {
  if (tags.length === 0) {
    return [];
  }

  const start = Math.max(0, scrollTop - TAG_CATALOG_OVERSCAN_PX);
  const end = scrollTop + viewportHeight + TAG_CATALOG_OVERSCAN_PX;
  const firstIndex = Math.max(0, Math.floor(start / TAG_CATALOG_ROW_HEIGHT));
  const lastIndex = Math.min(
    tags.length - 1,
    Math.ceil(end / TAG_CATALOG_ROW_HEIGHT),
  );
  const rows: VirtualManagedTagRow[] = [];

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const tag = tags[index];

    if (!tag) {
      continue;
    }

    rows.push({
      tag,
      top: index * TAG_CATALOG_ROW_HEIGHT,
    });
  }

  return rows;
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

function createCanonicalTargetRows(
  sourceTagIds: number[],
  siblings: TagSiblingRecord[],
): TagSiblingRecord[] {
  const sourceIds = new Set(sourceTagIds);

  return siblings
    .filter((record) => sourceIds.has(record.alias.id))
    .sort((left, right) =>
      formatTagLabel(left.alias).localeCompare(formatTagLabel(right.alias)),
    );
}

function createCommonCanonicalTags(
  sourceTagIds: number[],
  siblings: TagSiblingRecord[],
): TagRecord[] {
  if (sourceTagIds.length === 0) {
    return [];
  }

  const canonicalByAliasId = new Map(
    siblings.map((record) => [record.alias.id, record.canonical]),
  );
  const firstSourceId = sourceTagIds[0] as number;
  const remainingSourceIds = sourceTagIds.slice(1);
  const firstCanonical = canonicalByAliasId.get(firstSourceId);

  if (!firstCanonical) {
    return [];
  }

  const hasCommonCanonical = remainingSourceIds.every(
    (sourceId) => canonicalByAliasId.get(sourceId)?.id === firstCanonical.id,
  );

  return hasCommonCanonical ? [firstCanonical] : [];
}

function createAliasRows(
  sourceTagIds: number[],
  siblings: TagSiblingRecord[],
): TagSiblingRecord[] {
  const sourceIds = new Set(sourceTagIds);

  return siblings
    .filter((record) => sourceIds.has(record.canonical.id))
    .sort((left, right) =>
      formatTagLabel(left.alias).localeCompare(formatTagLabel(right.alias)),
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
