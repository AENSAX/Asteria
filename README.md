<div align="center">
  <img src="resources/images/logo.png" alt="Asteria" width="360" />
</div>

## Features

- Page and view workspace layout
- File import, folder import, Hydrus import, and E-Hentai import
- Browser, search, tag list, file detail, recycle bin, and database views
- Tag management, tag styles, ratings, favorites, and URL management
- Batch tag editing and batch image scripting
- AI tagging and multilingual support
- External API management
- Theme and language settings
- Export tools and thumbnail caching

## Deployment

```bash
yarn
yarn rebuild:native
yarn dev
```

## Todo

- [x] Batch image scripting
- [x] Multilingual support
- [ ] Tag semantic system
  - [x] Tag parent relation storage
  - [x] Parent and child relation management UI
  - [x] Common parent and child views for selected tags
  - [x] Read-only tag relation tree window
  - [x] Recursive implied tag expansion
  - [x] Semantic-aware tag search
  - [x] Semantic-aware tag counts
  - [x] Implied parent tag display in file details
  - [ ] Tag sibling and canonical tag rules
  - [ ] Semantic-aware autocomplete
  - [ ] Implied tag display in search results
  - [ ] Batch rename preview with semantic impact
- [ ] Search enhancements
- [ ] Subscriptions and auto download
