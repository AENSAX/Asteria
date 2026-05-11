import { useEffect } from "react";

export function useWindowTitle(title: string): void {
  useEffect(() => {
    if (!window.asteria) {
      return;
    }

    void window.asteria.setWindowTitle(title);
  }, [title]);
}
