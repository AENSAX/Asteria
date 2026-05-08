# 数据模型

## 当前版本

数据库 schema 当前版本为 `9`。

数据库文件位于 Electron `userData/data/library.sqlite`。

## 导出

- 导出功能不新增数据库表。
- 导出读取 `files`、`file_tags`、`tags`、`file_ratings`、`rating_groups`、`rating_entries` 生成文件名变量。
- `{tag}` 变量由文件持有的全部 tag 生成，多个 tag 使用空格连接。
- 导出只复制物理文件，不改变文件对象、tag、URL、分级、收藏或域。

## API 服务

### api_services

保存 API 服务配置。

核心字段：

- `id`
- `name`
- `address`
- `port`
- `token`
- `enabled`
- `created_at`
- `updated_at`

### api_service_permissions

保存 API 服务勾选的权限。

核心字段：

- `service_id`
- `permission_id`
- `created_at`

说明：

- 一个 API 服务可以勾选多个权限。
- 多个 API 服务可以同时启用。
- 已启用 API 服务如果使用相同地址和端口，可用性检查会判定为冲突。
- API 服务由 Electron 主进程按配置启动，不使用外部无窗口服务端。
- `status.read` 权限对应 `GET /api/status`。
- `files.read` 权限对应 `GET /api/files` 和 `GET /api/files/:identifier`。
- `files.upload` 权限对应 `POST /api/upload/file` 和 `POST /api/upload/batch/*`。
- `GET /api/status` 使用 `Authorization: Bearer <token>` 校验。
- API 中的文件指 `files` 表数据库对象，不指物理文件。
- 多个数据库对象共享同一个物理文件时，`GET /api/files` 会返回多个 API 唯一标识。
- 外部 API 使用 `files.api_identifier` 作为文件对象唯一标识，不暴露内部自增 `id`。
- `files.api_identifier` 是随机 UUID，用于降低猜测和伪造标识的风险。
- API 上传文件成功后写入 `files`，且 `domain = pending`。
- API 上传重复文件且启用强制重复时，只创建新的数据库对象并复用已有物理文件。
- API 批量上传分片暂存于 Electron `userData/runtime/api-upload-batches`，提交后清理。

## 文件

### files

保存导入后的本地文件记录。

核心字段：

- `id`
- `api_identifier`
- `sha256`
- `original_path`
- `storage_path`
- `file_name`
- `extension`
- `mime_type`
- `size_bytes`
- `width`
- `height`
- `duration_ms`
- `domain`
- `is_favorite`
- `imported_at`
- `updated_at`
- `deleted_at`

约束：

- `sha256` 不唯一。
- `api_identifier` 唯一。
- 多个数据库对象可以共享同一个 `sha256`、`storage_path` 和物理文件。

说明：

- `original_path` 保存文件导入时的来源路径。
- `api_identifier` 是外部 API 使用的随机文件对象标识。
- `storage_path` 保存复制到库内后的实际读取路径。
- 媒体预览优先读取 `storage_path`。
- `imported_at` 用于浏览 view 的导入日期排序。
- `updated_at` 用于浏览 view 的修改日期排序。
- 库内文件名使用 `sha256` 值加原扩展名。
- 重复导入不会创建新的物理文件，只创建新的数据库对象记录。
- 文件标签、URL、分级、喜欢、回收站等信息作用于数据库对象。
- 从网页拖入导入的文件对象会把网页媒体链接写入 `file_urls`。
- 彻底删除数据库对象时，只有没有其他对象引用同一物理文件，才删除物理文件。
- `deleted_at` 为空表示正常库内文件。
- `deleted_at` 非空表示文件已进入回收站。
- `domain` 表示正常文件所属域，当前为 `pending` 或 `library`。
- `domain = pending` 表示待入库。
- `domain = library` 表示已在库中。
- 回收站作为域由 `deleted_at` 非空表达，查询层显示为 `trash` / `回收站`。
- 浏览 view 和查看数据库默认只显示 `deleted_at` 为空的文件。
- 回收站只显示 `deleted_at` 非空的文件。
- 域作为隐式 tag 参与搜索，但不写入 `file_tags`。
- 域显示在标签 view 最前面，不显示在文件详情左侧 tag 列表中。
- `is_favorite = 1` 表示文件已喜欢。
- 收藏作为文件自身状态参与搜索，但不写入 `file_tags`。
- 文件进入回收站时自动将 `is_favorite` 置为 `0`。
- 彻底删除时删除 `files` 记录，并通过外键级联删除 `file_tags`、`file_urls` 关联。
- 彻底删除会尝试删除 `storage_path` 指向的库内存储文件。

## 设置

### app_settings

保存应用级配置。

当前配置：

- `file_storage_path`：文件存储位置。
- `thumbnail_storage_path`：缩略图缓存位置。
- `page_layout_default_config_id`：默认页面配置 ID。
- `page_layout_new_page_config_id`：新页面配置 ID。
- `network_settings`：网络配置 JSON，保存代理启用状态、代理地址和代理端口。
- `ai_settings`：人工智能打标配置 JSON，保存模型路径、检测到的模型名称、普通阈值、角色阈值和人工智能功能开关。
- `hydrus_import_settings`：Hydrus 导入配置 JSON，保存 API 地址、Access Key、搜索标签、标签风格、数量限制、元数据分片和重复导入策略。
- `tag_translation_settings`：标签翻译配置 JSON，保存 CSV 路径、是否保留原标签、右键翻译菜单开关和创建标签时自动尝试翻译开关。

说明：

- 导入文件时会先复制到 `file_storage_path`。
- 修改 `file_storage_path` 时会迁移已有库内文件，并更新 `files.storage_path`。
- 浏览 view 的图片、动图、视频预览优先读取 `thumbnail_storage_path` 中的缓存缩略图。
- 动图和视频缩略图保存为静态首帧图片。
- 文件详情窗口读取原始媒体文件，不读取缩略图缓存。
- 缩略图缓存不属于业务数据，可以按需重新生成。
- 缩略图缓存由主进程后台队列生成。
- 启动后会低优先级补全缺失缓存，浏览 view 当前视野附近会高优先级预热。
- 物理文件被彻底删除时，对应 `sha256` 的缩略图缓存也会删除。
- 文件详情窗口仍读取原始媒体文件，不读取缩略图。
- 页面配置文件保存在 Electron `userData/page-layouts` 目录。
- 页面配置文件不写入 SQLite，只在 `app_settings` 中保存默认配置和新页面配置的 ID。
- 主窗口编辑器状态保存在 renderer 本地状态中，不用于恢复独立窗口。

## URL

### file_urls

保存文件关联的 URL。

核心字段：

- `id`
- `file_id`
- `url`
- `normalized_url`
- `source`
- `created_at`
- `updated_at`

约束：

- `file_id` 关联 `files.id`。
- 同一个文件下 `url` 唯一。

说明：

- 文件可以没有 URL。
- 文件可以有多个 URL。
- 单文件 URL 管理读取该文件的全部 URL。
- 批量 URL 管理按 URL 文本求交集，只显示所有选中文件共同拥有的 URL。
- 批量新增 URL 会为所有选中文件写入同一个 URL。
- 批量删除 URL 会从所有选中文件中删除同一个 URL。
- 批量修改 URL 会把共同 URL 统一替换为新 URL。

## 分级

分级用于给文件标记用户自定义等级。一个分级包含多个可选条目，条目可以配置文字和颜色。

### rating_groups

保存分级定义。

核心字段：

- `id`
- `name`
- `is_active`
- `created_at`
- `updated_at`

说明：

- `name` 是分级名。
- `is_active = 1` 表示该分级在浏览 view 中启用。
- 可以同时启用多个分级。

### rating_entries

保存分级条目。

核心字段：

- `id`
- `group_id`
- `label`
- `color`
- `sort_order`
- `created_at`
- `updated_at`

说明：

- `group_id` 关联 `rating_groups.id`。
- `label` 是显示文字。
- `color` 是条目显示颜色。

### file_ratings

保存文件和分级条目的关联。

核心字段：

- `file_id`
- `entry_id`
- `created_at`

说明：

- `file_id` 关联 `files.id`。
- `entry_id` 关联 `rating_entries.id`。
- 删除文件、分级或分级条目时关联自动删除。
- 浏览 view 只显示已激活分级下的文件分级。
- 搜索可按 `label` 或 `分级名:label` 匹配分级条目。

## 标签

标签系统按“风格”组织。一个风格包含多个 namespace 和 tag。

搜索 view 基于文件和 tag 的关联进行过滤。搜索表达式中的 tag 文本按 `tags.name` 或 `tags.namespace + ':' + tags.name` 精确匹配。

默认风格为：

```text
default tag style
```

### tag_styles

保存标签风格，例如默认风格、danbooru 风格。

核心字段：

- `id`
- `name`
- `display_name`
- `description`
- `is_default`
- `created_at`
- `updated_at`

约束：

- `name` 唯一。
- 只能有一个 `is_default = 1` 的默认风格。

说明：

- 标签管理窗口可以新建标签风格。
- 标签管理窗口可以重命名标签风格。
- 标签管理窗口可以删除标签风格。
- 标签管理窗口可以启用一个标签风格。
- 启用的标签风格通过 `is_default = 1` 表示。
- 给文件新增 tag 时会写入当前启用的标签风格。
- 删除标签风格会级联删除该风格下的 namespace、tag 和文件标签关联。
- 删除当前启用风格后会自动启用剩余风格；没有剩余风格时会重新创建默认风格。

### tag_namespaces

保存某个风格下的 namespace。

核心字段：

- `id`
- `style_id`
- `name`
- `display_name`
- `description`
- `sort_order`
- `created_at`
- `updated_at`

约束：

- `style_id` 关联 `tag_styles.id`。
- 同一个风格下 `name` 唯一。
- 空字符串 namespace 表示无命名空间。

### tags

保存具体 tag。

核心字段：

- `id`
- `style_id`
- `namespace_id`
- `namespace`
- `name`
- `display_name`
- `note`
- `created_at`
- `updated_at`

约束：

- `style_id` 关联 `tag_styles.id`。
- `namespace_id` 关联 `tag_namespaces.id`。
- 同一个风格下 `namespace + name` 唯一。

说明：

- `namespace` 字段保留 Hydrus 风格的文本表达。
- `namespace_id` 用于连接 namespace 表。
- 两者同时存在，方便查询和后续导入外部标签风格。
- 删除 tag 时先删除 `file_tags` 关联，再删除 `tags` 记录。
- 标签管理窗口支持多选、片选和框选后批量删除 tag。
- 标签管理窗口按 `file_tags` 统计每个 tag 的引用文件数量。

### file_tags

保存文件和 tag 的多对多关系。

核心字段：

- `file_id`
- `tag_id`
- `created_at`

约束：

- `file_id` 关联 `files.id`。
- `tag_id` 关联 `tags.id`。
- `file_id + tag_id` 作为主键。

说明：

- 从文件移除 tag 时只删除 `file_tags` 关联。
- `tags` 表中的 tag 本体不依赖文件存在。
- 即使没有任何文件持有某个 tag，该 tag 也可以继续存在。
- 批量标签管理按选中文件查询标签合集。
- 批量标签管理统计每个标签被多少个选中文件持有。
- 批量新增标签会将标签关联到所有选中文件。
- 批量删除标签会删除选中文件中持有该标签的关联。

## 导入

### import_batches

保存一次导入批次。

### import_items

保存导入批次中的每个文件处理结果。

说明：

- 本地导入队列保存本地来源路径。
- 网页拖入导入队列会先下载媒体到 Electron `userData/runtime/import-downloads` 临时目录。
- 网页拖入队列项保存 `sourceUrl`，真正导入后写入该文件对象的 URL 列表。
- 待导入队列被取消、删除或提交后，网页拖入产生的临时文件会被清理。

## Hydrus 导入

- Hydrus 导入不新增数据库表。
- Hydrus 文件下载到 Electron `userData/runtime/hydrus-import` 临时目录。
- 迁移时使用文件内容计算 `sha256`。
- 未重复文件复制到 `file_storage_path`，并创建 `files` 数据库对象。
- 重复文件默认跳过。
- 启用重复对象迁移时，创建新的 `files` 数据库对象并复用已有 `storage_path`。
- Hydrus 标签写入 `tag_styles`、`tag_namespaces`、`tags` 和 `file_tags`。
- Hydrus URL 写入 `file_urls`。
- Hydrus 导入创建的文件对象默认 `domain = pending`。

## 标签翻译

- 标签翻译不新增数据库表。
- 标签翻译配置保存在 `app_settings.tag_translation_settings`。
- 标签翻译 CSV 不写入数据库，只保存文件路径。
- CSV 第一列为原标签文本，第三列为翻译文本，例如 `1girl,0,1个女孩`。
- 标签翻译匹配 key 会把 `_` 和空格统一处理，并折叠连续分隔符，因此 `pink_hair` 与 `pink hair` 视为同一个原标签。
- 翻译后的标签以普通 tag 写入 `tags` 表，名称为 `原文本 翻译文本`。
- 翻译命中时，文件关联从原 tag 替换为翻译后 tag。
- 替换文件关联只删除当前文件对象的 `file_tags` 关联，不删除其它文件对象的关联。
- 保留原标签开启时，原 tag 本体继续留在 `tags` 表中。
- 保留原标签关闭时，如果原 tag 本体已经没有任何 `file_tags` 引用，可以从 `tags` 表删除。
- 未匹配到 CSV 翻译的 tag 不做修改。

## 模块与布局

### modules

保存模块定义。

当前包含：

- `file-import`
- `library-grid`
- `file-detail`
- `tag-manager`

### pages

保存 page 记录。

### windows

保存 page 内窗口布局记录。

## 迁移

### schema_migrations

保存数据库迁移版本。

当前迁移：

- `1 initial_schema`
- `2 tag_styles_and_file_urls`
- `3 file_storage_settings`
- `4 file_domains`
- `5 ratings`
- `6 favorites`
- `7 duplicate_file_records`
- `8 api_services`
- `9 api_file_identifiers`
