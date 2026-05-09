# API 文档

本文记录 Asteria 提供给外部程序调用的 HTTP API。

当前 API 服务由 Electron 主进程内置启动。打开软件后，通过 `服务 -> API` 新建并启用 API 服务，配置地址、端口、校验 token，并勾选对应权限后保存。

## 通用规则

### 服务地址

API 基础地址由 API 管理窗口中的 `地址` 和 `端口` 决定。

示例：

```text
http://127.0.0.1:17321
```

### 鉴权

所有 API 都必须使用 Bearer token。

请求头：

```text
Authorization: Bearer <token>
```

其中 `<token>` 是 API 管理窗口中配置的 `校验 token`。

### 权限

每个 API 接口都对应一个权限。只有当前 API 服务勾选了对应权限，接口才可访问。

当前权限：

| 权限 ID        | 显示名称     | 对应接口                                                                     |
| -------------- | ------------ | ---------------------------------------------------------------------------- |
| `status.read`  | 读取状态     | `GET /api/status`                                                            |
| `files.read`   | 读取文件     | `GET /api/files`、`GET /api/files/:identifier`、`POST /api/files/duplicates` |
| `files.write`  | 写入文件信息 | `PUT /api/files/:identifier/metadata`                                        |
| `files.upload` | 上传文件     | `POST /api/upload/file`、`POST /api/upload/batch/*`                          |

### 通用错误响应

未提供有效 token：

```json
{
  "error": "unauthorized",
  "message": "需要有效的 Bearer token"
}
```

未启用接口权限：

```json
{
  "error": "forbidden",
  "message": "当前 API 服务未启用读取状态权限"
}
```

接口不存在：

```json
{
  "error": "not_found",
  "message": "接口不存在"
}
```

请求方法不支持：

```json
{
  "error": "method_not_allowed",
  "message": "仅支持 GET"
}
```

## 读取服务状态

读取当前 Asteria 服务状态、API 服务信息和数据库核心计数。

### 接口

```text
GET /api/status
```

### 权限

```text
status.read
```

API 管理窗口中必须勾选 `读取状态`。

### 请求参数

无 URL 查询参数。

请求头：

| 参数            | 必填 | 说明                                 |
| --------------- | ---- | ------------------------------------ |
| `Authorization` | 是   | Bearer token，例如 `Bearer my-token` |

### 命令行调用

PowerShell：

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:17321/api/status" `
  -Headers @{ Authorization = "Bearer my-token" }
```

curl：

```bash
curl -H "Authorization: Bearer my-token" \
  http://127.0.0.1:17321/api/status
```

### 代码中使用

JavaScript / TypeScript：

```ts
async function readAsteriaStatus(): Promise<unknown> {
  const response = await fetch("http://127.0.0.1:17321/api/status", {
    method: "GET",
    headers: {
      Authorization: "Bearer my-token",
    },
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status}`);
  }

  return response.json();
}
```

Node.js：

```js
const response = await fetch("http://127.0.0.1:17321/api/status", {
  headers: {
    Authorization: "Bearer my-token",
  },
});

const status = await response.json();
console.log(status);
```

Python：

```python
import requests

response = requests.get(
    "http://127.0.0.1:17321/api/status",
    headers={"Authorization": "Bearer my-token"},
    timeout=10,
)
response.raise_for_status()
print(response.json())
```

### 响应体示例

```json
{
  "ok": true,
  "app": {
    "name": "Asteria",
    "version": "0.1.0"
  },
  "service": {
    "id": 1,
    "name": "本地 API",
    "address": "127.0.0.1",
    "port": 17321,
    "permissions": ["status.read"]
  },
  "database": {
    "schemaVersion": 8,
    "fileCount": 120,
    "importBatchCount": 6,
    "tagCount": 340
  },
  "uptimeSeconds": 342,
  "currentTime": "2026-05-04T12:00:00.000Z"
}
```

### 响应字段

| 字段                        | 类型       | 说明                    |
| --------------------------- | ---------- | ----------------------- |
| `ok`                        | `boolean`  | 请求是否成功            |
| `app.name`                  | `string`   | 应用名称                |
| `app.version`               | `string`   | 应用版本                |
| `service.id`                | `number`   | API 服务 ID             |
| `service.name`              | `string`   | API 服务名称            |
| `service.address`           | `string`   | API 服务监听地址        |
| `service.port`              | `number`   | API 服务监听端口        |
| `service.permissions`       | `string[]` | 当前 API 服务已启用权限 |
| `database.schemaVersion`    | `number`   | 当前数据库 schema 版本  |
| `database.fileCount`        | `number`   | `files` 表文件对象数量  |
| `database.importBatchCount` | `number`   | 导入批次数量            |
| `database.tagCount`         | `number`   | tag 数量                |
| `uptimeSeconds`             | `number`   | 当前应用进程运行秒数    |
| `currentTime`               | `string`   | 服务端当前 ISO 时间     |

## 使用流程

1. 启动 Asteria。
2. 打开 `服务 -> API`。
3. 新建一个 API 服务。
4. 填写 `地址`，例如 `127.0.0.1`。
5. 填写 `端口`，例如 `17321`。
6. 填写 `校验 token`，例如 `my-token`。
7. 按需勾选权限，例如调用状态接口勾选 `读取状态`，调用文件接口勾选 `读取文件`，调用上传接口勾选 `上传文件`。
8. 勾选 `启用`。
9. 点击 `保存`。
10. 点击 `检查`，状态显示 `运行中` 后即可调用。

## 获取所有文件对象标识

获取数据库中所有文件对象的 API 唯一标识列表。

这里的“文件”指 `files` 表中的数据库对象，不是物理文件。多个数据库对象即使共享同一个物理文件，也会分别返回各自的 API 唯一标识。回收站中的文件对象也会返回。

API 唯一标识是随机生成的 `apiIdentifier`，不是内部自增 ID，外部调用方不应猜测或构造它。

### 接口

```text
GET /api/files
```

### 权限

```text
files.read
```

API 管理窗口中必须勾选 `读取文件`。

### 请求参数

无 URL 查询参数。

请求头：

| 参数            | 必填 | 说明                                 |
| --------------- | ---- | ------------------------------------ |
| `Authorization` | 是   | Bearer token，例如 `Bearer my-token` |

### 命令行调用

PowerShell：

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:17321/api/files" `
  -Headers @{ Authorization = "Bearer my-token" }
```

curl：

```bash
curl -H "Authorization: Bearer my-token" \
  http://127.0.0.1:17321/api/files
```

### 代码中使用

JavaScript / TypeScript：

```ts
interface FileIdentifierListResponse {
  ok: boolean;
  identifiers: string[];
  total: number;
}

async function listAsteriaFileIdentifiers(): Promise<string[]> {
  const response = await fetch("http://127.0.0.1:17321/api/files", {
    headers: {
      Authorization: "Bearer my-token",
    },
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status}`);
  }

  const body = (await response.json()) as FileIdentifierListResponse;
  return body.identifiers;
}
```

Python：

```python
import requests

response = requests.get(
    "http://127.0.0.1:17321/api/files",
    headers={"Authorization": "Bearer my-token"},
    timeout=10,
)
response.raise_for_status()
identifiers = response.json()["identifiers"]
print(identifiers)
```

### 响应体示例

```json
{
  "ok": true,
  "identifiers": [
    "d04d8371-cd25-4fb0-b4df-c2f789642aa2",
    "944f1f2f-32d2-41ac-91b5-70a716f832da",
    "c3d86e47-36d7-4111-a808-477af9004cad"
  ],
  "total": 3
}
```

### 响应字段

| 字段          | 类型       | 说明                            |
| ------------- | ---------- | ------------------------------- |
| `ok`          | `boolean`  | 请求是否成功                    |
| `identifiers` | `string[]` | 文件数据库对象 API 唯一标识列表 |
| `total`       | `number`   | 返回的标识数量                  |

## 获取单个文件对象详情

通过文件数据库对象 API 唯一标识获取该对象的详细信息，包括 URL、标签、SHA256 和分级。

### 接口

```text
GET /api/files/:identifier
```

示例：

```text
GET /api/files/d04d8371-cd25-4fb0-b4df-c2f789642aa2
```

### 权限

```text
files.read
```

API 管理窗口中必须勾选 `读取文件`。

### 请求参数

路径参数：

| 参数         | 必填 | 说明                                                                         |
| ------------ | ---- | ---------------------------------------------------------------------------- |
| `identifier` | 是   | 文件数据库对象 API 唯一标识，即 `GET /api/files` 返回的 `identifiers` 中的值 |

请求头：

| 参数            | 必填 | 说明                                 |
| --------------- | ---- | ------------------------------------ |
| `Authorization` | 是   | Bearer token，例如 `Bearer my-token` |

### 命令行调用

PowerShell：

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:17321/api/files/d04d8371-cd25-4fb0-b4df-c2f789642aa2" `
  -Headers @{ Authorization = "Bearer my-token" }
```

curl：

```bash
curl -H "Authorization: Bearer my-token" \
  http://127.0.0.1:17321/api/files/d04d8371-cd25-4fb0-b4df-c2f789642aa2
```

### 代码中使用

JavaScript / TypeScript：

```ts
async function getAsteriaFile(identifier: string): Promise<unknown> {
  const response = await fetch(
    `http://127.0.0.1:17321/api/files/${encodeURIComponent(identifier)}`,
    {
      headers: {
        Authorization: "Bearer my-token",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status}`);
  }

  return response.json();
}
```

Python：

```python
import requests

identifier = "d04d8371-cd25-4fb0-b4df-c2f789642aa2"
response = requests.get(
    f"http://127.0.0.1:17321/api/files/{identifier}",
    headers={"Authorization": "Bearer my-token"},
    timeout=10,
)
response.raise_for_status()
print(response.json())
```

### 响应体示例

```json
{
  "ok": true,
  "file": {
    "apiIdentifier": "d04d8371-cd25-4fb0-b4df-c2f789642aa2",
    "sha256": "d2a8f4c1c1e9b7c0d1a3f6a6d1234567890abcdef1234567890abcdef1234567",
    "extension": "jpg",
    "sizeBytes": 345678,
    "importedAt": "2026-05-04 18:20:00",
    "updatedAt": "2026-05-04 18:30:00",
    "deletedAt": null,
    "domain": "library",
    "domainName": "已在库中",
    "isFavorite": true,
    "urls": [
      {
        "url": "https://example.com/post/100",
        "normalizedUrl": "https://example.com/post/100",
        "source": null,
        "createdAt": "2026-05-04 18:21:00",
        "updatedAt": "2026-05-04 18:21:00"
      }
    ],
    "tags": [
      {
        "styleName": "default tag style",
        "namespace": "作品",
        "name": "原神",
        "displayName": null,
        "createdAt": "2026-05-04 18:22:00"
      }
    ],
    "ratings": [
      {
        "groupName": "年龄等级",
        "label": "18禁",
        "color": "#ff4f78"
      }
    ]
  }
}
```

### 响应字段

| 字段                 | 类型                                | 说明                                 |
| -------------------- | ----------------------------------- | ------------------------------------ |
| `ok`                 | `boolean`                           | 请求是否成功                         |
| `file.apiIdentifier` | `string`                            | 文件数据库对象 API 唯一标识          |
| `file.sha256`        | `string`                            | 物理文件 SHA256                      |
| `file.extension`     | `string \| null`                    | 文件扩展名                           |
| `file.sizeBytes`     | `number`                            | 文件大小，单位字节                   |
| `file.importedAt`    | `string`                            | 导入时间                             |
| `file.updatedAt`     | `string`                            | 最后更新时间                         |
| `file.deletedAt`     | `string \| null`                    | 进入回收站时间；为空表示未进入回收站 |
| `file.domain`        | `"pending" \| "library" \| "trash"` | 文件对象所在域                       |
| `file.domainName`    | `string`                            | 文件对象所在域显示名称               |
| `file.isFavorite`    | `boolean`                           | 是否喜欢                             |
| `file.urls`          | `FileUrl[]`                         | 文件对象关联 URL，不包含内部文件 ID  |
| `file.tags`          | `FileTag[]`                         | 文件对象关联标签，不包含内部 tag ID  |
| `file.ratings`       | `FileRating[]`                      | 文件对象关联分级，不包含内部分级 ID  |

文件不存在时：

```json
{
  "error": "not_found",
  "message": "文件对象不存在"
}
```

## 文件查重

接收一个文件对象，计算 SHA256，并返回数据库中所有 SHA256 相同的文件数据库对象 API 唯一标识。这里会检查所有域，包括 `待入库`、`已在库中` 和 `回收站`。

同一个物理文件可能对应多个数据库对象，因此返回值是标识列表。

### 接口

```text
POST /api/files/duplicates
```

### 权限

```text
files.read
```

API 管理窗口中必须勾选 `读取文件`。

### 请求参数

请求体类型：

```text
multipart/form-data
```

表单字段：

| 参数   | 必填 | 说明               |
| ------ | ---- | ------------------ |
| `file` | 是   | 用于查重的文件对象 |

请求头：

| 参数            | 必填 | 说明                                 |
| --------------- | ---- | ------------------------------------ |
| `Authorization` | 是   | Bearer token，例如 `Bearer my-token` |

### 命令行调用

PowerShell：

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:17321/api/files/duplicates" `
  -Method Post `
  -Headers @{ Authorization = "Bearer my-token" } `
  -Form @{
    file = Get-Item "E:\Images\a.jpg"
  }
```

curl：

```bash
curl -X POST \
  -H "Authorization: Bearer my-token" \
  -F "file=@/path/to/a.jpg" \
  http://127.0.0.1:17321/api/files/duplicates
```

### 代码中使用

JavaScript / TypeScript：

```ts
async function findDuplicateFiles(file: File): Promise<string[]> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch("http://127.0.0.1:17321/api/files/duplicates", {
    method: "POST",
    headers: {
      Authorization: "Bearer my-token",
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status}`);
  }

  const body = (await response.json()) as { identifiers: string[] };
  return body.identifiers;
}
```

### 响应体示例

```json
{
  "ok": true,
  "sha256": "d2a8f4c1c1e9b7c0d1a3f6a6d1234567890abcdef1234567890abcdef1234567",
  "duplicate": true,
  "identifiers": [
    "d04d8371-cd25-4fb0-b4df-c2f789642aa2",
    "944f1f2f-32d2-41ac-91b5-70a716f832da"
  ],
  "total": 2
}
```

没有重复时：

```json
{
  "ok": true,
  "sha256": "d2a8f4c1c1e9b7c0d1a3f6a6d1234567890abcdef1234567890abcdef1234567",
  "duplicate": false,
  "identifiers": [],
  "total": 0
}
```

### 响应字段

| 字段          | 类型       | 说明                                      |
| ------------- | ---------- | ----------------------------------------- |
| `ok`          | `boolean`  | 请求是否成功                              |
| `sha256`      | `string`   | 上传文件计算得到的 SHA256                 |
| `duplicate`   | `boolean`  | 是否存在同 SHA256 文件对象                |
| `identifiers` | `string[]` | 同 SHA256 文件数据库对象 API 唯一标识列表 |
| `total`       | `number`   | 返回的标识数量                            |

## 覆盖更新文件信息

通过文件数据库对象 API 唯一标识覆盖更新该文件对象的标签和 URL。更新目标是单个数据库对象，不是物理文件；多个数据库对象即使共享同一个物理文件，也不会互相影响。

提供 `tags` 时会覆盖该文件对象的全部标签；提供 `urls` 或 `url` 时会覆盖该文件对象的全部 URL。传空数组表示清空对应信息。未提供的字段保持不变。

### 接口

```text
PUT /api/files/:identifier/metadata
```

示例：

```text
PUT /api/files/d04d8371-cd25-4fb0-b4df-c2f789642aa2/metadata
```

### 权限

```text
files.write
```

API 管理窗口中必须勾选 `写入文件信息`。

### 请求参数

请求体类型：

```text
application/json
```

路径参数：

| 参数         | 必填 | 说明                        |
| ------------ | ---- | --------------------------- |
| `identifier` | 是   | 文件数据库对象 API 唯一标识 |

JSON 字段：

| 参数       | 必填 | 说明                                                                                             |
| ---------- | ---- | ------------------------------------------------------------------------------------------------ |
| `tags`     | 否   | 标签数组。元素可以是 `"namespace:name"` 字符串，也可以是 `{ "namespace": "...", "name": "..." }` |
| `tagStyle` | 否   | 标签风格名称；不存在时会自动创建；不传时使用当前启用的默认标签风格                               |
| `urls`     | 否   | URL 字符串数组                                                                                   |
| `url`      | 否   | 单个 URL 字符串，作为 `urls` 的便捷写法                                                          |

请求头：

| 参数            | 必填 | 说明                                 |
| --------------- | ---- | ------------------------------------ |
| `Authorization` | 是   | Bearer token，例如 `Bearer my-token` |
| `Content-Type`  | 是   | `application/json`                   |

### 命令行调用

PowerShell：

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:17321/api/files/d04d8371-cd25-4fb0-b4df-c2f789642aa2/metadata" `
  -Method Put `
  -Headers @{
    Authorization = "Bearer my-token"
    "Content-Type" = "application/json"
  } `
  -Body '{
    "tagStyle": "danbooru",
    "tags": ["character:kirara_(genshin_impact)", "rating:safe"],
    "urls": ["https://danbooru.donmai.us/posts/123456"]
  }'
```

curl：

```bash
curl -X PUT \
  -H "Authorization: Bearer my-token" \
  -H "Content-Type: application/json" \
  -d '{"tagStyle":"danbooru","tags":["character:kirara_(genshin_impact)"],"urls":["https://danbooru.donmai.us/posts/123456"]}' \
  http://127.0.0.1:17321/api/files/d04d8371-cd25-4fb0-b4df-c2f789642aa2/metadata
```

### 代码中使用

JavaScript / TypeScript：

```ts
async function replaceFileMetadata(identifier: string): Promise<unknown> {
  const response = await fetch(
    `http://127.0.0.1:17321/api/files/${encodeURIComponent(identifier)}/metadata`,
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer my-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tagStyle: "danbooru",
        tags: [
          "character:kirara_(genshin_impact)",
          { namespace: "rating", name: "safe" },
        ],
        urls: ["https://danbooru.donmai.us/posts/123456"],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status}`);
  }

  return response.json();
}
```

### 响应体示例

```json
{
  "ok": true,
  "file": {
    "apiIdentifier": "d04d8371-cd25-4fb0-b4df-c2f789642aa2",
    "sha256": "d2a8f4c1c1e9b7c0d1a3f6a6d1234567890abcdef1234567890abcdef1234567",
    "extension": "jpg",
    "sizeBytes": 345678,
    "importedAt": "2026-05-04 18:20:00",
    "updatedAt": "2026-05-05 10:30:00",
    "deletedAt": null,
    "domain": "pending",
    "domainName": "待入库",
    "isFavorite": false,
    "urls": [
      {
        "url": "https://danbooru.donmai.us/posts/123456",
        "normalizedUrl": "https://danbooru.donmai.us/posts/123456",
        "source": null,
        "createdAt": "2026-05-05 10:30:00",
        "updatedAt": "2026-05-05 10:30:00"
      }
    ],
    "tags": [
      {
        "styleName": "danbooru",
        "namespace": "character",
        "name": "kirara_(genshin_impact)",
        "displayName": null,
        "createdAt": "2026-05-05 10:30:00"
      }
    ],
    "ratings": []
  }
}
```

文件不存在时：

```json
{
  "error": "not_found",
  "message": "文件对象不存在"
}
```

未提供 `tags` 或 `urls` 时：

```json
{
  "error": "bad_request",
  "message": "必须提供 tags 或 urls"
}
```

## 上传单个文件

上传一个文件对象，并可同时写入标签、标签风格和 URL。上传成功后的文件对象进入 `待入库` 域。

如果上传文件的 SHA256 已存在，默认拒绝创建重复数据库对象。设置 `forceDuplicate=true` 后，会创建新的数据库对象并共享已有物理文件。

### 接口

```text
POST /api/upload/file
```

### 权限

```text
files.upload
```

API 管理窗口中必须勾选 `上传文件`。

### 请求参数

请求体类型：

```text
multipart/form-data
```

表单字段：

| 参数             | 必填 | 说明                                                                                              |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------- |
| `file`           | 是   | 文件对象                                                                                          |
| `tags`           | 否   | JSON 数组。元素可以是 `"namespace:name"` 字符串，也可以是 `{ "namespace": "...", "name": "..." }` |
| `tagStyle`       | 否   | 标签风格名称；不存在时会自动创建；不传时使用当前启用的默认标签风格                                |
| `url`            | 否   | 单个 URL 字符串，或 JSON 字符串数组                                                               |
| `urls`           | 否   | URL JSON 字符串数组                                                                               |
| `forceDuplicate` | 否   | 是否强制创建重复数据库对象。可用值：`true`、`1`、`yes`                                            |

请求头：

| 参数            | 必填 | 说明                                 |
| --------------- | ---- | ------------------------------------ |
| `Authorization` | 是   | Bearer token，例如 `Bearer my-token` |

### 命令行调用

PowerShell：

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:17321/api/upload/file" `
  -Method Post `
  -Headers @{ Authorization = "Bearer my-token" } `
  -Form @{
    file = Get-Item "E:\Images\a.jpg"
    tags = '[{"namespace":"作品","name":"原神"},{"namespace":"","name":"1girl"}]'
    tagStyle = "default tag style"
    urls = '["https://example.com/post/100"]'
    forceDuplicate = "false"
  }
```

curl：

```bash
curl -X POST \
  -H "Authorization: Bearer my-token" \
  -F "file=@/path/to/a.jpg" \
  -F 'tags=[{"namespace":"作品","name":"原神"},{"namespace":"","name":"1girl"}]' \
  -F "tagStyle=default tag style" \
  -F 'urls=["https://example.com/post/100"]' \
  -F "forceDuplicate=false" \
  http://127.0.0.1:17321/api/upload/file
```

### 代码中使用

JavaScript / TypeScript：

```ts
async function uploadAsteriaFile(file: File): Promise<unknown> {
  const form = new FormData();
  form.append("file", file);
  form.append(
    "tags",
    JSON.stringify([
      { namespace: "作品", name: "原神" },
      { namespace: "", name: "1girl" },
    ]),
  );
  form.append("tagStyle", "default tag style");
  form.append("urls", JSON.stringify(["https://example.com/post/100"]));
  form.append("forceDuplicate", "false");

  const response = await fetch("http://127.0.0.1:17321/api/upload/file", {
    method: "POST",
    headers: {
      Authorization: "Bearer my-token",
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status}`);
  }

  return response.json();
}
```

Node.js：

```js
import { openAsBlob } from "node:fs";

const file = await openAsBlob("E:/Images/a.jpg");
const form = new FormData();
form.append("file", file, "a.jpg");
form.append("tags", JSON.stringify([{ namespace: "作品", name: "原神" }]));
form.append("urls", JSON.stringify(["https://example.com/post/100"]));

const response = await fetch("http://127.0.0.1:17321/api/upload/file", {
  method: "POST",
  headers: {
    Authorization: "Bearer my-token",
  },
  body: form,
});

console.log(await response.json());
```

Python：

```python
import json
import requests

with open(r"E:\Images\a.jpg", "rb") as file:
    response = requests.post(
        "http://127.0.0.1:17321/api/upload/file",
        headers={"Authorization": "Bearer my-token"},
        files={"file": ("a.jpg", file, "image/jpeg")},
        data={
            "tags": json.dumps([
                {"namespace": "作品", "name": "原神"},
                {"namespace": "", "name": "1girl"},
            ], ensure_ascii=False),
            "tagStyle": "default tag style",
            "urls": json.dumps(["https://example.com/post/100"]),
            "forceDuplicate": "false",
        },
        timeout=60,
    )
response.raise_for_status()
print(response.json())
```

### 响应体示例

```json
{
  "ok": true,
  "duplicate": false,
  "file": {
    "apiIdentifier": "74b3c7c5-5e8e-451a-b275-5c8614e43e4f",
    "sha256": "d2a8f4c1c1e9b7c0d1a3f6a6d1234567890abcdef1234567890abcdef1234567",
    "extension": "jpg",
    "sizeBytes": 345678,
    "importedAt": "2026-05-04 18:20:00",
    "updatedAt": "2026-05-04 18:20:00",
    "deletedAt": null,
    "domain": "pending",
    "domainName": "待入库",
    "isFavorite": false,
    "urls": [
      {
        "url": "https://example.com/post/100",
        "normalizedUrl": "https://example.com/post/100",
        "source": null,
        "createdAt": "2026-05-04 18:20:00",
        "updatedAt": "2026-05-04 18:20:00"
      }
    ],
    "tags": [
      {
        "styleName": "default tag style",
        "namespace": "作品",
        "name": "原神",
        "displayName": null,
        "createdAt": "2026-05-04 18:20:00"
      }
    ],
    "ratings": []
  }
}
```

重复且未强制上传时：

```json
{
  "ok": false,
  "duplicate": true,
  "error": "duplicate_file",
  "message": "文件已存在，未启用重复对象强制上传"
}
```

## 批量上传文件

批量上传使用分片协议。调用方先创建批次，再逐个上传每个文件的分片，最后提交批次。提交后，每个成功文件都会创建一个 `待入库` 文件数据库对象。

### 创建批次

```text
POST /api/upload/batch/init
```

权限：

```text
files.upload
```

请求体：

```json
{
  "files": [
    {
      "clientFileId": "local-a",
      "fileName": "a.jpg",
      "sizeBytes": 345678,
      "chunkCount": 3,
      "tags": [
        {
          "namespace": "作品",
          "name": "原神"
        }
      ],
      "tagStyle": "default tag style",
      "urls": ["https://example.com/post/100"],
      "forceDuplicate": false
    }
  ]
}
```

响应体：

```json
{
  "ok": true,
  "batchId": "cc1db0d8-ff02-4d64-a091-805a7959b810",
  "files": [
    {
      "clientFileId": "local-a",
      "uploadFileId": "86d2e4f3-9d6c-48bb-9c3d-0b6927d43f48",
      "fileName": "a.jpg",
      "chunkCount": 3
    }
  ]
}
```

### 上传分片

```text
PUT /api/upload/batch/:batchId/files/:uploadFileId/chunks/:chunkIndex
```

说明：

- `chunkIndex` 从 `0` 开始。
- 请求体直接放当前分片的二进制数据。
- `Content-Type` 使用 `application/octet-stream`。

curl：

```bash
curl -X PUT \
  -H "Authorization: Bearer my-token" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@/path/to/a.jpg.part0" \
  http://127.0.0.1:17321/api/upload/batch/cc1db0d8-ff02-4d64-a091-805a7959b810/files/86d2e4f3-9d6c-48bb-9c3d-0b6927d43f48/chunks/0
```

响应体：

```json
{
  "ok": true,
  "batchId": "cc1db0d8-ff02-4d64-a091-805a7959b810",
  "uploadFileId": "86d2e4f3-9d6c-48bb-9c3d-0b6927d43f48",
  "receivedChunks": 1,
  "chunkCount": 3
}
```

### 提交批次

```text
POST /api/upload/batch/:batchId/commit
```

curl：

```bash
curl -X POST \
  -H "Authorization: Bearer my-token" \
  http://127.0.0.1:17321/api/upload/batch/cc1db0d8-ff02-4d64-a091-805a7959b810/commit
```

响应体：

```json
{
  "ok": true,
  "batchId": "cc1db0d8-ff02-4d64-a091-805a7959b810",
  "results": [
    {
      "clientFileId": "local-a",
      "uploadFileId": "86d2e4f3-9d6c-48bb-9c3d-0b6927d43f48",
      "ok": true,
      "duplicate": false,
      "file": {
        "apiIdentifier": "74b3c7c5-5e8e-451a-b275-5c8614e43e4f",
        "sha256": "d2a8f4c1c1e9b7c0d1a3f6a6d1234567890abcdef1234567890abcdef1234567",
        "extension": "jpg",
        "sizeBytes": 345678,
        "importedAt": "2026-05-04 18:20:00",
        "updatedAt": "2026-05-04 18:20:00",
        "deletedAt": null,
        "domain": "pending",
        "domainName": "待入库",
        "isFavorite": false,
        "urls": [],
        "tags": [],
        "ratings": []
      }
    }
  ]
}
```

### 取消批次

```text
DELETE /api/upload/batch/:batchId/cancel
```

取消后会删除当前批次已经上传的临时分片。

### 代码中使用

JavaScript / TypeScript：

```ts
const chunkSize = 1024 * 1024;
const file = input.files?.[0];

if (!file) {
  throw new Error("请选择文件");
}

const initResponse = await fetch(
  "http://127.0.0.1:17321/api/upload/batch/init",
  {
    method: "POST",
    headers: {
      Authorization: "Bearer my-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: [
        {
          clientFileId: "local-a",
          fileName: file.name,
          sizeBytes: file.size,
          chunkCount: Math.ceil(file.size / chunkSize),
          tags: [{ namespace: "作品", name: "原神" }],
          forceDuplicate: false,
        },
      ],
    }),
  },
);
const init = await initResponse.json();
const uploadFile = init.files[0];

for (let index = 0; index < uploadFile.chunkCount; index += 1) {
  const chunk = file.slice(index * chunkSize, (index + 1) * chunkSize);
  await fetch(
    `http://127.0.0.1:17321/api/upload/batch/${init.batchId}/files/${uploadFile.uploadFileId}/chunks/${index}`,
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer my-token",
        "Content-Type": "application/octet-stream",
      },
      body: chunk,
    },
  );
}

const commitResponse = await fetch(
  `http://127.0.0.1:17321/api/upload/batch/${init.batchId}/commit`,
  {
    method: "POST",
    headers: {
      Authorization: "Bearer my-token",
    },
  },
);
console.log(await commitResponse.json());
```
