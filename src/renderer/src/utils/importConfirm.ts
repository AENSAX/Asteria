import type { ImportQueueFileRecord } from "../../../shared/ipc";
import type { TranslationFunction } from "./language";

export async function confirmDuplicateImports(
  queueFiles: ImportQueueFileRecord[],
  t: TranslationFunction,
): Promise<number[]> {
  if (!window.asteria) {
    return [];
  }

  const duplicateFiles = queueFiles.filter((file) => file.duplicate);

  if (duplicateFiles.length === 0) {
    return [];
  }

  const confirmed = await window.asteria.confirmDialog({
    title: t("app.status.duplicateConfirmTitle"),
    message: t("app.status.duplicateConfirmMessage", {
      count: duplicateFiles.length,
    }),
  });

  return confirmed ? duplicateFiles.map((file) => file.id) : [];
}
