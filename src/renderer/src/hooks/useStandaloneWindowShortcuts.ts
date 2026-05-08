import { useShortcut } from './useShortcut';

interface UseStandaloneWindowShortcutsOptions {
  enabled: boolean;
}

export function useStandaloneWindowShortcuts({
  enabled
}: UseStandaloneWindowShortcutsOptions): void {
  useShortcut(
    'close-window',
    () => {
      window.close();
    },
    { enabled, allowInEditable: true }
  );
}
