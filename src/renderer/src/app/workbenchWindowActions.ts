import type { OpenableViewComponent } from "./workbenchModel";

interface WorkbenchWindowActionsOptions {
  closeMenu: () => void;
  openImportView: () => unknown;
  openView: (component: OpenableViewComponent) => void;
}

export interface WorkbenchWindowActions {
  openAiManager: () => Promise<void>;
  openApiManager: () => Promise<void>;
  openBrowser: () => void;
  openDatabaseManager: () => Promise<void>;
  openFavorites: () => Promise<void>;
  openFileImportView: () => void;
  openHydrusImport: () => Promise<void>;
  openRatingManager: () => Promise<void>;
  openRecycleBin: () => Promise<void>;
  openSearch: () => void;
  openSettings: () => Promise<void>;
  openTagList: () => void;
  openTagManager: () => Promise<void>;
  openTagTranslation: () => Promise<void>;
}

export function createWorkbenchWindowActions({
  closeMenu,
  openImportView,
  openView,
}: WorkbenchWindowActionsOptions): WorkbenchWindowActions {
  async function openDatabaseManager(): Promise<void> {
    closeMenu();
    await window.asteria?.openDatabaseManagerWindow();
  }

  async function openTagManager(): Promise<void> {
    closeMenu();
    await window.asteria?.openTagManagerWindow();
  }

  async function openRecycleBin(): Promise<void> {
    closeMenu();
    await window.asteria?.openRecycleBinWindow();
  }

  async function openSettings(): Promise<void> {
    closeMenu();
    await window.asteria?.openSettingsWindow();
  }

  async function openRatingManager(): Promise<void> {
    closeMenu();
    await window.asteria?.openRatingManagerWindow();
  }

  async function openApiManager(): Promise<void> {
    closeMenu();
    await window.asteria?.openApiManagerWindow();
  }

  async function openFavorites(): Promise<void> {
    closeMenu();
    await window.asteria?.openFavoritesWindow();
  }

  async function openHydrusImport(): Promise<void> {
    closeMenu();
    await window.asteria?.openHydrusImportWindow();
  }

  async function openAiManager(): Promise<void> {
    closeMenu();
    await window.asteria?.openAiManagerWindow();
  }

  async function openTagTranslation(): Promise<void> {
    closeMenu();
    await window.asteria?.openTagTranslationWindow();
  }

  function openBrowser(): void {
    closeMenu();
    openView("file-browser");
  }

  function openSearch(): void {
    closeMenu();
    openView("search");
  }

  function openTagList(): void {
    closeMenu();
    openView("tag-list");
  }

  function openFileImportView(): void {
    closeMenu();
    openImportView();
  }

  return {
    openAiManager,
    openApiManager,
    openBrowser,
    openDatabaseManager,
    openFavorites,
    openFileImportView,
    openHydrusImport,
    openRatingManager,
    openRecycleBin,
    openSearch,
    openSettings,
    openTagList,
    openTagManager,
    openTagTranslation,
  };
}
