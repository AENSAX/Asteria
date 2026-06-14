import { lazy, Suspense, type ReactNode } from "react";
import { useStandaloneWindowShortcuts } from "../hooks/useStandaloneWindowShortcuts";
import { useWindowTitle } from "../hooks/useWindowTitle";
import { parseIdList } from "../utils/ids";
import { useLanguage } from "../utils/language";
import { DialogWindow } from "../windows/DialogWindow";

const standaloneWindowClass = "h-full min-h-0 min-w-0 bg-(--bg)";
const standaloneWindowLoadingClass =
  "grid min-h-[180px] min-w-[280px] place-items-center bg-(--bg) text-[12px] text-(--muted)";

const LazyDatabaseManagerView = lazy(() =>
  import("../views/DatabaseManagerView").then((module) => ({
    default: module.DatabaseManagerView,
  })),
);
const LazyAiManagerWindow = lazy(() =>
  import("../windows/AiManagerWindow").then((module) => ({
    default: module.AiManagerWindow,
  })),
);
const LazyApiManagerWindow = lazy(() =>
  import("../windows/ApiManagerWindow").then((module) => ({
    default: module.ApiManagerWindow,
  })),
);
const LazyBatchOperationWindow = lazy(() =>
  import("../windows/BatchOperationWindow").then((module) => ({
    default: module.BatchOperationWindow,
  })),
);
const LazyBatchTagManagerWindow = lazy(() =>
  import("../windows/BatchTagManagerWindow").then((module) => ({
    default: module.BatchTagManagerWindow,
  })),
);
const LazyExportWindow = lazy(() =>
  import("../windows/ExportWindow").then((module) => ({
    default: module.ExportWindow,
  })),
);
const LazyFavoritesWindow = lazy(() =>
  import("../windows/FavoritesWindow").then((module) => ({
    default: module.FavoritesWindow,
  })),
);
const LazyFileDetailWindow = lazy(() =>
  import("../windows/FileDetailWindow").then((module) => ({
    default: module.FileDetailWindow,
  })),
);
const LazyScreeningDetailWindow = lazy(() =>
  import("../windows/FileDetailWindow").then((module) => ({
    default: module.ScreeningDetailWindow,
  })),
);
const LazyFileRatingEditorWindow = lazy(() =>
  import("../windows/FileRatingEditorWindow").then((module) => ({
    default: module.FileRatingEditorWindow,
  })),
);
const LazyHydrusImportWindow = lazy(() =>
  import("../windows/HydrusImportWindow").then((module) => ({
    default: module.HydrusImportWindow,
  })),
);
const LazyRecycleBinWindow = lazy(() =>
  import("../windows/RecycleBinWindow").then((module) => ({
    default: module.RecycleBinWindow,
  })),
);
const LazyRatingManagerWindow = lazy(() =>
  import("../windows/RatingManagerWindow").then((module) => ({
    default: module.RatingManagerWindow,
  })),
);
const LazySettingsWindow = lazy(() =>
  import("../windows/SettingsWindow").then((module) => ({
    default: module.SettingsWindow,
  })),
);
const LazyTagManagerWindow = lazy(() =>
  import("../windows/TagManagerWindow").then((module) => ({
    default: module.TagManagerWindow,
  })),
);
const LazyTagRelationTreeWindow = lazy(() =>
  import("../windows/TagRelationTreeWindow").then((module) => ({
    default: module.TagRelationTreeWindow,
  })),
);
const LazyTagTranslationWindow = lazy(() =>
  import("../windows/TagTranslationWindow").then((module) => ({
    default: module.TagTranslationWindow,
  })),
);
const LazyUrlManagerWindow = lazy(() =>
  import("../windows/UrlManagerWindow").then((module) => ({
    default: module.UrlManagerWindow,
  })),
);

interface StandaloneWindowRouterProps {
  query: URLSearchParams;
  windowMode: string;
}

export function StandaloneWindowRouter({
  query,
  windowMode,
}: StandaloneWindowRouterProps): JSX.Element {
  const { t } = useLanguage();
  useStandaloneWindowShortcuts({ enabled: true });

  if (windowMode === "database-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.viewDatabase")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyDatabaseManagerView />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "file-detail") {
    return (
      <StandaloneWindowFrame title={t("window.fileDetail.title")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyFileDetailWindow fileId={Number(query.get("id"))} />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "screening") {
    return (
      <StandaloneWindowFrame title={t("window.screening.title")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyScreeningDetailWindow fileIds={parseIdList(query.get("ids"))} />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "settings") {
    return (
      <StandaloneWindowFrame title={t("app.action.settings")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazySettingsWindow />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "tag-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.manageTags")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyTagManagerWindow />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "tag-relation-tree") {
    return (
      <StandaloneWindowFrame title={t("window.tagRelationTree.title")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyTagRelationTreeWindow
            tagIds={parseIdList(query.get("ids"))}
            kind={query.get("kind") === "sibling" ? "sibling" : "parent"}
          />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "recycle-bin") {
    return (
      <StandaloneWindowFrame title={t("app.action.recycleBin")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyRecycleBinWindow />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "rating-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.rating")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyRatingManagerWindow />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "api-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.api")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyApiManagerWindow />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "hydrus-import") {
    return (
      <StandaloneWindowFrame title={t("app.action.hydrusImport")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyHydrusImportWindow />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "ai-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.ai")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyAiManagerWindow />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "tag-translation") {
    return (
      <StandaloneWindowFrame title={t("app.action.tagTranslation")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyTagTranslationWindow />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "favorites") {
    return (
      <StandaloneWindowFrame title={t("app.action.favorites")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyFavoritesWindow />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "url-manager") {
    return (
      <StandaloneWindowFrame title={t("window.url.title")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyUrlManagerWindow fileIds={parseIdList(query.get("ids"))} />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "batch-tag-manager") {
    return (
      <StandaloneWindowFrame title={t("window.batchTagManager.title")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyBatchTagManagerWindow fileIds={parseIdList(query.get("ids"))} />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "batch-operation") {
    return (
      <StandaloneWindowFrame title={t("window.batchOperation.title")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyBatchOperationWindow fileIds={parseIdList(query.get("ids"))} />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "file-rating-editor") {
    return (
      <StandaloneWindowFrame title={t("window.fileRatingEditor.title")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyFileRatingEditorWindow
            fileIds={parseIdList(query.get("ids"))}
            groupId={Number(query.get("groupId"))}
          />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "export") {
    return (
      <StandaloneWindowFrame title={t("common.export")}>
        <Suspense fallback={<StandaloneWindowLoadingFallback />}>
          <LazyExportWindow fileIds={parseIdList(query.get("ids"))} />
        </Suspense>
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "dialog") {
    return (
      <main className={standaloneWindowClass}>
        <DialogWindow dialogId={query.get("dialogId") ?? ""} />
      </main>
    );
  }

  return <main className={standaloneWindowClass} />;
}

function StandaloneWindowFrame({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}): JSX.Element {
  useWindowTitle(title);

  return <main className={standaloneWindowClass}>{children}</main>;
}

function StandaloneWindowLoadingFallback(): JSX.Element {
  return <div className={standaloneWindowLoadingClass}>Loading...</div>;
}
