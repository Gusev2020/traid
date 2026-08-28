---
name: verify-layer
description: Runs the exact lint, type-check, and test commands for the current ROADMAP layer. Use after implementing a layer, before closing a milestone, or when the user asks to verify / проверить слой.
---

# Проверить слой

Рабочие каталоги: `backend/` или `frontend/`. Не выдумывать скрипты, которых нет в `package.json` — если скрипта ещё нет (ранний слой), поставить его, затем гонять.

## Backend (B1–B4)

```bash
cd backend
npm run lint
npx tsc --noEmit
npx prisma migrate deploy   # если есть БД / CI-сервис postgres
npm run test:cov            # fallback: npm test
npm run test:e2e            # с B1 bootstrap /health
```

С B2: `npm run openapi:export`. `/health` должен отвечать (кроме этапа до HealthModule).

## Frontend (F1–F4)

```bash
cd frontend
npm run lint
npx tsc --noEmit
npm run test -- --coverage
```

С F2: `npm run api:generate` из `OPENAPI_INPUT` / `../backend/openapi.json` до `tsc`. С F1: `npm run tokens:check`, если скрипт уже есть.

## Финал (I1–I4)

Сквозные e2e + соответствующие workflow. `docker compose` — только на I3+.

Красный шаг = слой не верифицирован. Исправить и повторить, не переходить дальше.
