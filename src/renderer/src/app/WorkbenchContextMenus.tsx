import type { Dispatch, SetStateAction } from "react";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { useLanguage } from "../utils/language";

export interface ViewTabContextMenuState {
  x: number;
  y: number;
  pageId: string;
  tabId: string;
}

export interface PageTabContextMenuState {
  x: number;
  y: number;
  pageId: string;
  title: string;
  renaming: boolean;
}

interface WorkbenchContextMenusProps {
  pageContextMenu: PageTabContextMenuState | null;
  viewContextMenu: ViewTabContextMenuState | null;
  onRefreshViewTab: (pageId: string, tabId: string) => void;
  onRenamePage: (pageId: string, title: string) => void;
  onSavePageTitle: (pageId: string, title: string) => boolean;
  setPageContextMenu: Dispatch<SetStateAction<PageTabContextMenuState | null>>;
}

const contextMenuClass =
  "fixed z-30 w-[142px] border border-(--line-strong) bg-(--panel) p-1 [&>button]:block [&>button]:h-6 [&>button]:w-full [&>button]:cursor-default [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-2 [&>button]:text-left [&>button]:text-[12px] [&>button]:text-(--ink) [&>button:hover]:bg-(--accent-weak)";
const contextMenuRenameClass =
  "grid grid-cols-[minmax(0,1fr)_48px] gap-1 [&>input]:h-6 [&>input]:min-w-0 [&>input]:border [&>input]:border-(--line-strong) [&>input]:bg-(--surface-inset-bg) [&>input]:px-1.5 [&>input]:text-(--ink) [&>input]:outline-0 [&>input::placeholder]:text-(--disabled-ink)";

export function WorkbenchContextMenus({
  pageContextMenu,
  setPageContextMenu,
  viewContextMenu,
  onRefreshViewTab,
  onRenamePage,
  onSavePageTitle,
}: WorkbenchContextMenusProps): JSX.Element {
  const { t } = useLanguage();

  return (
    <>
      {viewContextMenu ? (
        <div
          className={`${contextMenuClass} view-tab-context-menu`}
          style={{ left: viewContextMenu.x, top: viewContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() =>
              onRefreshViewTab(viewContextMenu.pageId, viewContextMenu.tabId)
            }
          >
            {t("common.refresh")}
          </button>
        </div>
      ) : null}

      {pageContextMenu ? (
        <div
          className={`${contextMenuClass} page-tab-context-menu w-[184px]`}
          style={{ left: pageContextMenu.x, top: pageContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {pageContextMenu.renaming ? (
            <div className={contextMenuRenameClass}>
              <input
                aria-label={t("app.pageNameInput")}
                autoFocus
                placeholder={t("app.pageNamePlaceholder")}
                value={pageContextMenu.title}
                onChange={(event) =>
                  setPageContextMenu((menu) =>
                    menu ? { ...menu, title: event.target.value } : menu,
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onRenamePage(pageContextMenu.pageId, pageContextMenu.title);
                  }

                  if (event.key === "Escape") {
                    setPageContextMenu(null);
                  }
                }}
              />
              <ActionFeedbackButton
                afterFeedback={() => setPageContextMenu(null)}
                label={t("common.save")}
                onAction={() => {
                  if (
                    !onSavePageTitle(
                      pageContextMenu.pageId,
                      pageContextMenu.title,
                    )
                  ) {
                    throw new Error(t("app.pageNameEmpty"));
                  }
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                setPageContextMenu((menu) =>
                  menu ? { ...menu, renaming: true } : menu,
                )
              }
            >
              {t("common.rename")}
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
