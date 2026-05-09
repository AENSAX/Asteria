# Asteria

Asteria 是一个本地优先的媒体管理器，面向大量图片、动图和视频的标签、分级、收藏、导入与浏览管理。

## 特性

- page / view 工作台布局
- 文件导入、网页导入、Hydrus 导入、E-Hentai 导入
- 标签、标签风格、分级、收藏、URL 管理
- 文件详情、回收站、数据库查看
- 外部 API 管理
- 人工智能打标与标签翻译
- 导出、缩略图缓存、分页浏览、快捷键系统

## 环境

- Node.js 20+
- Electron
- Windows 优先，其他平台可能需要额外适配

## 启动

```bash
npm install
npm run rebuild:native
npm run dev
```

如遇到 `better-sqlite3` native module 不匹配，重新执行：

```bash
npm run rebuild:native
```

## 开发环境配置

可在项目根目录创建 `.env`：

```env
ASTERIA_DEV_DATABASE_PATH=.dev-data/data/library.sqlite
ASTERIA_DEV_USER_DATA_PATH=.dev-data/userData
ASTERIA_DEVTOOLS=0
ASTERIA_RENDERER_LOGS=0
```

- `ASTERIA_DEV_DATABASE_PATH`：开发数据库路径。
- `ASTERIA_DEV_USER_DATA_PATH`：开发版 Electron userData 路径。
- `ASTERIA_DEVTOOLS=1`：启动时打开开发者工具。
- `ASTERIA_RENDERER_LOGS=1`：将 renderer console 输出到主进程终端。

## 检查与构建

```bash
npm run check
npm run build
```

## 打包

```bash
npm run build
npx electron-builder --win --x64
```

## 目录

- `src/main`：主进程
- `src/preload`：预加载桥接
- `src/renderer/src`：界面
- `src/shared`：共享类型与常量
- `config/page-templates`：页面模板
- `docs/DATA_MODEL.md`：数据模型说明
- `开发规范.md`：协作开发规范
- `设计规范.md`、`代码规范.md`：历史细则参考

## 说明

- 页面配置保存到 `userData/page-layouts`
- 数据库位于 `userData/data/library.sqlite`
- 运行时队列和缓存位于 `userData/runtime`
- 开发前请先阅读 `开发规范.md`
