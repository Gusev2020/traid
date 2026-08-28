---
name: new-nest-module
description: Scaffolds a NestJS feature module with Controller, Service, Repository, DTO, Swagger, and tests. Use when adding a backend module (symbols, candles, auth, health, ws-gateway) or a new NestJS feature module.
---

# Новый NestJS-модуль

Шаблон: `backend/src/modules/<name>/` (интеграции — `backend/src/integrations/<name>/`, без репозитория).

```
<name>.module.ts
<name>.controller.ts
<name>.service.ts
<name>.repository.ts      # только если есть БД
dto/
```

1. Controller: DTO + `class-validator` + полный Swagger. Без Prisma и без бизнес-логики.
2. Service: оркестрация. Без HTTP.
3. Repository: только Prisma. Зарегистрировать в `Module` как provider.
4. Если публичный роут — `@Public()`. Иначе глобальный JWT сам закроет.
5. Тесты сразу: `*.spec.ts` на service; `test/e2e/<name>.e2e-spec.ts` (200/400 и 401 если защищён).
6. Подключить в `AppModule`. `openapi:export`.

Не тащить чужие feature-модули через импорт, кроме явно экспортированного сервиса.
