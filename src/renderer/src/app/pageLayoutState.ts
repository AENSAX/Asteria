import type { PageLayoutSettings } from "../../../shared/ipc";

export interface PageLayoutState {
  settings: PageLayoutSettings;
  templateText: {
    default: string;
    newPage: string;
  };
}

export async function loadPageLayoutState(
  fallbackTemplateText: string,
): Promise<PageLayoutState> {
  let defaultTemplate = fallbackTemplateText;
  let newPageTemplate = fallbackTemplateText;
  let settings: PageLayoutSettings = {
    defaultConfigId: null,
    newPageConfigId: null,
  };

  if (window.asteria) {
    try {
      const [loadedSettings, loadedDefaultTemplate, loadedNewPageTemplate] =
        await Promise.all([
          window.asteria.getPageLayoutSettings(),
          window.asteria.getPageLayoutTemplate("default"),
          window.asteria.getPageLayoutTemplate("newPage"),
        ]);
      settings = loadedSettings;
      defaultTemplate = loadedDefaultTemplate;
      newPageTemplate = loadedNewPageTemplate;
    } catch {
      defaultTemplate = fallbackTemplateText;
      newPageTemplate = fallbackTemplateText;
    }
  }

  return {
    settings,
    templateText: {
      default: defaultTemplate,
      newPage: newPageTemplate,
    },
  };
}
