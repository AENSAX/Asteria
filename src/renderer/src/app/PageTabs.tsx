import type { MouseEvent } from "react";
import { useLanguage } from "../utils/language";

export interface PageTabItem {
  id: string;
  title: string;
}

interface PageTabsProps<TPage extends PageTabItem> {
  pages: TPage[];
  activePageId: string;
  onClosePage: (pageId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLDivElement>, page: TPage) => void;
  onSelectPage: (pageId: string) => void;
  onTabMouseDown: (event: MouseEvent<HTMLDivElement>, pageId: string) => void;
}

const pageTabClass =
  "group relative flex h-[30px] min-w-[132px] max-w-[220px] items-stretch border-r border-(--line) bg-transparent text-(--muted)";
const activePageTabClass =
  "group bg-(--panel) text-(--ink) relative flex h-[30px] min-w-[132px] max-w-[220px] items-stretch border-r border-(--line)";
const pageTabTitleClass =
  "min-w-0 flex-1 cursor-default overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent px-2 pr-7 text-left text-[11px] text-inherit";
const pageTabCloseClass = "page-tab-close";

export function PageTabs<TPage extends PageTabItem>({
  pages,
  activePageId,
  onClosePage,
  onOpenContextMenu,
  onSelectPage,
  onTabMouseDown,
}: PageTabsProps<TPage>): JSX.Element {
  const { t } = useLanguage();

  return (
    <nav
      className="flex min-w-0 items-stretch border-b border-(--line) bg-(--page-tabbar-bg)"
      aria-label={t("app.pageList")}
    >
      {pages.map((page) => (
        <div
          className={
            page.id === activePageId ? activePageTabClass : pageTabClass
          }
          key={page.id}
          onContextMenu={(event) => onOpenContextMenu(event, page)}
          onMouseDown={(event) => onTabMouseDown(event, page.id)}
        >
          <button
            className={pageTabTitleClass}
            type="button"
            onClick={() => onSelectPage(page.id)}
          >
            {page.title}
          </button>
          <button
            className={cx(
              pageTabCloseClass,
              page.id === activePageId && "page-tab-close-active",
            )}
            type="button"
            onClick={(event) => onClosePage(page.id, event)}
            title={t("common.close")}
          >
            ×
          </button>
        </div>
      ))}
    </nav>
  );
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
