---
name: openapi-sync
description: Regenerates OpenAPI spec from NestJS and the frontend API client. Use after DTO/controller changes, before frontend typecheck, or when the user asks to generate the client / sync OpenAPI / Swagger.
---

# Синхронизация OpenAPI

1. В `backend/`: `npm run openapi:export` → `backend/openapi.json` (приложение без `listen()`).
2. В `frontend/`: `OPENAPI_INPUT=../backend/openapi.json npm run api:generate`.
3. `cd frontend && npx tsc --noEmit`. Красный tsc = сломанный контракт: чинить DTO/поля, не патчить `generated/` и не писать ручные типы.
4. Не коммитить `frontend/src/shared/api/generated/**`.

Локальный dev: живой `http://localhost:3001/docs-json` допустим как `OPENAPI_INPUT`. CI всегда из файла-артефакта.
