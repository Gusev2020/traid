# Trading Dashboard — агентский индекс

Короткий вход для Cursor. Конвенции — в rules, процедуры — в skills, внешние данные — в MCP. Арбитр качества — lint / `tsc` / тесты / CI, не этот файл.

| Что | Где | Когда подгружается |
|---|---|---|
| Запреты и конвенции | `.cursor/rules/*.mdc` | `project.mdc` — всегда; остальные — по `globs` открытых файлов |
| Пошаговые процедуры | `.cursor/skills/*/SKILL.md` | Агент сам, по `description` (закрыть слой, новый модуль, OpenAPI…) |
| Этот файл | корень репо | Обзор стека, текущий слой, MCP, куда не лезть |
| Источник истины по системе | `ARCHITECTURE.md` | Архитектура, схема, контракты |
| Источник истины по порядку работ | `ROADMAP.md` | Слои B1–B4 → F1–F4 → I1–I4, DoD |

Не дублировать ARCHITECTURE в rules. Rule = «нельзя / только так». Skill = «сделай за N шагов». MCP = живые данные (макет, docs, БД, браузер, GitHub).

## Стек и границы MVP

Монолит: NestJS (`backend/`) + Next.js App Router + FSD (`frontend/`) + PostgreSQL + Prisma. Данные: CoinGecko REST → БД → клиент (REST история, WebSocket live). Кэш in-memory, без Redis. Контракт фронта — только сгенерированный клиент из Swagger.

## Текущий порядок работ

Идти строго по `ROADMAP.md`. Frontend-слои **не начинать**, пока B1–B4 не закрыты зелёным DoD. Не хватает backend-фичи на фронте — вернуться в нужный backend-слой, дописать **и протестировать**, затем `openapi:export`.

Перед закрытием любой задачи слоя: lint + `tsc --noEmit` + тесты этого слоя. Слой без зелёных тестов не закрыт.

## MCP (подключить в Cursor: Settings → MCP → Connect)

Конфиг: `.cursor/mcp.json`. Секреты **не** в git — переменные окружения (см. `.env.example`).

| Сервер | Зачем | Секрет / условие |
|---|---|---|
| **figma** | Токены и узлы макета Treyd | OAuth в UI Cursor. Второй Figma MCP не ставить |
| **context7** | Актуальные docs NestJS / Next / Prisma / TanStack Query | Без ключа — бесплатный лимит. При 429: `CONTEXT7_API_KEY` в env и в конфиг MCP (см. [context7.com/dashboard](https://context7.com/dashboard)). Выбран `npx @upstash/context7-mcp`, не remote URL: npm обычно доступен из РФ; транспорт не завязан на `mcp.context7.com` |
| **github** | PR, checks, CI | `GITHUB_PERSONAL_ACCESS_TOKEN` (scope: repo). Официальный remote `api.githubcopilot.com`. Если Copilot-хост недоступен — fallback в конце этого раздела |
| **postgres** | Read-only запросы к локальной БД | `DATABASE_URL`. Режим `restricted` (`uvx postgres-mcp`). Нужен [uv](https://docs.astral.sh/uv/): `curl -LsSf https://astral.sh/uv/install.sh | sh`. Не использовать Prisma Cloud MCP (`mcp.prisma.io`) — это чужой hosted Postgres, не наш VPS |
| **playwright** | Браузерный проход UI (слои F3 / I1) | Нет ключа. Первый запуск качает Chromium |

Перед кодом на Nest / Next / Prisma / TanStack Query — сначала Context7 (`resolve-library-id` → `get-library-docs`), не выдумывать API из памяти.

**GitHub fallback (без ghcr.io / Docker):** если remote MCP красный:

```bash
go install github.com/github/github-mcp-server/cmd/github-mcp-server@latest
```

В `mcp.json` заменить блок `github` на `command: github-mcp-server`, `args: ["stdio"]`, `env.GITHUB_PERSONAL_ACCESS_TOKEN`.

**Postgres:** сервер молчит, пока нет живого `DATABASE_URL` (слой B1). Схему читать из `backend/prisma/schema.prisma`, не мигрировать через MCP.

## Жёсткие запреты

- Коммитить `.env`, ключи, `frontend/src/shared/api/generated/**`.
- Писать API-типы руками на фронте.
- Класть серверные данные в Zustand.
- Хардкодить цвета/отступы мимо дизайн-токенов.
- Ходить в реальный CoinGecko из тестов (`nock` / MSW).
- INSERT/UPDATE/DELETE через postgres MCP (только чтение).
- Переходить к следующему слою ROADMAP при красных тестах текущего.
