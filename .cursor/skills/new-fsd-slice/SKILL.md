---
name: new-fsd-slice
description: Creates a Feature-Sliced Design slice (widget, feature, or entity) with public API and downward-only imports. Use when adding a frontend widget, feature, entity, or FSD slice.
---

# Новый FSD-слайс

Слои: `widgets/` | `features/` | `entities/` внутри `frontend/src/`. Не класть домен в `shared/`.

```
<slice>/
  ui/           # компоненты
  model/        # хуки, схемы, store UI
  lib/          # чистое (опционально)
  index.ts      # единственный public API
```

1. Импорты только из слоёв ниже (`widgets` → features/entities/shared, не в `pages`/`app`).
2. Экспорт наружу только из `index.ts`.
3. shadcn не копировать сюда — импорт из `@/shared/ui`. Обёртки домена — `entities/*/ui`.
4. REST: хуки/опции из generated TanStack Query, не ручной `fetch` и не ручные типы.
5. Client Component — только если нужен DOM / WS / интерактив (`'use client'`).
6. Тест рядом или в `__tests__`: RTL для UI, `renderHook` для model.

Нарушение boundaries — чинить структуру, не eslint-disable.
