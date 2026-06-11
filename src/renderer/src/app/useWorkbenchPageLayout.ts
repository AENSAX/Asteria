import { useState } from "react";
import type { PageLayoutSettings } from "../../../shared/ipc";
import { loadPageLayoutState } from "./pageLayoutState";

interface WorkbenchPageLayout {
  pageLayoutSettings: PageLayoutSettings;
  pageTemplateText: {
    default: string;
    newPage: string;
  };
  reloadPageLayoutState: () => Promise<{
    settings: PageLayoutSettings;
    templateText: {
      default: string;
      newPage: string;
    };
  }>;
}

export function useWorkbenchPageLayout(
  fallbackTemplateText: string,
): WorkbenchPageLayout {
  const [pageTemplateText, setPageTemplateText] = useState({
    default: fallbackTemplateText,
    newPage: fallbackTemplateText,
  });
  const [pageLayoutSettings, setPageLayoutSettings] =
    useState<PageLayoutSettings>({
      defaultConfigId: null,
      newPageConfigId: null,
    });

  async function reloadPageLayoutState(): Promise<{
    settings: PageLayoutSettings;
    templateText: {
      default: string;
      newPage: string;
    };
  }> {
    const pageLayoutState = await loadPageLayoutState(fallbackTemplateText);
    setPageTemplateText(pageLayoutState.templateText);
    setPageLayoutSettings(pageLayoutState.settings);
    return pageLayoutState;
  }

  return {
    pageLayoutSettings,
    pageTemplateText,
    reloadPageLayoutState,
  };
}
