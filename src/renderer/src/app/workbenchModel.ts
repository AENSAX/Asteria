import { Actions, Model, TabNode, type IJsonModel } from "flexlayout-react";
import { parse } from "jsonc-parser";
import defaultPageTemplateText from "../../../../config/page-templates/default-page.jsonc?raw";
import type { TranslationFunction } from "../utils/language";

export type ViewComponent =
  | "empty-page"
  | "file-import"
  | "file-browser"
  | "search"
  | "tag-list";

export type OpenableViewComponent = Exclude<ViewComponent, "empty-page">;
const WORKBENCH_SPLITTER_SIZE = 1;

export function getPageTitle(
  pageNumber: number,
  t: TranslationFunction,
): string {
  return t("app.pageName", { index: pageNumber });
}

export function getPageNumber(pageId: string): number {
  return Number(pageId.match(/^page-(\d+)$/)?.[1] ?? 0);
}

export function isViewComponent(value: unknown): value is ViewComponent {
  return (
    value === "empty-page" ||
    value === "file-import" ||
    value === "file-browser" ||
    value === "search" ||
    value === "tag-list"
  );
}

export function getViewTabTitle(
  component: ViewComponent,
  t: TranslationFunction,
): string {
  if (component === "empty-page") {
    return t("app.emptyPage");
  }

  if (component === "file-import") {
    return t("app.action.import");
  }

  if (component === "file-browser") {
    return t("app.action.browser");
  }

  if (component === "search") {
    return t("app.action.search");
  }

  return t("app.action.tags");
}

export function syncViewTabTitles<T extends { model: Model }>(
  page: T,
  t: TranslationFunction,
): T {
  const renames: Array<{ id: string; title: string }> = [];

  page.model.visitNodes((node) => {
    if (node.getType() !== "tab" || !(node instanceof TabNode)) {
      return;
    }

    const component = node.getComponent();

    if (!isViewComponent(component)) {
      return;
    }

    const title = getViewTabTitle(component, t);

    if (node.getName() !== title) {
      renames.push({ id: node.getId(), title });
    }
  });

  for (const rename of renames) {
    page.model.doAction(Actions.renameTab(rename.id, rename.title));
  }

  return renames.length > 0 ? { ...page } : page;
}

export function createPageModel(templateText = defaultPageTemplateText): Model {
  try {
    return Model.fromJson(normalizePageModelJson(parse(templateText)));
  } catch {
    return Model.fromJson(normalizePageModelJson(parse(defaultPageTemplateText)));
  }
}

export function createPageModelFromJson(modelJson: IJsonModel): Model {
  return Model.fromJson(normalizePageModelJson(modelJson));
}

function normalizePageModelJson(modelJson: unknown): IJsonModel {
  const json = structuredClone(modelJson) as IJsonModel & {
    global?: Record<string, unknown>;
  };

  json.global = {
    ...(json.global ?? {}),
    splitterSize: WORKBENCH_SPLITTER_SIZE,
  };

  return json;
}

export function createViewTab(
  component: OpenableViewComponent,
  viewId: number,
  t: TranslationFunction,
): Record<string, string> {
  return {
    type: "tab",
    id: `view-${component}-${viewId}`,
    name: getViewTabTitle(component, t),
    component,
  };
}

export function findFirstTabsetId(model: Model): string | null {
  let tabsetId: string | null = null;

  model.visitNodes((node) => {
    if (!tabsetId && node.getType() === "tabset") {
      tabsetId = node.getId();
    }
  });

  return tabsetId;
}

export function findViewTabId(
  model: Model,
  component: OpenableViewComponent,
): string | null {
  let tabId: string | null = null;

  model.visitNodes((node) => {
    if (
      !tabId &&
      node.getType() === "tab" &&
      node instanceof TabNode &&
      node.getComponent() === component
    ) {
      tabId = node.getId();
    }
  });

  return tabId;
}

export function readWorkbenchCountersFromPages(
  pages: Array<{ id: string; model: Model }>,
): { nextPageCounter: number; nextViewCounter: number } {
  let maxPageNumber = 1;
  let maxViewNumber = 0;

  for (const page of pages) {
    const pageNumber = Number(page.id.match(/^page-(\d+)$/)?.[1] ?? 0);
    maxPageNumber = Math.max(maxPageNumber, pageNumber);

    page.model.visitNodes((node) => {
      if (node.getType() !== "tab") {
        return;
      }

      const viewNumber = Number(
        node.getId().match(/^view-[^-]+(?:-[^-]+)*-(\d+)$/)?.[1] ?? 0,
      );
      maxViewNumber = Math.max(maxViewNumber, viewNumber);
    });
  }

  return {
    nextPageCounter: maxPageNumber + 1,
    nextViewCounter: maxViewNumber + 1,
  };
}
