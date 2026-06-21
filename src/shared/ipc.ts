export interface DatabaseStatus {
  path: string;
  schemaVersion: number;
  fileCount: number;
  importBatchCount: number;
  tagCount: number;
}

export interface DatabaseFileRecord {
  id: number;
  sha256: string;
  fileName: string;
  extension: string | null;
  storagePath: string | null;
  sizeBytes: number;
  originalPath: string;
  importedAt: string;
  updatedAt: string;
  domain: FileDomain;
  domainName: string;
  isFavorite: boolean;
  width: number | null;
  height: number | null;
}

export interface DatabaseFilePage {
  page: number;
  pageSize: number;
  total: number;
  files: DatabaseFileRecord[];
}

export interface BrowserFileRecord extends DatabaseFileRecord {
  mediaUrl: string;
  thumbnailUrl: string;
  ratings: FileRatingRecord[];
}

export interface BrowserFilePage {
  page: number;
  pageSize: number;
  total: number;
  files: BrowserFileRecord[];
}

export interface BrowserFilePageRequest {
  page: number;
  pageSize: number;
  sortKey: "importedAt" | "updatedAt";
  sortDirection: "asc" | "desc";
}

export interface BrowserSearchPageRequest extends BrowserFilePageRequest {
  query: string;
}

export type FilesChangedKind =
  | "ai-tags"
  | "deleted"
  | "domain"
  | "imported"
  | "metadata"
  | "mixed"
  | "ratings"
  | "relations"
  | "restored"
  | "tags"
  | "trashed"
  | "unknown";

export interface FilesChangedPayload {
  kind: FilesChangedKind;
  fileIds?: number[];
  fullRefresh?: boolean;
}

export type SettingsChangedKind = "ai" | "tagTranslation";

export interface SettingsChangedPayload {
  kind: SettingsChangedKind;
}

export interface FileDetailRecord extends BrowserFileRecord {}

export interface TagRecord {
  id: number;
  styleName: string;
  namespace: string;
  name: string;
  displayName: string | null;
  fileCount?: number;
}

export interface TagParentRecord {
  child: TagRecord;
  parent: TagRecord;
  createdAt: string;
}

export interface TagSiblingRecord {
  alias: TagRecord;
  canonical: TagRecord;
  createdAt: string;
}

export interface TagParentPair {
  childTagId: number;
  parentTagId: number;
}

export interface TagSiblingPair {
  aliasTagId: number;
  canonicalTagId: number;
}

export interface BatchMutationResult {
  succeeded: number;
  errors: string[];
}

export interface CreateManagedTagsResult {
  tags: ManagedTagRecord[];
  errors: string[];
}

export type TagRelationTreeKind = "parent" | "sibling";

export interface TagRelationTreeNode extends TagRecord {
  selected: boolean;
}

export interface TagRelationTreeEdge {
  childTagId: number;
  parentTagId: number;
}

export interface TagRelationTree {
  nodes: TagRelationTreeNode[];
  edges: TagRelationTreeEdge[];
}

export interface TagStyleRecord {
  id: number;
  name: string;
  displayName: string;
  tagCount: number;
  createdAt: string;
  isDefault: boolean;
}

export interface DeleteTagStyleResult {
  styles: TagStyleRecord[];
  deletedTagCount: number;
  deletedFileTagCount: number;
}

export interface DeleteManagedTagsResult {
  deletedTagCount: number;
  deletedFileCount: number;
}

export interface ManagedTagRenamePreview {
  tagId: number;
  directFileCount: number;
  effectiveFileCount: number;
  impliedFileCount: number;
  directParentCount: number;
  directChildCount: number;
  aliasCount: number;
  canonicalTargetCount: number;
  duplicateTagId: number | null;
}

export type FileDomain = "pending" | "library" | "trash";

export interface DomainRecord {
  id: FileDomain;
  name: string;
  displayName: string;
  fileCount: number;
}

export interface ManagedTagRecord extends TagRecord {
  styleId: number;
  fileCount: number;
  createdAt: string;
}

export interface FileTagRecord extends TagRecord {
  createdAt: string;
  semanticKind?: "parent" | "canonical";
}

export interface BatchFileTagRecord extends FileTagRecord {
  fileCount: number;
}

export interface FileUrlRecord {
  id: number;
  fileId: number;
  url: string;
  normalizedUrl: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
}

export interface RatingGroupRecord {
  id: number;
  name: string;
  isActive: boolean;
  entryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RatingEntryRecord {
  id: number;
  groupId: number;
  label: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileRatingRecord {
  groupId: number;
  groupName: string;
  entryId: number;
  label: string;
  color: string;
}

export interface ExportFileRecord extends DatabaseFileRecord {
  sourcePath: string;
  tags: FileTagRecord[];
  ratings: FileRatingRecord[];
}

export interface SearchHintRecord {
  id: number;
  kind: "tag" | "domain" | "favorite" | "rating";
  styleName: string;
  namespace: string;
  name: string;
  displayName: string | null;
  color: string | null;
  fileCount: number;
}

export interface TagDraft {
  id?: number;
  namespace: string;
  name: string;
}

export interface StorageSettings {
  fileStoragePath: string;
  thumbnailStoragePath: string;
  convertImportedImagesToPng: boolean;
}

export interface NetworkSettings {
  proxyEnabled: boolean;
  proxyHost: string;
  proxyPort: number;
}

export interface TagTranslationSettings {
  csvPath: string;
  keepOriginalTags: boolean;
  enableContextMenuTranslation: boolean;
  translateOnTagCreate: boolean;
}

export interface TagTranslationSummary {
  fileCount: number;
  translatedTagCount: number;
  removedOriginalTagCount: number;
  missingTranslationCount: number;
}

export interface WorkStatus {
  active: boolean;
  message: string;
  messageKey?: string;
  messageValues?: Record<string, string | number>;
  queued: number;
  processing: number;
  completed: number;
}

export interface PageLayoutConfigRecord {
  id: string;
  name: string;
  path: string;
  isDefault: boolean;
  isNewPage: boolean;
  updatedAt: string;
}

export interface PageLayoutSettings {
  defaultConfigId: string | null;
  newPageConfigId: string | null;
}

export interface OperationProgress {
  title: string;
  titleKey?: string;
  titleValues?: Record<string, string | number>;
  total: number;
  processed: number;
  message: string;
  messageKey?: string;
  messageValues?: Record<string, string | number>;
  completed: boolean;
}

export type GenericDialogKind = "alert" | "confirm" | "progress";

export interface GenericDialogState {
  id: string;
  kind: GenericDialogKind;
  title: string;
  titleKey?: string;
  titleValues?: Record<string, string | number>;
  message: string;
  messageKey?: string;
  messageValues?: Record<string, string | number>;
  confirmText: string;
  confirmTextKey?: string;
  cancelText: string;
  cancelTextKey?: string;
  progress: OperationProgress | null;
}

export interface ConfirmDialogOptions {
  title?: string;
  titleKey?: string;
  titleValues?: Record<string, string | number>;
  message: string;
  messageKey?: string;
  messageValues?: Record<string, string | number>;
  confirmText?: string;
  confirmTextKey?: string;
  cancelText?: string;
  cancelTextKey?: string;
}

export type ManagedTagSortKey = "name" | "createdAt" | "fileCount";
export type SortDirection = "asc" | "desc";

export type ImportPhase =
  | "idle"
  | "selecting"
  | "preparing"
  | "ready"
  | "importing"
  | "completed"
  | "canceled"
  | "failed";

export interface ImportDuplicateRecord {
  fileId: number;
  domain: FileDomain;
  domainName: string;
}

export interface ImportQueueFileRecord {
  id: number;
  fileName: string;
  extension: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  originalPath: string;
  sourceUrl: string | null;
  sha256: string;
  mediaUrl: string;
  duplicate: ImportDuplicateRecord | null;
  status: "ready" | "failed";
  errorMessage: string | null;
}

export interface ImportProgress {
  phase: ImportPhase;
  batchId: number | null;
  total: number;
  processed: number;
  imported: number;
  duplicated: number;
  failed: number;
  chunkIndex: number;
  chunkTotal: number;
  currentFile: string | null;
  message: string;
  messageKey?: string;
  messageValues?: Record<string, string | number>;
}

export interface ImportCommitResult extends ImportProgress {
  remainingQueue: ImportQueueFileRecord[];
  committedFileIds: number[];
}

export interface HydrusImportOptions {
  baseUrl: string;
  accessKey: string;
  searchTags: string[];
  tagStyleName: string;
  limit: number;
  metadataBatchSize: number;
  forceDuplicate: boolean;
}

export interface HydrusConnectionStatus {
  ok: boolean;
  message: string;
  hydrusVersion: number | null;
  apiVersion: number | null;
  permissions: string;
  debug: string[];
}

export interface HydrusImportProgress {
  phase:
    | "idle"
    | "testing"
    | "searching"
    | "metadata"
    | "importing"
    | "completed"
    | "failed"
    | "canceled";
  total: number;
  processed: number;
  imported: number;
  duplicated: number;
  skipped: number;
  failed: number;
  currentFile: string | null;
  message: string;
  messageKey?: string;
  messageValues?: Record<string, string | number>;
}

export interface AiSettings {
  modelPath: string;
  modelName: string;
  generalThreshold: number;
  characterThreshold: number;
  autoTagUntaggedImagesOnImport: boolean;
  enableImageRetagContextMenu: boolean;
  enableImageAppendTagContextMenu: boolean;
}

export interface AiModelInfo {
  modelName: string;
  modelPath: string;
  modelFilePath: string | null;
  sizeBytes: number;
  exists: boolean;
}

export interface AiModelCatalog {
  modelPath: string;
  models: AiModelInfo[];
  selectedModelName: string | null;
  selectedModel: AiModelInfo | null;
}

export interface AiTaggingFailure {
  fileId: number;
  message: string;
}

export interface AiTaggingSummary {
  total: number;
  tagged: number;
  skipped: number;
  failed: number;
  failures: AiTaggingFailure[];
}

export type ExportPhase =
  | "idle"
  | "exporting"
  | "completed"
  | "canceled"
  | "failed";

export interface ExportOptions {
  jobId: string;
  fileIds: number[];
  directory: string;
  filenameFormat: string;
  exportTagText: boolean;
  tagTextDirectory: string;
  tagTextFilenameFormat: string;
}

export interface ExportProgress {
  jobId: string;
  phase: ExportPhase;
  total: number;
  processed: number;
  exported: number;
  failed: number;
  currentFile: string | null;
  message: string;
  messageKey?: string;
  messageValues?: Record<string, string | number>;
}

export interface ApiPermissionRecord {
  id: string;
  name: string;
  description: string;
}

export interface ApiServiceRecord {
  id: number;
  name: string;
  address: string;
  port: number;
  token: string;
  enabled: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiServiceDraft {
  name: string;
  address: string;
  port: number;
  token: string;
  enabled: boolean;
  permissions: string[];
}

export interface ApiServiceAvailability {
  serviceId: number;
  available: boolean;
  reason: string;
  enabled: boolean;
  address: string;
  port: number;
  permissionCount: number;
}

export type ApiFileUrlRecord = Pick<
  FileUrlRecord,
  "url" | "normalizedUrl" | "source" | "createdAt" | "updatedAt"
>;
export type ApiFileTagRecord = Pick<
  FileTagRecord,
  "styleName" | "namespace" | "name" | "displayName" | "createdAt"
>;
export type ApiFileRatingRecord = Pick<
  FileRatingRecord,
  "groupName" | "label" | "color"
>;

export interface ApiFileRecord {
  apiIdentifier: string;
  sha256: string;
  extension: string | null;
  sizeBytes: number;
  importedAt: string;
  updatedAt: string;
  deletedAt: string | null;
  domain: FileDomain;
  domainName: string;
  isFavorite: boolean;
  urls: ApiFileUrlRecord[];
  tags: ApiFileTagRecord[];
  ratings: ApiFileRatingRecord[];
}

export interface AsteriaApi {
  getVersion: () => Promise<string>;
  getDatabaseStatus: () => Promise<DatabaseStatus>;
  listDatabaseFiles: (page: number) => Promise<DatabaseFilePage>;
  listBrowserFilePage: (
    request: BrowserFilePageRequest,
  ) => Promise<BrowserFilePage>;
  listBrowserFileIds: () => Promise<number[]>;
  listBrowserFiles: () => Promise<BrowserFileRecord[]>;
  listBrowserFilesByIds: (fileIds: number[]) => Promise<BrowserFileRecord[]>;
  searchBrowserFilePage: (
    request: BrowserSearchPageRequest,
  ) => Promise<BrowserFilePage>;
  listFavoriteFilePage: (
    request: BrowserFilePageRequest,
  ) => Promise<BrowserFilePage>;
  listFavoriteFiles: () => Promise<BrowserFileRecord[]>;
  setFileFavorite: (fileId: number, favorite: boolean) => Promise<void>;
  openDatabaseManagerWindow: () => Promise<void>;
  openTagManagerWindow: () => Promise<void>;
  openRecycleBinWindow: () => Promise<void>;
  openUrlManagerWindow: (fileIds: number[]) => Promise<void>;
  openBatchTagManagerWindow: (fileIds: number[]) => Promise<void>;
  openBatchOperationWindow: (fileIds: number[]) => Promise<void>;
  openExportWindow: (fileIds: number[]) => Promise<void>;
  openScreeningWindow: (fileIds: number[]) => Promise<void>;
  openFileDetailWindow: (id: number, sequenceIds?: number[]) => Promise<void>;
  openSettingsWindow: () => Promise<void>;
  openRatingManagerWindow: () => Promise<void>;
  openApiManagerWindow: () => Promise<void>;
  openHydrusImportWindow: () => Promise<void>;
  openAiManagerWindow: () => Promise<void>;
  openTagTranslationWindow: () => Promise<void>;
  openTagRelationTreeWindow: (
    tagIds: number[],
    kind?: TagRelationTreeKind,
  ) => Promise<void>;
  openFileRatingEditorWindow: (
    fileIds: number[],
    groupId: number,
  ) => Promise<void>;
  openFavoritesWindow: () => Promise<void>;
  openFileExternally: (fileId: number) => Promise<void>;
  startFileDrag: (fileIds: number[]) => void;
  readClipboardText: () => Promise<string>;
  writeClipboardText: (text: string) => Promise<void>;
  setWindowTitle: (title: string) => Promise<void>;
  getFileDetail: (id: number) => Promise<FileDetailRecord | null>;
  getFileDetailSequence: () => Promise<number[]>;
  getStorageSettings: () => Promise<StorageSettings>;
  getNetworkSettings: () => Promise<NetworkSettings>;
  updateNetworkSettings: (
    settings: NetworkSettings,
  ) => Promise<NetworkSettings>;
  selectStorageDirectory: () => Promise<string | null>;
  updateFileStoragePath: (path: string) => Promise<StorageSettings>;
  updateThumbnailStoragePath: (path: string) => Promise<StorageSettings>;
  updateConvertImportedImagesToPng: (
    enabled: boolean,
  ) => Promise<StorageSettings>;
  preloadThumbnails: (fileIds: number[]) => Promise<void>;
  getWorkStatus: () => Promise<WorkStatus>;
  listPageLayoutConfigs: () => Promise<PageLayoutConfigRecord[]>;
  getPageLayoutSettings: () => Promise<PageLayoutSettings>;
  getPageLayoutTemplate: (kind: "default" | "newPage") => Promise<string>;
  savePageLayoutConfig: (
    name: string,
    layoutJson: string,
  ) => Promise<PageLayoutConfigRecord[]>;
  createPageLayoutConfig: () => Promise<PageLayoutConfigRecord[]>;
  renamePageLayoutConfig: (
    id: string,
    name: string,
  ) => Promise<PageLayoutConfigRecord[]>;
  deletePageLayoutConfig: (id: string) => Promise<PageLayoutConfigRecord[]>;
  openPageLayoutConfig: (id: string) => Promise<void>;
  setDefaultPageLayoutConfig: (
    id: string | null,
  ) => Promise<PageLayoutSettings>;
  setNewPageLayoutConfig: (id: string | null) => Promise<PageLayoutSettings>;
  listTrashedFiles: (page: number) => Promise<DatabaseFilePage>;
  trashFiles: (fileIds: number[]) => Promise<void>;
  restoreFiles: (fileIds: number[]) => Promise<void>;
  restoreAllTrashedFiles: () => Promise<number>;
  deleteFilesPermanently: (fileIds: number[]) => Promise<void>;
  deleteAllTrashedFilesPermanently: () => Promise<number>;
  setFilesDomain: (fileIds: number[], domain: FileDomain) => Promise<void>;
  listDomains: () => Promise<DomainRecord[]>;
  listFileUrls: (fileIds: number[]) => Promise<FileUrlRecord[]>;
  addFileUrl: (fileIds: number[], url: string) => Promise<FileUrlRecord[]>;
  updateFileUrl: (
    fileIds: number[],
    urlId: number,
    previousUrl: string,
    nextUrl: string,
  ) => Promise<FileUrlRecord[]>;
  removeFileUrl: (
    fileIds: number[],
    urlId: number,
    url: string,
  ) => Promise<FileUrlRecord[]>;
  listRatingGroups: () => Promise<RatingGroupRecord[]>;
  createRatingGroup: (name: string) => Promise<RatingGroupRecord[]>;
  renameRatingGroup: (
    groupId: number,
    name: string,
  ) => Promise<RatingGroupRecord[]>;
  setRatingGroupActive: (
    groupId: number,
    active: boolean,
  ) => Promise<RatingGroupRecord[]>;
  deleteRatingGroup: (groupId: number) => Promise<RatingGroupRecord[]>;
  listRatingEntries: (groupId: number) => Promise<RatingEntryRecord[]>;
  createRatingEntry: (
    groupId: number,
    label: string,
    color: string,
  ) => Promise<RatingEntryRecord[]>;
  updateRatingEntry: (
    entryId: number,
    label: string,
    color: string,
  ) => Promise<RatingEntryRecord[]>;
  deleteRatingEntry: (entryId: number) => Promise<RatingEntryRecord[]>;
  reorderRatingEntries: (
    groupId: number,
    entryIds: number[],
  ) => Promise<RatingEntryRecord[]>;
  setFileRatingEntries: (
    fileIds: number[],
    groupId: number,
    entryIds: number[],
  ) => Promise<void>;
  listFileTags: (fileId: number) => Promise<FileTagRecord[]>;
  listFileParentTags: (fileId: number) => Promise<FileTagRecord[]>;
  listBatchFileTags: (fileIds: number[]) => Promise<BatchFileTagRecord[]>;
  listBatchEffectiveFileTags: (
    fileIds: number[],
  ) => Promise<BatchFileTagRecord[]>;
  searchTags: (query: string) => Promise<TagRecord[]>;
  searchHints: (query: string) => Promise<SearchHintRecord[]>;
  listTagStyles: () => Promise<TagStyleRecord[]>;
  createTagStyle: (name: string) => Promise<TagStyleRecord[]>;
  renameTagStyle: (styleId: number, name: string) => Promise<TagStyleRecord[]>;
  setActiveTagStyle: (styleId: number) => Promise<TagStyleRecord[]>;
  deleteTagStyle: (styleId: number) => Promise<DeleteTagStyleResult>;
  listManagedTags: (
    styleId: number,
    sortKey: ManagedTagSortKey,
    direction: SortDirection,
  ) => Promise<ManagedTagRecord[]>;
  listTagParents: () => Promise<TagParentRecord[]>;
  listTagSiblings: () => Promise<TagSiblingRecord[]>;
  getTagRelationTree: (
    tagIds: number[],
    kind?: TagRelationTreeKind,
  ) => Promise<TagRelationTree>;
  addTagParent: (
    childTagId: number,
    parentTagId: number,
  ) => Promise<TagParentRecord>;
  addTagParents: (pairs: TagParentPair[]) => Promise<BatchMutationResult>;
  removeTagParent: (childTagId: number, parentTagId: number) => Promise<void>;
  removeTagParents: (pairs: TagParentPair[]) => Promise<BatchMutationResult>;
  addTagSibling: (
    aliasTagId: number,
    canonicalTagId: number,
  ) => Promise<TagSiblingRecord>;
  addTagSiblings: (pairs: TagSiblingPair[]) => Promise<BatchMutationResult>;
  removeTagSibling: (aliasTagId: number) => Promise<void>;
  removeTagSiblings: (aliasTagIds: number[]) => Promise<BatchMutationResult>;
  createManagedTag: (
    styleId: number,
    tag: TagDraft,
  ) => Promise<ManagedTagRecord>;
  createManagedTags: (
    styleId: number,
    tags: TagDraft[],
  ) => Promise<CreateManagedTagsResult>;
  renameManagedTag: (tagId: number, tag: TagDraft) => Promise<ManagedTagRecord>;
  previewManagedTagRename: (
    tagId: number,
    tag: TagDraft,
  ) => Promise<ManagedTagRenamePreview>;
  deleteManagedTag: (tagId: number) => Promise<DeleteManagedTagsResult>;
  deleteManagedTags: (tagIds: number[]) => Promise<DeleteManagedTagsResult>;
  addFileTags: (fileId: number, tags: TagDraft[]) => Promise<FileTagRecord[]>;
  removeFileTags: (
    fileId: number,
    tagIds: number[],
  ) => Promise<FileTagRecord[]>;
  addTagsToFiles: (
    fileIds: number[],
    tags: TagDraft[],
  ) => Promise<BatchFileTagRecord[]>;
  removeTagsFromFiles: (
    fileIds: number[],
    tagIds: number[],
  ) => Promise<BatchFileTagRecord[]>;
  importFiles: (queueKey?: string) => Promise<ImportProgress>;
  importFolder: (queueKey?: string) => Promise<ImportProgress>;
  importPaths: (paths: string[], queueKey?: string) => Promise<ImportProgress>;
  importUrls: (urls: string[], queueKey?: string) => Promise<ImportProgress>;
  listImportQueueFiles: (queueKey?: string) => Promise<ImportQueueFileRecord[]>;
  commitImportQueue: (
    queueIds: number[],
    confirmedDuplicateQueueIds: number[],
    queueKey?: string,
  ) => Promise<ImportCommitResult>;
  removeImportQueueFiles: (
    queueIds: number[],
    queueKey?: string,
  ) => Promise<ImportProgress>;
  clearImportQueue: (queueKey?: string) => Promise<ImportProgress>;
  testHydrusConnection: (
    options: HydrusImportOptions,
  ) => Promise<HydrusConnectionStatus>;
  importFromHydrus: (
    options: HydrusImportOptions,
  ) => Promise<HydrusImportProgress>;
  cancelHydrusImport: () => Promise<void>;
  getHydrusImportSettings: () => Promise<HydrusImportOptions>;
  updateHydrusImportSettings: (
    settings: HydrusImportOptions,
  ) => Promise<HydrusImportOptions>;
  getTagTranslationSettings: () => Promise<TagTranslationSettings>;
  updateTagTranslationSettings: (
    settings: TagTranslationSettings,
  ) => Promise<TagTranslationSettings>;
  selectTagTranslationCsv: () => Promise<string | null>;
  translateFileTags: (fileIds: number[]) => Promise<TagTranslationSummary>;
  getAiSettings: () => Promise<AiSettings>;
  updateAiSettings: (settings: AiSettings) => Promise<AiSettings>;
  selectAiModelDirectory: () => Promise<string | null>;
  detectAiModel: (modelPath: string) => Promise<AiModelInfo>;
  detectAiModels: (
    modelPath: string,
    selectedModelName?: string,
  ) => Promise<AiModelCatalog>;
  downloadDefaultAiModel: (modelPath: string) => Promise<AiModelInfo>;
  tagFilesWithAi: (
    fileIds: number[],
    overwrite: boolean,
  ) => Promise<AiTaggingSummary>;
  selectExportDirectory: () => Promise<string | null>;
  exportFiles: (options: ExportOptions) => Promise<ExportProgress>;
  cancelExport: (jobId: string) => Promise<void>;
  listApiPermissions: () => Promise<ApiPermissionRecord[]>;
  listApiServices: () => Promise<ApiServiceRecord[]>;
  createApiService: (name: string) => Promise<ApiServiceRecord[]>;
  updateApiService: (
    serviceId: number,
    draft: ApiServiceDraft,
  ) => Promise<ApiServiceRecord[]>;
  deleteApiService: (serviceId: number) => Promise<ApiServiceRecord[]>;
  getApiServiceAvailability: (
    serviceId: number,
  ) => Promise<ApiServiceAvailability>;
  confirmDialog: (options: ConfirmDialogOptions) => Promise<boolean>;
  alertDialog: (options: ConfirmDialogOptions) => Promise<void>;
  getDialogState: (dialogId: string) => Promise<GenericDialogState | null>;
  resizeDialog: (
    dialogId: string,
    width: number,
    height: number,
  ) => Promise<void>;
  resolveDialog: (dialogId: string, confirmed: boolean) => Promise<void>;
  getPathForFile: (file: unknown) => string;
  setNativeTheme: (theme: "light" | "dark") => Promise<void>;
  onImportProgress: (
    listener: (progress: ImportProgress) => void,
  ) => () => void;
  onExportProgress: (
    listener: (progress: ExportProgress) => void,
  ) => () => void;
  onImportQueueChanged: (listener: () => void) => () => void;
  onHydrusImportProgress: (
    listener: (progress: HydrusImportProgress) => void,
  ) => () => void;
  onDialogStateChanged: (
    listener: (state: GenericDialogState) => void,
  ) => () => void;
  onFileDetailReset: (listener: (fileId: number) => void) => () => void;
  onFilesChanged: (
    listener: (payload: FilesChangedPayload) => void,
  ) => () => void;
  onFileFavoriteChanged: (
    listener: (fileId: number, favorite: boolean) => void,
  ) => () => void;
  onPageLayoutChanged: (listener: () => void) => () => void;
  onSettingsChanged: (
    listener: (payload: SettingsChangedPayload) => void,
  ) => () => void;
  onWorkStatusChanged: (listener: (status: WorkStatus) => void) => () => void;
}
