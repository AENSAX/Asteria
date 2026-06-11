import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type {
  ManagedTagRecord,
  ManagedTagRenamePreview,
  SortDirection,
  TagDraft,
  TagParentRecord,
  TagSiblingRecord,
  TagStyleRecord,
} from "../../../shared/ipc";
import { ResizableColumns } from "../components/ResizableColumns";
import { ResizableRows } from "../components/ResizableRows";
import { useShortcut } from "../hooks/useShortcut";
import { useMultiSelection } from "../hooks/useMultiSelection";
import { useLanguage } from "../utils/language";
import { formatTagLabel, parseTagText } from "../utils/tags";
import { BasicOperationsPanel } from "./tagManager/BasicOperationsPanel";
import {
  ManagerSidebar,
  managerShellClass,
} from "../components/ManagerSidebar";
import { managerPanelClass } from "./tagManager/classNames";
import { RelationsPanel } from "./tagManager/RelationsPanel";
import { RenameTagDialog } from "./tagManager/RenameTagDialog";
import { StagedTagsPanel } from "./tagManager/StagedTagsPanel";
import { TagCatalogPanel } from "./tagManager/TagCatalogPanel";
import {
  createAliasRows,
  createCanonicalTargetRows,
  createCommonCanonicalTags,
  createCommonRelationTags,
  createExistingStagedTags,
  createTagKey,
  createTagMap,
  hasDirectParentRelation,
  type PendingCreateTag,
  type RelationKind,
  type RenameDialogState,
  type StagedTag,
} from "./tagManager/tagManagerData";
import { useRelationTagInput } from "./tagManager/useRelationTagInput";

type OperationTab = "basic" | "relations";

const tagSortKey = "name";
const tagSortDirection: SortDirection = "asc";

export function TagManagerWindow(): JSX.Element {
  const { t } = useLanguage();
  const [styles, setStyles] = useState<TagStyleRecord[]>([]);
  const [activeStyleId, setActiveStyleId] = useState<number | null>(null);
  const [tags, setTags] = useState<ManagedTagRecord[]>([]);
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
  const nextStagedIdRef = useRef(1);
  const nextPendingCreateIdRef = useRef(1);
  const renamePreviewRequestIdRef = useRef(0);
  const selectedStyle =
    styles.find((style) => style.id === activeStyleId) ?? null;
  const tagsByKey = useMemo(() => createTagMap(tags), [tags]);
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
  const createTagWarning = existingCreateTag
    ? t("window.tagManager.tagAlreadyExists")
    : pendingCreateTagExists
      ? t("window.tagManager.tagAlreadyPendingCreate")
      : createTagText.trim() && !createTagDraft
        ? t("window.tagManager.invalidTagInput")
        : null;
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
  const parentInput = useRelationTagInput({
    tags,
    excludedTagIds: selectedRelationSourceIds,
    onSubmit: (tokens) => void addRelationTags("parent", tokens),
  });
  const childInput = useRelationTagInput({
    tags,
    excludedTagIds: selectedRelationSourceIds,
    onSubmit: (tokens) => void addRelationTags("child", tokens),
  });
  const canonicalInput = useRelationTagInput({
    tags,
    excludedTagIds: selectedRelationSourceIds,
    singleToken: true,
    onSubmit: (tokens) => void setCanonicalTagForSelectedSources(tokens),
  });
  const aliasInput = useRelationTagInput({
    tags,
    excludedTagIds: selectedRelationSourceIds,
    onSubmit: (tokens) => void addAliasesToSelectedCanonical(tokens),
  });
  const stagedSelection = useMultiSelection({
    items: stagedTags,
    getId: (tag) => tag.localId,
    selectedIds: selectedStagedIds,
    lastSelectedId: lastSelectedStagedId,
    onSelect: setSelectedStagedIds,
    onLastSelectedId: setLastSelectedStagedId,
    onPlainClickSelected: (tag) => {
      if (selectedStagedIds.length === 1) {
        removeStagedTags([tag.localId]);
        return true;
      }

      return false;
    },
  });
  const relationSourceSelection = useMultiSelection({
    items: stagedExistingTagRecords,
    getId: (tag) => tag.id,
    selectedIds: selectedRelationSourceIds,
    lastSelectedId: lastRelationSourceId,
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
    if (!renameDialog) {
      renamePreviewRequestIdRef.current += 1;
      setRenamePreview(null);
      setRenamePreviewMessage("");
      return undefined;
    }

    const requestId = renamePreviewRequestIdRef.current + 1;
    renamePreviewRequestIdRef.current = requestId;
    const timer = window.setTimeout(() => {
      void loadRenamePreview(requestId);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [renameDialog?.tagId, renameDialog?.value]);

  useEffect(() => {
    setSelectedRelationSourceIds((currentIds) =>
      currentIds.filter((id) =>
        stagedExistingTagRecords.some((tag) => tag.id === id),
      ),
    );
  }, [stagedExistingTagRecords]);

  useShortcut("select-all", () => {
    const ids = stagedTags.map((tag) => tag.localId);
    setSelectedStagedIds(ids);
    setLastSelectedStagedId(ids[ids.length - 1] ?? null);
  });
  useShortcut(
    "remove-selected",
    () => removeStagedTags(selectedStagedIds),
    { enabled: selectedStagedIds.length > 0 },
  );

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

  function selectStyle(styleId: number): void {
    setActiveStyleId(styleId);
    setCreateTagText("");
    setPendingCreateTags([]);
    setStagedTags([]);
    setSelectedStagedIds([]);
    setLastSelectedStagedId(null);
    resetRelationSelection();
  }

  async function createStyle(name: string): Promise<boolean> {
    if (!window.asteria) {
      return false;
    }

    try {
      const nextStyles = await window.asteria.createTagStyle(name);
      const createdStyle =
        nextStyles.find((style) => style.displayName === name.trim()) ??
        nextStyles[0];
      setStyles(nextStyles);
      setActiveStyleId(createdStyle?.id ?? null);
      setMessage(t("window.tagManager.createdStyle"));
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : t("window.tagManager.createFailed"),
      );
      return false;
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

  async function renameStyle(name: string): Promise<void> {
    if (!window.asteria || activeStyleId === null || !name.trim()) {
      return;
    }

    try {
      setStyles(await window.asteria.renameTagStyle(activeStyleId, name));
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
      title: t("confirm.deleteTitle"),
      message: t("confirm.deleteTagStyle", {
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

  async function addRelationTags(
    kind: RelationKind,
    tokens: ManagedTagRecord[],
  ): Promise<void> {
    if (
      !window.asteria ||
      selectedRelationSourceIds.length === 0 ||
      tokens.length === 0
    ) {
      return;
    }

    let addedCount = 0;
    const errors: string[] = [];

    for (const sourceId of selectedRelationSourceIds) {
      for (const token of tokens) {
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
      parentInput.reset();
    } else {
      childInput.reset();
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

    const confirmed = await window.asteria.confirmDialog({
      title: t("confirm.deleteTitle"),
      message: t("confirm.removeTagRelations"),
    });

    if (!confirmed) {
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

  async function setCanonicalTagForSelectedSources(
    tokens: ManagedTagRecord[],
  ): Promise<void> {
    if (!window.asteria || selectedRelationSourceIds.length === 0) {
      return;
    }

    const canonicalTag = tokens[0];

    if (!canonicalTag) {
      return;
    }

    const { updatedCount, errors } = await addSiblingRelations(
      selectedRelationSourceIds,
      canonicalTag.id,
    );

    canonicalInput.reset();
    await loadTagSiblings();
    setMessage(t("window.tagManager.siblingsSet", { count: updatedCount }));

    if (errors.length > 0) {
      await showRelationErrorDialog(errors);
    }
  }

  async function addAliasesToSelectedCanonical(
    tokens: ManagedTagRecord[],
  ): Promise<void> {
    if (!window.asteria || selectedRelationSourceIds.length !== 1) {
      return;
    }

    const canonicalTagId = selectedRelationSourceIds[0];

    if (!canonicalTagId || tokens.length === 0) {
      return;
    }

    const { updatedCount, errors } = await addSiblingRelations(
      tokens.map((tag) => tag.id),
      canonicalTagId,
    );

    aliasInput.reset();
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

    const confirmed = await window.asteria.confirmDialog({
      title: t("confirm.deleteTitle"),
      message: t("confirm.removeTagSiblings", { count: aliasTagIds.length }),
    });

    if (!confirmed) {
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
    kind: "parent" | "sibling",
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

  async function loadRenamePreview(requestId: number): Promise<void> {
    if (!window.asteria || !renameDialog) {
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

      if (renamePreviewRequestIdRef.current !== requestId) {
        return;
      }

      setRenamePreview(preview);
      setRenamePreviewMessage("");
    } catch (error) {
      if (renamePreviewRequestIdRef.current !== requestId) {
        return;
      }

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
      title: t("confirm.deleteTitle"),
      message: t("confirm.deleteManagedTag", {
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
    parentInput.reset();
    childInput.reset();
    canonicalInput.reset();
    aliasInput.reset();
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

  return (
    <ResizableColumns
      className={managerShellClass}
      defaultLeftWidth={180}
      minLeftWidth={130}
      minRightWidth={520}
      storageKey="asteria:tag-manager-sidebar-width"
      left={
        <ManagerSidebar
          activeId={activeStyleId}
          createButtonLabel={t("common.create")}
          createInputLabel={t("window.tagManager.newStyle")}
          createPlaceholder={t("window.tagManager.newStylePlaceholder")}
          getCount={(style) => style.tagCount}
          getId={(style) => style.id}
          getLabel={(style) => style.displayName}
          headerExtra={t("window.tagManager.loadedStyle", {
            count: styles.length,
          })}
          headerLabel={t("window.tagManager.styleList")}
          isMarked={(style) => style.isDefault}
          items={styles}
          onCreate={createStyle}
          onSelect={selectStyle}
        />
      }
      right={
        <ResizableColumns
          className="h-full bg-(--panel)"
          defaultLeftWidth={260}
          minLeftWidth={200}
          minRightWidth={520}
          storageKey="asteria:tag-manager-tag-catalog-width"
          left={
            <TagCatalogPanel
              activeStyleId={activeStyleId}
              selectedStyle={selectedStyle}
              tagParents={tagParents}
              tagSiblings={tagSiblings}
              tags={tags}
              onActivateStyle={() => void activateStyle()}
              onDeleteStyle={() => void deleteStyle()}
              onRenameStyle={(name) => void renameStyle(name)}
              onStageTag={stageManagedTag}
            />
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
                  <StagedTagsPanel
                    selectedIds={selectedStagedIds}
                    stagedTags={stagedTags}
                    onLastSelectedId={setLastSelectedStagedId}
                    onSelectIds={setSelectedStagedIds}
                    onTagMouseDown={stagedSelection.handleItemMouseDown}
                  />
                }
                bottom={
                  <section className="grid min-h-0 grid-rows-[28px_minmax(0,1fr)] bg-(--panel)">
                    <nav className="flex border-b border-(--line) bg-(--panel-strong)">
                      <button
                        className={`h-7 border-0 border-r border-(--line) px-3 text-[12px] ${
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
                        className={`h-7 border-0 border-r border-(--line) px-3 text-[12px] ${
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
                      <BasicOperationsPanel
                        createDisabled={activeStyleId === null}
                        createTagText={createTagText}
                        createTagWarning={createTagWarning}
                        pendingCreateTags={pendingCreateTags}
                        stagedExistingTags={stagedExistingTags}
                        onCreatePendingTags={() => void createPendingTags()}
                        onCreateTagKeyDown={handleCreateTagKeyDown}
                        onCreateTagTextChange={setCreateTagText}
                        onDeleteExistingTag={(staged, tag) =>
                          void deleteExistingTag(staged, tag)
                        }
                        onOpenRenameDialog={openRenameDialog}
                        onRemovePendingCreateTag={removePendingCreateTag}
                      />
                    ) : (
                      <RelationsPanel
                        aliasInput={aliasInput}
                        canonicalInput={canonicalInput}
                        childInput={childInput}
                        commonCanonicalTags={commonCanonicalTags}
                        commonChildTags={commonChildTags}
                        commonParentTags={commonParentTags}
                        parentInput={parentInput}
                        selectedCanonicalTargets={selectedCanonicalTargets}
                        selectedSourceIds={selectedRelationSourceIds}
                        selectedTagAliases={selectedTagAliases}
                        sourceTags={stagedExistingTagRecords}
                        onAddAliases={() =>
                          void addAliasesToSelectedCanonical(aliasInput.tokens)
                        }
                        onAddRelationTags={(kind) =>
                          void addRelationTags(
                            kind,
                            kind === "parent"
                              ? parentInput.tokens
                              : childInput.tokens,
                          )
                        }
                        onLastSourceId={setLastRelationSourceId}
                        onOpenRelationTree={(kind) =>
                          void openRelationTreeWindow(kind)
                        }
                        onRemoveRelationTags={(ids, kind) =>
                          void removeRelationTags(ids, kind)
                        }
                        onRemoveSiblingAliases={(ids) =>
                          void removeSiblingAliases(ids)
                        }
                        onSelectSourceIds={setSelectedRelationSourceIds}
                        onSetCanonical={() =>
                          void setCanonicalTagForSelectedSources(
                            canonicalInput.tokens,
                          )
                        }
                        onSourceMouseDown={
                          relationSourceSelection.handleItemMouseDown
                        }
                      />
                    )}
                  </section>
                }
              />

              <footer className="flex items-center justify-between border-t border-(--line) bg-(--surface-bg) px-2 text-[12px] text-(--muted)">
                <span>{message}</span>
                <span>
                  {t("window.tagManager.selectedCount", {
                    count: selectedTagCount,
                  })}
                </span>
              </footer>

              {renameDialog ? (
                <RenameTagDialog
                  dialog={renameDialog}
                  preview={renamePreview}
                  previewMessage={renamePreviewMessage}
                  onClose={closeRenameDialog}
                  onSave={() => void saveRenameDialog()}
                  onValueChange={(value) =>
                    setRenameDialog({ ...renameDialog, value })
                  }
                />
              ) : null}
            </main>
          }
        />
      }
    />
  );
}
