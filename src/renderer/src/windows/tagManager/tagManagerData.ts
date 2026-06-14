import type {
  ManagedTagRecord,
  ManagedTagSortKey,
  SortDirection,
  TagDraft,
  TagParentRecord,
  TagRecord,
  TagSiblingRecord,
} from "../../../../shared/ipc";
import { formatTagLabel } from "../../utils/tags";

export interface StagedTag extends TagDraft {
  key: string;
  localId: number;
}

export interface PendingCreateTag extends TagDraft {
  key: string;
  localId: number;
}

export interface RenameDialogState {
  localId: number;
  tagId: number;
  value: string;
}

export interface StagedExistingTag {
  staged: StagedTag;
  tag: ManagedTagRecord;
}

export type RelationKind = "parent" | "child";

export interface VirtualManagedTagRow {
  tag: ManagedTagRecord;
  top: number;
}

export type ManagedTagSearchIndex = Map<number, string>;

export const TAG_CATALOG_ROW_HEIGHT = 28;
export const TAG_CATALOG_OVERSCAN_PX = 180;

export function createTagMap(
  tags: ManagedTagRecord[],
): Map<string, ManagedTagRecord> {
  const map = new Map<string, ManagedTagRecord>();

  for (const tag of tags) {
    map.set(createTagKey(tag), tag);
  }

  return map;
}

export function filterManagedTags(
  tags: ManagedTagRecord[],
  queryText: string,
  searchIndex: ManagedTagSearchIndex,
): ManagedTagRecord[] {
  const query = queryText.trim().toLowerCase();

  if (!query) {
    return tags;
  }

  return tags.filter((tag) => (searchIndex.get(tag.id) ?? "").includes(query));
}

export function createManagedTagSearchIndex(
  tags: ManagedTagRecord[],
  parents: TagParentRecord[],
  siblings: TagSiblingRecord[],
): ManagedTagSearchIndex {
  const relatedLabelsByTagId = createRelatedTagSearchLabels(parents, siblings);
  const searchIndex: ManagedTagSearchIndex = new Map();

  for (const tag of tags) {
    const labels = [
      formatTagLabel(tag),
      tag.displayName ?? "",
      tag.styleName,
      ...(relatedLabelsByTagId.get(tag.id) ?? []),
    ];

    searchIndex.set(tag.id, labels.join("\n").toLowerCase());
  }

  return searchIndex;
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

export function sortManagedTags(
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

export function pickVisibleManagedTagRows(
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

export function createExistingStagedTags(
  stagedTags: StagedTag[],
  tagsByKey: Map<string, ManagedTagRecord>,
): StagedExistingTag[] {
  return stagedTags.flatMap((staged) => {
    const tag = tagsByKey.get(staged.key);
    return tag ? [{ staged, tag }] : [];
  });
}

export function createCommonRelationTags(
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

export function createCanonicalTargetRows(
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

export function createCommonCanonicalTags(
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

export function createAliasRows(
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

export function createRelationSuggestions(
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

export function hasDirectParentRelation(
  relations: TagParentRecord[],
  childTagId: number,
  parentTagId: number,
): boolean {
  return relations.some(
    (relation) =>
      relation.child.id === childTagId && relation.parent.id === parentTagId,
  );
}

export function createTagKey(
  tag: Pick<TagDraft, "namespace" | "name">,
): string {
  return `${tag.namespace.trim().toLowerCase()}:${tag.name
    .trim()
    .toLowerCase()}`;
}
