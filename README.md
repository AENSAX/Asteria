<div align="center">
  <img src="resources/icons/app.ico" alt="Asteria" width="160" height="160" />
</div>

<h1 align="center">Asteria</h1>

## Features

- Page and view workspace layout
- File import, folder import, Hydrus import, and E-Hentai import
- Browser, search, tag list, file detail, recycle bin, and database views
- Tag management, tag styles, ratings, favorites, and URL management
- Batch tag editing and batch image scripting
- AI tagging and tag translation
- External API management
- Theme and language settings
- Export tools and thumbnail caching

## Deployment

```bash
yarn
yarn rebuild:native
yarn dev
```

If `better-sqlite3` needs to be rebuilt for the current Electron version:

```bash
yarn rebuild:native
```

For packaging on Windows:

```bash
yarn build
npx electron-builder --win --x64
```

## Todo

- [x] Batch image scripting
- [x] Tag translation
- [ ] Tag semantic system
- [ ] Search enhancements
- [ ] Subscriptions and auto download
