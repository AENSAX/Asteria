import { getButtonClassName } from "../../components/Button";

export const managerInputClass =
  "ui-input";
export const managerButtonClass = getButtonClassName({ size: "medium" });
export const tagCatalogRowClass =
  "absolute left-0 right-0 grid w-full grid-cols-[minmax(0,1fr)_64px] items-center gap-2 border-0 border-b border-(--line) bg-transparent px-2 text-left text-[12px] text-(--ink) hover:bg-(--accent-weak)";
export const tagCatalogHeadClass =
  "grid h-6 grid-cols-[minmax(0,1fr)_64px] items-center gap-2 border-b border-(--line) bg-(--panel) px-2 text-[12px] font-semibold text-(--muted)";
export const managerPanelClass =
  "relative grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_24px] bg-(--panel)";
export const sectionHeaderClass =
  "grid h-7 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-(--line) bg-(--panel-strong) px-2 text-[12px] font-semibold text-(--ink)";
export const messageClass =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--muted)";
export const tagPillClass =
  "inline-flex min-h-5 max-w-full items-center overflow-hidden rounded-(--radius) border border-(--line-strong) bg-(--tag-bg) px-1.5 text-[12px] text-(--ink)";
export const tagPillSelectedClass = "tag-manager-pending";
export const emptyClass = "ui-empty";
export const operationPanelClass =
  "grid min-h-0 grid-rows-[27px_24px_minmax(0,1fr)] bg-(--surface-bg)";
export const operationRowClass =
  "grid min-h-[30px] grid-cols-[minmax(110px,1fr)_76px_106px_minmax(112px,auto)] items-center gap-x-3 border-b border-(--line) px-2 text-[12px] text-(--ink)";
export const operationHeadRowClass =
  "grid h-6 grid-cols-[minmax(110px,1fr)_76px_106px_minmax(112px,auto)] items-center gap-x-3 border-b border-(--line) bg-(--panel) px-2 text-[12px] font-semibold text-(--muted)";
export const relationListClass =
  "relative min-h-0 overflow-auto bg-(--surface-bg) p-1.5";
export const relationRowClass =
  "mb-1 block min-h-5 w-full overflow-hidden border border-transparent bg-transparent px-1.5 text-left text-[12px] text-(--ink) text-ellipsis whitespace-nowrap";
export const relationRowSelectedClass = "tag-manager-pending";
export const relationInputShellClass =
  "relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5 border-b border-(--line) bg-(--panel) p-1";
export const relationInputClass =
  "tag-token-input min-h-6 border border-(--line-strong) bg-(--surface-inset-bg)";
