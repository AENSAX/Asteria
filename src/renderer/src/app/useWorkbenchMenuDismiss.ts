import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type {
  PageTabContextMenuState,
  ViewTabContextMenuState,
} from "./WorkbenchContextMenus";
import type { WorkbenchMenuName } from "./WorkbenchMenuBar";

interface WorkbenchMenuDismissOptions {
  menuRef: RefObject<HTMLDivElement>;
  setOpenMenu: Dispatch<SetStateAction<WorkbenchMenuName | null>>;
  setPageContextMenu: Dispatch<SetStateAction<PageTabContextMenuState | null>>;
  setViewContextMenu: Dispatch<SetStateAction<ViewTabContextMenuState | null>>;
}

export function useWorkbenchMenuDismiss({
  menuRef,
  setOpenMenu,
  setPageContextMenu,
  setViewContextMenu,
}: WorkbenchMenuDismissOptions): void {
  useEffect(() => {
    function closeMenu(event: MouseEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }

      if (
        !(event.target as Element | null)?.closest(".view-tab-context-menu")
      ) {
        setViewContextMenu(null);
      }

      if (
        !(event.target as Element | null)?.closest(".page-tab-context-menu")
      ) {
        setPageContextMenu(null);
      }
    }

    window.addEventListener("mousedown", closeMenu);

    return () => {
      window.removeEventListener("mousedown", closeMenu);
    };
  }, [menuRef, setOpenMenu, setPageContextMenu, setViewContextMenu]);
}
