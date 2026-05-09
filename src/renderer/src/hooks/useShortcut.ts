import { useEffect, useRef } from "react";
import {
  getShortcutDefinitions,
  isShortcutRecordingActive,
  matchesShortcutDefinition,
  type ShortcutAction,
} from "../utils/shortcuts";

interface UseShortcutOptions {
  enabled?: boolean;
  allowInEditable?: boolean;
}

export function useShortcut(
  action: ShortcutAction,
  handler: (event: KeyboardEvent) => void,
  options: UseShortcutOptions = {},
): void {
  const handlerRef = useRef(handler);
  const enabled = options.enabled ?? true;
  const allowInEditable = options.allowInEditable ?? false;

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (isShortcutRecordingActive()) {
        return;
      }

      if (
        event.defaultPrevented ||
        (!allowInEditable && isEditableTarget(event.target))
      ) {
        return;
      }

      if (!matchesShortcut(action, event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handlerRef.current(event);
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [action, allowInEditable, enabled]);
}

function matchesShortcut(
  action: ShortcutAction,
  event: KeyboardEvent,
): boolean {
  return getShortcutDefinitions(action).some((shortcut) =>
    matchesShortcutDefinition(shortcut, event),
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;

  if (!element) {
    return false;
  }

  return Boolean(
    element.closest('input, textarea, select, [contenteditable="true"]'),
  );
}
