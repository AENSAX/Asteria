export function parseIdList(value: string | null): number[] {
  if (!value) {
    return [];
  }

  const seen = new Set<number>();
  const ids: number[] = [];

  for (const part of value.split(",")) {
    const id = Number(part);

    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

export function mergeIds(currentIds: number[], nextIds: number[]): number[] {
  const mergedIds = [...currentIds];

  for (const id of nextIds) {
    if (!mergedIds.includes(id)) {
      mergedIds.push(id);
    }
  }

  return mergedIds;
}
