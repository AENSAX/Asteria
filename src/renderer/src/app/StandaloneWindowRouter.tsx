import { useStandaloneWindowShortcuts } from "../hooks/useStandaloneWindowShortcuts";
import { useWindowTitle } from "../hooks/useWindowTitle";
import { parseIdList } from "../utils/ids";
import { useLanguage } from "../utils/language";
import { DatabaseManagerView } from "../views/DatabaseManagerView";
import { AiManagerWindow } from "../windows/AiManagerWindow";
import { ApiManagerWindow } from "../windows/ApiManagerWindow";
import { BatchOperationWindow } from "../windows/BatchOperationWindow";
import { BatchTagManagerWindow } from "../windows/BatchTagManagerWindow";
import { DialogWindow } from "../windows/DialogWindow";
import { ExportWindow } from "../windows/ExportWindow";
import { FavoritesWindow } from "../windows/FavoritesWindow";
import {
  FileDetailWindow,
  ScreeningDetailWindow,
} from "../windows/FileDetailWindow";
import { FileRatingEditorWindow } from "../windows/FileRatingEditorWindow";
import { HydrusImportWindow } from "../windows/HydrusImportWindow";
import { RecycleBinWindow } from "../windows/RecycleBinWindow";
import { RatingManagerWindow } from "../windows/RatingManagerWindow";
import { SettingsWindow } from "../windows/SettingsWindow";
import { TagManagerWindow } from "../windows/TagManagerWindow";
import { TagRelationTreeWindow } from "../windows/TagRelationTreeWindow";
import { TagTranslationWindow } from "../windows/TagTranslationWindow";
import { UrlManagerWindow } from "../windows/UrlManagerWindow";

const standaloneWindowClass = "h-full min-h-0 min-w-0 bg-(--bg)";

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
        <DatabaseManagerView />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "file-detail") {
    return (
      <StandaloneWindowFrame title={t("window.fileDetail.title")}>
        <FileDetailWindow fileId={Number(query.get("id"))} />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "screening") {
    return (
      <StandaloneWindowFrame title={t("window.screening.title")}>
        <ScreeningDetailWindow fileIds={parseIdList(query.get("ids"))} />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "settings") {
    return (
      <StandaloneWindowFrame title={t("app.action.settings")}>
        <SettingsWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "tag-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.manageTags")}>
        <TagManagerWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "tag-relation-tree") {
    return (
      <StandaloneWindowFrame title={t("window.tagRelationTree.title")}>
        <TagRelationTreeWindow
          tagIds={parseIdList(query.get("ids"))}
          kind={query.get("kind") === "sibling" ? "sibling" : "parent"}
        />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "recycle-bin") {
    return (
      <StandaloneWindowFrame title={t("app.action.recycleBin")}>
        <RecycleBinWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "rating-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.rating")}>
        <RatingManagerWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "api-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.api")}>
        <ApiManagerWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "hydrus-import") {
    return (
      <StandaloneWindowFrame title={t("app.action.hydrusImport")}>
        <HydrusImportWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "ai-manager") {
    return (
      <StandaloneWindowFrame title={t("app.action.ai")}>
        <AiManagerWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "tag-translation") {
    return (
      <StandaloneWindowFrame title={t("app.action.tagTranslation")}>
        <TagTranslationWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "favorites") {
    return (
      <StandaloneWindowFrame title={t("app.action.favorites")}>
        <FavoritesWindow />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "url-manager") {
    return (
      <StandaloneWindowFrame title={t("window.url.title")}>
        <UrlManagerWindow fileIds={parseIdList(query.get("ids"))} />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "batch-tag-manager") {
    return (
      <StandaloneWindowFrame title={t("window.batchTagManager.title")}>
        <BatchTagManagerWindow fileIds={parseIdList(query.get("ids"))} />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "batch-operation") {
    return (
      <StandaloneWindowFrame title={t("window.batchOperation.title")}>
        <BatchOperationWindow fileIds={parseIdList(query.get("ids"))} />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "file-rating-editor") {
    return (
      <StandaloneWindowFrame title={t("window.fileRatingEditor.title")}>
        <FileRatingEditorWindow
          fileIds={parseIdList(query.get("ids"))}
          groupId={Number(query.get("groupId"))}
        />
      </StandaloneWindowFrame>
    );
  }

  if (windowMode === "export") {
    return (
      <StandaloneWindowFrame title={t("common.export")}>
        <ExportWindow fileIds={parseIdList(query.get("ids"))} />
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
  children: JSX.Element;
  title: string;
}): JSX.Element {
  useWindowTitle(title);

  return <main className={standaloneWindowClass}>{children}</main>;
}
