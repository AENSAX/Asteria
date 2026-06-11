import type { Dispatch, RefObject, SetStateAction } from "react";
import { ActionFeedbackButton } from "../components/ActionFeedbackButton";
import { useLanguage } from "../utils/language";

export type WorkbenchMenuName =
  | "file"
  | "page"
  | "view"
  | "database"
  | "service"
  | "extension";

interface WorkbenchMenuBarProps {
  activePageAvailable: boolean;
  isImporting: boolean;
  menuRef: RefObject<HTMLDivElement>;
  openMenu: WorkbenchMenuName | null;
  setOpenMenu: Dispatch<SetStateAction<WorkbenchMenuName | null>>;
  onCreatePage: () => void;
  onOpenAiManager: () => void | Promise<void>;
  onOpenApiManager: () => void | Promise<void>;
  onOpenBrowser: () => void;
  onOpenDatabaseManager: () => void | Promise<void>;
  onOpenFavorites: () => void | Promise<void>;
  onOpenFileImportView: () => void;
  onOpenHydrusImport: () => void | Promise<void>;
  onOpenRatingManager: () => void | Promise<void>;
  onOpenRecycleBin: () => void | Promise<void>;
  onOpenSearch: () => void;
  onOpenSettings: () => void | Promise<void>;
  onOpenTagList: () => void;
  onOpenTagManager: () => void | Promise<void>;
  onOpenTagTranslation: () => void | Promise<void>;
  onSaveActivePageLayout: () => void | Promise<void>;
  onStartFileImport: () => void | Promise<void>;
  onStartFolderImport: () => void | Promise<void>;
}

const menuButtonClass =
  "h-full min-w-12 cursor-default border-0 bg-transparent px-3 text-[11px] hover:bg-(--panel-strong)";
const activeMenuButtonClass = `${menuButtonClass} bg-(--panel-strong)`;
const menuDropdownClass =
  "absolute left-0 top-full z-10 min-w-[132px] border border-(--line-strong) bg-(--panel) p-1 [&>button]:h-[26px] [&>button]:w-full [&>button]:cursor-default [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-2.5 [&>button]:text-left [&>button]:text-[11px] [&>button:disabled]:text-(--disabled-ink) [&>button:hover:not(:disabled)]:bg-(--accent-weak)";

export function WorkbenchMenuBar({
  activePageAvailable,
  isImporting,
  menuRef,
  openMenu,
  setOpenMenu,
  onCreatePage,
  onOpenAiManager,
  onOpenApiManager,
  onOpenBrowser,
  onOpenDatabaseManager,
  onOpenFavorites,
  onOpenFileImportView,
  onOpenHydrusImport,
  onOpenRatingManager,
  onOpenRecycleBin,
  onOpenSearch,
  onOpenSettings,
  onOpenTagList,
  onOpenTagManager,
  onOpenTagTranslation,
  onSaveActivePageLayout,
  onStartFileImport,
  onStartFolderImport,
}: WorkbenchMenuBarProps): JSX.Element {
  const { t } = useLanguage();

  function toggleMenu(menuName: WorkbenchMenuName): void {
    setOpenMenu((menu) => (menu === menuName ? null : menuName));
  }

  return (
    <header className="flex items-stretch border-b border-(--line) bg-(--app-bar-bg)">
      <div className="flex" ref={menuRef}>
        <div className="relative">
          <button
            className={
              openMenu === "file" ? activeMenuButtonClass : menuButtonClass
            }
            type="button"
            onClick={() => toggleMenu("file")}
          >
            {t("app.menu.file")}
          </button>

          {openMenu === "file" ? (
            <div className={menuDropdownClass}>
              <button
                disabled={isImporting}
                title={t("app.action.importFilesTitle")}
                type="button"
                onClick={() => void onStartFileImport()}
              >
                {t("app.action.importFiles")}
              </button>
              <button
                disabled={isImporting}
                title={t("app.action.importFolderTitle")}
                type="button"
                onClick={() => void onStartFolderImport()}
              >
                {t("app.action.importFolder")}
              </button>
              <button type="button" onClick={() => void onOpenSettings()}>
                {t("app.action.settings")}
              </button>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            className={
              openMenu === "page" ? activeMenuButtonClass : menuButtonClass
            }
            type="button"
            onClick={() => toggleMenu("page")}
          >
            {t("app.menu.page")}
          </button>

          {openMenu === "page" ? (
            <div className={menuDropdownClass}>
              <button type="button" onClick={onCreatePage}>
                {t("app.action.newPage")}
              </button>
              <ActionFeedbackButton
                afterFeedback={() => setOpenMenu(null)}
                disabled={!activePageAvailable}
                label={t("app.action.saveLayout")}
                onAction={onSaveActivePageLayout}
              />
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            className={
              openMenu === "view" ? activeMenuButtonClass : menuButtonClass
            }
            type="button"
            onClick={() => toggleMenu("view")}
          >
            {t("app.menu.view")}
          </button>

          {openMenu === "view" ? (
            <div className={menuDropdownClass}>
              <button type="button" onClick={onOpenFileImportView}>
                {t("app.action.import")}
              </button>
              <button type="button" onClick={onOpenBrowser}>
                {t("app.action.browser")}
              </button>
              <button type="button" onClick={onOpenSearch}>
                {t("app.action.search")}
              </button>
              <button type="button" onClick={onOpenTagList}>
                {t("app.action.tags")}
              </button>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            className={
              openMenu === "database" ? activeMenuButtonClass : menuButtonClass
            }
            type="button"
            onClick={() => toggleMenu("database")}
          >
            {t("app.menu.database")}
          </button>

          {openMenu === "database" ? (
            <div className={menuDropdownClass}>
              <button
                type="button"
                onClick={() => void onOpenDatabaseManager()}
              >
                {t("app.action.viewDatabase")}
              </button>
              <button type="button" onClick={() => void onOpenTagManager()}>
                {t("app.action.manageTags")}
              </button>
              <button type="button" onClick={() => void onOpenRecycleBin()}>
                {t("app.action.recycleBin")}
              </button>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            className={
              openMenu === "service" ? activeMenuButtonClass : menuButtonClass
            }
            type="button"
            onClick={() => toggleMenu("service")}
          >
            {t("app.menu.service")}
          </button>

          {openMenu === "service" ? (
            <div className={menuDropdownClass}>
              <button type="button" onClick={() => void onOpenRatingManager()}>
                {t("app.action.rating")}
              </button>
              <button type="button" onClick={() => void onOpenApiManager()}>
                API
              </button>
              <button type="button" onClick={() => void onOpenFavorites()}>
                {t("app.action.favorites")}
              </button>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            className={
              openMenu === "extension" ? activeMenuButtonClass : menuButtonClass
            }
            type="button"
            onClick={() => toggleMenu("extension")}
          >
            {t("app.menu.extension")}
          </button>

          {openMenu === "extension" ? (
            <div className={menuDropdownClass}>
              <button type="button" onClick={() => void onOpenHydrusImport()}>
                {t("app.action.hydrusImport")}
              </button>
              <button type="button" onClick={() => void onOpenAiManager()}>
                {t("app.action.ai")}
              </button>
              <button type="button" onClick={() => void onOpenTagTranslation()}>
                {t("app.action.tagTranslation")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
