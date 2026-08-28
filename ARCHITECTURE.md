# Trading Dashboard — Architecture

> Live-графики криптовалют. Монолитное TypeScript-приложение: NestJS backend + Next.js frontend в одном репозитории.

**Версия документа:** 1.0
**Макет Figma:** [Treyd Crypto Trading App UI Kit](https://www.figma.com/design/jAGbP5vebc57s09dqcvqkV/Treyd-Crypto-Trading-App-UI-Kit--Community-?m=auto&t=qrm4juGLzcrbHExq-6) (file key `jAGbP5vebc57s09dqcvqkV`)

---

## 1. Обзор

Trading Dashboard — приложение для просмотра исторических и live-данных по криптовалютам: candlestick- и line-чарты, выбор символа и таймфрейма, список инструментов. Данные тянутся из публичного REST API CoinGecko, нормализуются в OHLC-свечи, складываются в PostgreSQL (source of truth для истории) и раздаются клиенту двумя каналами: REST для загрузки исторического окна и WebSocket для инкрементальных обновлений последней свечи. Ключевые решения: **монолит вместо микросервисов** (один продукт, одна команда, нет независимых доменов масштабирования), **NestJS** как backend-фреймворк с DI и декларативным Swagger, **Prisma** как ORM, **Next.js 14 App Router + Feature-Sliced Design** на фронте, **TanStack Query** как единственный владелец серверного стейта, **@hey-api/openapi-ts** для генерации типизированного API-клиента прямо из Swagger-спеки NestJS — контракт между слоями не пишется руками и не расходится. Деплой — один российский VPS (Selectel) через `docker compose`, CI/CD на GitHub Actions.

**Границы MVP:** нет Redis (in-memory cache достаточно для single-instance), нет горизонтального масштабирования, нет user-специфичных портфелей — только auth + просмотр графиков. WebSocket-канал **backend → клиент** есть (трансляция свечей, раздел 4.5); при этом от источника данных (CoinGecko) live-WS **не используется** — сам CoinGecko его не предоставляет, поэтому backend опрашивает REST по расписанию (polling, cron 60s), а наружу клиенту раздаёт обновления уже по WebSocket. Свежесть данных ограничена шагом polling'а (~60s), это не тиковый real-time.

---

## 2. Диаграмма архитектуры

```mermaid
flowchart LR
    subgraph client["Browser"]
        UI["React UI<br/>lightweight-charts"]
        TQ["TanStack Query<br/>cache"]
        WSC["socket.io-client"]
    end

    subgraph next["Next.js 14 (App Router)"]
        RSC["Server Components<br/>SSR / prefetch"]
        CC["Client Components<br/>chart, filters"]
        GEN["Generated API client<br/>@hey-api/openapi-ts"]
    end

    subgraph nest["NestJS (backend)"]
        CTRL["Controllers<br/>+ ValidationPipe + Guards"]
        SVC["Services<br/>business logic"]
        REPO["Repositories<br/>Prisma"]
        GW["WsGateway<br/>@nestjs/websockets"]
        ADP["CoinGeckoAdapter + Client<br/>in-memory TTL cache 60s"]
        SCHED["CandleSyncScheduler<br/>@nestjs/schedule"]
    end

    DB[("PostgreSQL 16<br/>users / symbols / candles")]
    CG["CoinGecko REST API<br/>api.coingecko.com/api/v3"]

    UI --> TQ
    TQ --> GEN
    RSC --> GEN
    CC --> TQ
    GEN -->|"HTTP REST /api/v1"| CTRL
    WSC <-->|"WebSocket: subscribe / candle:update / heartbeat"| GW

    CTRL --> SVC
    SVC --> REPO
    REPO --> DB
    SVC --> ADP
    ADP -->|"GET /coins/:id/ohlc"| CG
    SCHED --> ADP
    SCHED --> REPO
    SCHED -->|"emit candle:update"| GW
    GW --> REPO

    style client fill:#1e293b,color:#f8fafc
    style next fill:#0f172a,color:#f8fafc
    style nest fill:#172554,color:#f8fafc
```

**Поток данных, кратко:**

| Сценарий | Путь |
|---|---|
| Первая загрузка страницы | RSC → generated client → `GET /candles` → CandlesService → CandlesRepository → PostgreSQL → HTML с гидрированным кэшем TanStack Query |
| Смена таймфрейма | Client Component → `useQuery` → generated client → REST → PostgreSQL |
| Live-обновление | Scheduler (cron 60s) → CoinGeckoAdapter → upsert в PostgreSQL → `WsGateway.emit('candle:update')` → socket.io-client → `chart.update()` |
| Backfill истории | CLI `npm run backfill -- --symbol=bitcoin --days=365` → CoinGeckoAdapter → bulk upsert |

---

## 3. Структура репозитория

```text
trading-dashboard/
├── backend/                          # NestJS-приложение
│   ├── prisma/
│   │   ├── schema.prisma             # модели User, Symbol, Candle
│   │   ├── migrations/               # версионированные SQL-миграции
│   │   └── seed.ts                   # базовый набор symbols (BTC, ETH, SOL...)
│   ├── src/
│   │   ├── main.ts                   # bootstrap: ValidationPipe, Swagger, Pino, CORS
│   │   ├── app.module.ts             # корневой модуль, регистрация ThrottlerModule
│   │   ├── config/
│   │   │   ├── configuration.ts      # typed config factory
│   │   │   ├── env.validation.ts     # Zod-схема env (fail-fast на старте)
│   │   │   └── config.module.ts
│   │   ├── common/
│   │   │   ├── guards/               # JwtAuthGuard, RolesGuard
│   │   │   ├── interceptors/         # LoggingInterceptor, TransformInterceptor
│   │   │   ├── filters/              # AllExceptionsFilter (глобальный)
│   │   │   ├── pipes/                # ParseIntervalPipe и пр.
│   │   │   ├── decorators/           # @CurrentUser(), @Public(), @ApiPaginated()
│   │   │   └── dto/                  # PaginationQueryDto, ErrorResponseDto
│   │   ├── prisma/
│   │   │   ├── prisma.module.ts
│   │   │   └── prisma.service.ts     # onModuleInit/onModuleDestroy, $connect
│   │   ├── integrations/
│   │   │   └── coingecko/
│   │   │       ├── coingecko.module.ts
│   │   │       ├── coingecko.client.ts    # HTTP-вызовы, retry, rate-limit guard
│   │   │       ├── coingecko.adapter.ts   # маппинг raw OHLC → domain Candle
│   │   │       ├── coingecko.cache.ts     # in-memory TTL 60s
│   │   │       └── dto/                   # схемы внешнего API
│   │   ├── modules/
│   │   │   ├── auth/                 # register, login, refresh, me
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── strategies/       # JwtStrategy, LocalStrategy
│   │   │   │   ├── users.repository.ts
│   │   │   │   └── dto/
│   │   │   ├── symbols/              # список торговых инструментов
│   │   │   ├── candles/              # чтение свечей + синхронизация
│   │   │   │   ├── candles.controller.ts
│   │   │   │   ├── candles.service.ts
│   │   │   │   ├── candles.repository.ts
│   │   │   │   ├── candle-sync.scheduler.ts
│   │   │   │   └── dto/
│   │   │   ├── ws-gateway/           # WebSocket-шлюз
│   │   │   │   ├── candles.gateway.ts
│   │   │   │   ├── ws-jwt.guard.ts
│   │   │   │   └── events.contract.ts # типы событий, shared с фронтом
│   │   │   └── health/               # GET /health
│   │   └── scripts/
│   │       └── backfill.ts           # CLI: первичная загрузка истории
│   ├── test/
│   │   ├── unit/                     # *.spec.ts — сервисы, адаптеры
│   │   └── e2e/                      # *.e2e-spec.ts — Supertest
│   ├── Dockerfile                    # multi-stage
│   ├── nest-cli.json
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                         # Next.js 14 App Router, FSD
│   ├── src/
│   │   ├── app/                      # FSD layer "app" == Next.js App Router
│   │   │   ├── layout.tsx            # RootLayout, провайдеры
│   │   │   ├── providers/            # QueryClientProvider, ThemeProvider, WsProvider
│   │   │   ├── globals.css           # CSS-переменные дизайн-токенов из Figma
│   │   │   ├── (marketing)/page.tsx
│   │   │   └── dashboard/
│   │   │       ├── page.tsx          # Server Component: prefetch + hydrate
│   │   │       └── [symbol]/page.tsx
│   │   ├── pages/                    # FSD "pages": композиция widgets в экран
│   │   │   └── dashboard/
│   │   │       ├── ui/DashboardPage.tsx
│   │   │       └── index.ts
│   │   ├── widgets/                  # самодостаточные блоки UI
│   │   │   ├── candle-chart/         # lightweight-charts, Client Component
│   │   │   │   ├── ui/CandleChart.tsx
│   │   │   │   ├── model/use-chart-series.ts
│   │   │   │   └── index.ts
│   │   │   ├── symbol-list/
│   │   │   └── market-header/
│   │   ├── features/                 # пользовательские сценарии
│   │   │   ├── auth-login/
│   │   │   ├── select-timeframe/
│   │   │   └── subscribe-candles/    # WS-подписка + запись в кэш TanStack Query
│   │   ├── entities/                 # бизнес-сущности
│   │   │   ├── candle/               # схемы Zod, мапперы, queryOptions-обёртки
│   │   │   ├── symbol/
│   │   │   └── user/
│   │   └── shared/
│   │       ├── api/
│   │       │   ├── generated/        # !!! автоген @hey-api/openapi-ts, в .gitignore
│   │       │   ├── client.ts         # настройка baseUrl, auth-интерцептор
│   │       │   └── ws.ts             # socket.io-client singleton
│   │       ├── ui/                   # shadcn/ui компоненты (button, card, dialog...)
│   │       ├── config/
│   │       │   ├── env.ts            # Zod-валидация NEXT_PUBLIC_*
│   │       │   └── design-tokens.json # выгрузка из Figma MCP
│   │       ├── lib/                  # cn(), форматтеры дат/цен
│   │       └── hooks/
│   ├── openapi-ts.config.ts          # конфиг генератора клиента
│   ├── components.json               # конфиг shadcn/ui (alias → shared/ui)
│   ├── tailwind.config.ts            # маппинг CSS-переменных → Tailwind-темы
│   ├── vitest.config.ts
│   ├── next.config.mjs               # output: 'standalone'
│   ├── Dockerfile
│   └── package.json
│
├── .cursor/
│   ├── mcp.json                      # Figma, Context7, GitHub, Postgres (read-only), Playwright
│   ├── rules/                        # конвенции агента (см. AGENTS.md)
│   │   ├── project.mdc               # alwaysApply: слои ROADMAP, DoD
│   │   ├── backend.mdc
│   │   ├── frontend.mdc
│   │   ├── figma.mdc
│   │   ├── testing.mdc
│   │   ├── prisma.mdc
│   │   ├── security.mdc
│   │   └── openapi-contract.mdc
│   └── skills/                       # процедуры: слой, Nest-модуль, FSD, OpenAPI…
├── AGENTS.md                         # индекс: rules vs skills vs MCP
│
├── .github/
│   └── workflows/
│       ├── backend.yml               # lint → test → build (paths: backend/**)
│       ├── frontend.yml              # lint → test → build (paths: frontend/**)
│       └── deploy.yml                # push образов в registry (Selectel CR / GHCR) + ssh deploy на VPS
│
├── scripts/
│   ├── figma-tokens.ts               # design-tokens.json → CSS-переменные
│   └── deploy.sh                     # идемпотентный деплой на VPS
│
├── docker-compose.yml                # dev: postgres + backend + frontend
├── docker-compose.prod.yml           # prod: образы из registry (Selectel CR / GHCR), healthchecks, restart
├── .env.example
├── ARCHITECTURE.md
├── ROADMAP.md
└── README.md
```

**Почему не pnpm workspaces / Nx:** `backend/` и `frontend/` не делят runtime-код — единственный контракт между ними генерируется из OpenAPI. Общий workspace добавил бы связность сборки без выгоды. Типы WS-событий дублируются в `events.contract.ts` (~40 строк) — осознанный компромисс вместо shared-пакета.

---

## 4. Backend-архитектура

### 4.1 Модули и слои

| Слой | Ответственность | Что запрещено |
|---|---|---|
| **Controller** | HTTP-роутинг, DTO-валидация, Swagger-декораторы, маппинг domain → response DTO | бизнес-логика, прямой доступ к Prisma |
| **Service** | бизнес-логика, транзакции, оркестрация репозиториев и интеграций | знать про `Request`/`Response`, HTTP-коды |
| **Repository** | доступ к данным через `PrismaService`, только этот слой знает Prisma-типы | бизнес-правила |
| **Integration** | внешние API (CoinGecko): HTTP, retry, кэш, маппинг | доступ к БД |
| **Gateway** | WebSocket-транспорт: подписки, broadcast, heartbeat | бизнес-логика (делегирует в Service) |

Feature-модули: `AuthModule`, `SymbolsModule`, `CandlesModule`, `WsGatewayModule`, `HealthModule`. Инфраструктурные: `ConfigModule` (global), `PrismaModule` (global), `CoinGeckoModule`.

**Правило зависимостей:** feature-модули не импортируют друг друга напрямую, кроме экспортированных сервисов (`CandlesModule` экспортирует `CandlesService`, его потребляет `WsGatewayModule`). Циклы разрываются через `forwardRef` только как последняя мера — в MVP их нет.

### 4.2 Поток запроса

```mermaid
sequenceDiagram
    participant C as Client
    participant T as ThrottlerGuard
    participant G as JwtAuthGuard
    participant P as ValidationPipe
    participant Ctl as CandlesController
    participant S as CandlesService
    participant R as CandlesRepository
    participant DB as PostgreSQL
    participant F as AllExceptionsFilter

    C->>T: GET /api/v1/candles symbol=BTC interval=H4
    T->>T: проверка лимита (60 req/min per IP)
    T->>G: pass
    G->>G: verify JWT (или @Public → skip)
    G->>P: pass
    P->>P: GetCandlesQueryDto: whitelist + transform
    P->>Ctl: типизированный DTO
    Ctl->>S: getCandles(dto)
    S->>R: findRange(symbolId, interval, from, to)
    R->>DB: SELECT ... WHERE ... ORDER BY open_time
    DB-->>R: rows
    R-->>S: Candle[]
    S-->>Ctl: Candle[]
    Ctl-->>C: 200 CandleResponseDto[]

    Note over S,F: при исключении
    S--xF: NotFoundException / CoinGeckoUnavailableException
    F-->>C: RFC-7807-подобный JSON + Pino error log с requestId
```

**Глобальная конфигурация в `main.ts`:**

```ts
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));                       // nestjs-pino
app.setGlobalPrefix('api/v1', { exclude: ['health'] });
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,             // вырезает не описанные в DTO поля
  forbidNonWhitelisted: true,  // 400 при лишних полях
  transform: true,             // приводит типы по метаданным (string → number/Date)
  transformOptions: { enableImplicitConversion: true },
}));
app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));
app.enableShutdownHooks();
```

### 4.3 Prisma-схема

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  USER
  ADMIN
}

/// Таймфреймы, которые отдаёт CoinGecko OHLC (гранулярность определяется параметром days)
enum CandleInterval {
  M30 // days=1
  H4  // days=2..30
  D4  // days>=31
}

model User {
  id           String    @id @default(uuid()) @db.Uuid
  email        String    @unique
  passwordHash String    @map("password_hash")
  role         Role      @default(USER)
  refreshHash  String?   @map("refresh_hash")   // hash активного refresh-токена
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt      @map("updated_at")

  @@map("users")
}

model Symbol {
  id           Int       @id @default(autoincrement())
  coingeckoId  String    @unique @map("coingecko_id")  // "bitcoin"
  ticker       String                                   // "BTC"
  name         String                                   // "Bitcoin"
  vsCurrency   String    @default("usd") @map("vs_currency")
  isActive     Boolean   @default(true)  @map("is_active")
  lastSyncedAt DateTime? @map("last_synced_at")
  createdAt    DateTime  @default(now()) @map("created_at")

  candles      Candle[]

  @@unique([ticker, vsCurrency])   // BTC/usd уникален
  @@index([isActive])              // выборка символов для scheduler
  @@map("symbols")
}

model Candle {
  symbolId  Int             @map("symbol_id")
  interval  CandleInterval
  openTime  DateTime        @map("open_time") @db.Timestamptz(3)
  open      Decimal         @db.Decimal(20, 8)
  high      Decimal         @db.Decimal(20, 8)
  low       Decimal         @db.Decimal(20, 8)
  close     Decimal         @db.Decimal(20, 8)
  volume    Decimal?        @db.Decimal(30, 8)
  source    String          @default("coingecko")
  updatedAt DateTime        @updatedAt @map("updated_at")

  symbol    Symbol          @relation(fields: [symbolId], references: [id], onDelete: Cascade)

  @@id([symbolId, interval, openTime])                      // natural PK → идемпотентный upsert
  @@index([symbolId, interval, openTime(sort: Desc)])        // "последние N свечей"
  @@index([openTime])                                        // retention / cleanup
  @@map("candles")
}
```

**Решения по схеме:**

| Решение | Причина |
|---|---|
| Композитный PK `(symbolId, interval, openTime)` | Backfill и scheduler делают `upsert` без предварительного `SELECT`; повторный прогон скрипта не создаёт дубликатов |
| `Decimal(20,8)` вместо `Float` | `Float` теряет точность на ценах вида `0.00000271`; при отдаче наружу приводим к `string`, чтобы не терять точность в JSON |
| `Timestamptz(3)` | Все свечи в UTC, миллисекунды — как в ответе CoinGecko |
| Enum `CandleInterval` вместо строки | Гранулярность жёстко задана правилами CoinGecko, произвольные интервалы приняли бы невалидные значения |
| Индекс с `sort: Desc` | Основной запрос — «последние N свечей», Postgres читает индекс без сортировки |

**Почему Prisma, а не TypeORM.** Prisma генерирует типы из единственной декларативной схемы, поэтому результат любого запроса типизирован структурно: `select`/`include` меняют возвращаемый тип, и попытка обратиться к неподгруженному полю — ошибка компиляции, а не `undefined` в рантайме. TypeORM держит модель в декораторах над классами и полагается на `experimentalDecorators` + `reflect-metadata`, из-за чего relations типизированы как «может быть загружено» (`Foo | undefined` или, хуже, не отражено в типе вообще), а Active Record/Data Mapper дают два конкурирующих стиля в одной кодовой базе. Плюс миграции: `prisma migrate dev` генерирует SQL из диффа схемы и хранит его в репозитории — воспроизводимо и ревьюабельно, тогда как `synchronize: true` в TypeORM — известный источник продакшн-инцидентов, а генерация миграций требует поднятого соединения и часто выдаёт шум. Цена — Prisma слабее в очень сложном динамическом SQL; для нашего профиля запросов (диапазонные выборки по индексу + bulk upsert) этого не требуется, а редкие тяжёлые агрегаты закрываются `$queryRaw` с явным типом.

### 4.4 Интеграция с CoinGecko

**Endpoint:** `GET https://api.coingecko.com/api/v3/coins/{id}/ohlc?vs_currency=usd&days={1|7|14|30|90|180|365}`
**Ответ:** `[[timestamp_ms, open, high, low, close], ...]` — массив массивов, без volume.
**Auth:** header `x-cg-demo-api-key` (Demo-план бесплатен).
**Лимиты:** Demo — 100 запросов/мин; без ключа — 5–15 запросов/мин с IP-шэрингом. Ошибки `4xx`/`5xx` тоже расходуют лимит.
**Гранулярность** задаётся сервером по `days`, параметр `interval` доступен только на Enterprise:

| `days` | Гранулярность | Наш `CandleInterval` |
|---|---|---|
| 1 | 30 минут | `M30` |
| 2–30 | 4 часа | `H4` |
| ≥ 31 | 4 дня | `D4` |

**Слои интеграции:**

```text
CandlesService
      │
      ▼
CoinGeckoAdapter        # domain-фасад: getOhlc(symbol, interval) → Candle[]
      │                 # маппинг [ts,o,h,l,c] → Candle, валидация Zod-схемой
      ▼
CoinGeckoCache          # in-memory Map<string, {data, expiresAt}>, TTL 60s
      │                 # ключ: `ohlc:${coingeckoId}:${vsCurrency}:${days}`
      ▼
CoinGeckoClient         # undici/axios: timeout 8s, retry 3x с экспоненциальным
                        # backoff + jitter, только на 429/5xx/сетевые ошибки
```

**Защита от упора в лимит CoinGecko:**

| Механизм | Реализация |
|---|---|
| In-memory cache TTL 60s | Совпадает с частотой обновления scheduler'а: N параллельных клиентов = 1 внешний запрос |
| Внутренний rate limiter | Token bucket 50 req/min (половина лимита Demo) в `CoinGeckoClient`; при исчерпании — ожидание, а не отказ |
| Single-flight | Конкурентные запросы одного ключа делят один in-flight `Promise` — нет thundering herd при истечении TTL |
| Respect `Retry-After` | На 429 клиент ждёт указанное время, счётчик retry не инкрементируется |
| Circuit breaker | 5 ошибок подряд → open на 60s, `CandlesService` отдаёт данные из PostgreSQL с флагом `stale: true` |
| Graceful degradation | CoinGecko недоступен → REST продолжает работать на данных БД; WS не эмитит обновлений |

Кэш — обычный `Map` внутри синглтон-сервиса, без `@nestjs/cache-manager`: нужен single-flight и явный контроль инвалидации, а обёртка cache-manager это усложняет. Переход на Redis потребуется только при масштабировании на несколько инстансов backend — тогда меняется одна реализация за интерфейсом `CandleCache`.

### 4.5 WebSocket-шлюз

Транспорт — socket.io через `@nestjs/platform-socket.io`: даёт готовый auto-reconnect с backoff на клиенте, namespaces/rooms для подписок и fallback на long-polling. Namespace: `/ws/candles`.

**Клиентские события (client → server):**

| Событие | Payload | Ответ (ack) | Описание |
|---|---|---|---|
| `subscribe` | `{ symbol: "BTC", interval: "H4" }` | `{ ok: true, room: "BTC:H4" }` | Вход в room; сервер сразу отдаёт последнюю известную свечу |
| `unsubscribe` | `{ symbol: "BTC", interval: "H4" }` | `{ ok: true }` | Выход из room |
| `pong` | `{ ts: 1735000000000 }` | — | Ответ на серверный heartbeat |

**Серверные события (server → client):**

| Событие | Payload |
|---|---|
| `candle:update` | `{ symbol, interval, candle: { openTime, open, high, low, close, volume }, isClosed: boolean }` |
| `candle:snapshot` | `{ symbol, interval, candles: Candle[] }` — сразу после `subscribe` |
| `server:heartbeat` | `{ ts: number, serverTime: string }` — каждые 30s |
| `error` | `{ code: "INVALID_SYMBOL" \| "UNAUTHORIZED" \| "RATE_LIMITED", message: string }` |

**Heartbeat.** Два уровня: транспортный (`pingInterval: 30000`, `pingTimeout: 10000` в конфиге адаптера — это встроенный ping/pong socket.io) и прикладной `server:heartbeat` каждые 30s через `@Interval(30000)`. Прикладной нужен, чтобы клиент отличал «соединение живо, но данных нет» от «сервер умер», и чтобы промежуточные прокси (nginx с `proxy_read_timeout`) не рвали idle-соединение. Если клиент не ответил `pong` на два heartbeat подряд, сервер закрывает сокет.

**Disconnect.** `handleDisconnect(client)` чистит: выход из всех rooms, удаление записи из `Map<socketId, ClientState>`, декремент счётчика подписчиков символа. Когда у символа 0 подписчиков — scheduler перестаёт его синхронизировать (экономия квоты CoinGecko).

**Reconnection.** Клиент (socket.io-client) реконнектится сам: `reconnectionDelay: 1000`, `reconnectionDelayMax: 10000`, бесконечные попытки. На `connect` после разрыва фронт делает две вещи: заново отправляет `subscribe` для актуального символа/таймфрейма и вызывает `queryClient.invalidateQueries` на ключе свечей — так закрывается gap за время офлайна (WS-события за это время потеряны, REST-запрос отдаёт консистентное окно из БД).

**Auth в WS.** JWT передаётся в `handshake.auth.token`; `WsJwtGuard` проверяет его в `handleConnection` и кладёт `user` в `client.data`. Публичные символы доступны без токена — в MVP гейт стоит только на приватных событиях.

### 4.6 Auth (JWT)

| Компонент | Детали |
|---|---|
| Библиотеки | `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `argon2` для хэша пароля |
| Access token | HS256, TTL 15 мин, payload `{ sub, email, role }` |
| Refresh token | TTL 7 дней, отдельный секрет, hash хранится в `User.refreshHash` → возможен отзыв |
| Транспорт | Access — заголовок `Authorization: Bearer`; refresh — httpOnly Secure SameSite=Lax cookie |
| Guard | `JwtAuthGuard` регистрируется глобально через `APP_GUARD`; публичные роуты помечаются `@Public()` |
| Роли | `RolesGuard` + `@Roles(Role.ADMIN)` — на административном ре-синке |
| Декоратор | `@CurrentUser()` извлекает user из `request.user`, типизированно |

Глобальный guard по умолчанию (deny-by-default) вместо навешивания на каждый контроллер: забыть `@Public()` на публичном роуте — заметная ошибка (404/401 сразу видно в e2e), забыть `@UseGuards()` на приватном — тихая дыра.

### 4.7 Swagger

```ts
const config = new DocumentBuilder()
  .setTitle('Trading Dashboard API')
  .setDescription('Crypto OHLC data: REST + WebSocket')
  .setVersion('1.0')
  .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
  .addTag('candles').addTag('symbols').addTag('auth')
  .build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
```

Требования к декорированию: каждый эндпоинт имеет `@ApiOperation({ summary })`, `@ApiOkResponse({ type })`, все нештатные коды через `@ApiResponse`. Примеры задаются в DTO, чтобы попадали и в Swagger UI, и в генерируемый клиент:

```ts
export class GetCandlesQueryDto {
  @ApiProperty({ example: 'BTC', description: 'Тикер из GET /symbols' })
  @IsString() @Length(2, 12) @Transform(({ value }) => value.toUpperCase())
  symbol!: string;

  @ApiProperty({ enum: CandleInterval, example: CandleInterval.H4 })
  @IsEnum(CandleInterval)
  interval!: CandleInterval;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional() @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: 500, minimum: 1, maximum: 1000, default: 500 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  limit: number = 500;
}
```

В CI шаг `npm run openapi:export` поднимает приложение в in-memory режиме и пишет `openapi.json` как артефакт — фронтенд-сборка генерирует клиент из этого файла, не поднимая backend.

### 4.8 Rate limiting

```ts
ThrottlerModule.forRoot({
  throttlers: [
    { name: 'short',  ttl: seconds(1),  limit: 5   },  // антибурст
    { name: 'medium', ttl: seconds(60), limit: 60  },  // базовый
    { name: 'long',   ttl: seconds(900), limit: 500 }, // антискрейпинг
  ],
})
```

`ThrottlerGuard` глобально. Точечные переопределения: `@Throttle({ short: { limit: 3, ttl: seconds(60) } })` на `POST /auth/login` (антибрутфорс), `@SkipThrottle()` на `/health`. За reverse-proxy обязательно `app.set('trust proxy', 1)`, иначе все клиенты считаются одним IP.

Это внешний контур защиты. Внутренний (token bucket в `CoinGeckoClient`) отвечает за квоту CoinGecko: даже если throttler пропустит поток запросов, кэш и bucket не дадут превысить лимит апстрима.

### 4.9 Логирование

`nestjs-pino` как единственный логгер (`app.useLogger`). Конфигурация:

| Аспект | Решение |
|---|---|
| Формат | JSON в prod, `pino-pretty` в dev |
| Корреляция | `genReqId` создаёт/пробрасывает `x-request-id`; попадает во все логи запроса и в тело ошибки |
| Redaction | `redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', '*.apiKey']` |
| Уровни | `info` — запросы и синхронизации, `warn` — 429/circuit-breaker, `error` — необработанные исключения со стеком |
| Шум | `autoLogging.ignore` для `/health` и `/docs*` |

`AllExceptionsFilter` — единая точка преобразования исключений: `HttpException` → её статус, `Prisma.PrismaClientKnownRequestError` (P2002 → 409, P2025 → 404), всё остальное → 500 с сокрытием внутренних деталей от клиента и полным стеком в логе.

```json
{ "statusCode": 404, "code": "SYMBOL_NOT_FOUND", "message": "Symbol DOGE2 not found",
  "path": "/api/v1/candles", "requestId": "01JG...", "timestamp": "2026-08-28T12:00:00.000Z" }
```

### 4.10 Health-check

`GET /health` (вне глобального префикса, без auth, без throttling), на базе `@nestjs/terminus`:

```ts
@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.prismaIndicator.pingCheck('database', { timeout: 1500 }),
    () => this.coingeckoIndicator.isHealthy('coingecko'),  // состояние circuit breaker
    () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
  ]);
}
```

`database` — реальный `SELECT 1` через Prisma. `coingecko` — статус circuit breaker, помечен как **не критичный** (`degraded`, но 200): приложение работоспособно на данных БД, и падение апстрима не должно вызывать рестарт контейнера. `docker-compose` использует этот эндпоинт в `healthcheck`, а `depends_on: condition: service_healthy` выстраивает порядок старта.

### 4.11 Backfill-скрипт

Отдельный CLI, не HTTP-эндпоинт: долгая операция (минуты), должна запускаться из shell и в CI, и не должна занимать HTTP-воркер.

```bash
npm run backfill -- --symbols=bitcoin,ethereum --days=365 --dry-run
npm run backfill -- --all --days=365
```

Реализация: `NestFactory.createApplicationContext(AppModule)` (без HTTP-слоя) → переиспользует `CoinGeckoAdapter` и `CandlesRepository`. Логика:

1. Разрешить список символов (`--symbols` или все `isActive`).
2. Для каждого символа последовательно (не параллельно — берегём квоту) запросить OHLC для нужных `days`.
3. `createMany({ skipDuplicates: true })` чанками по 1000 — быстрее, чем `upsert` по одной записи; композитный PK гарантирует идемпотентность.
4. Обновить `Symbol.lastSyncedAt`.
5. Итоговый отчёт: символов обработано / свечей вставлено / пропущено / ошибок; `exit code 1` при любой ошибке — чтобы CI и cron замечали.

Флаги: `--dry-run` (без записи), `--concurrency` (по умолчанию 1), `--resume` (пропуск символов с непустой историей).

### 4.12 Тесты (backend)

| Тип | Инструменты | Что покрываем |
|---|---|---|
| Unit | Jest + `@golevelup/ts-jest` для моков | `CandlesService` (границы диапазонов, пустая история), `CoinGeckoAdapter` (маппинг, битые payload'ы), `CoinGeckoCache` (TTL, single-flight), `AuthService` (хэш, невалидный refresh) |
| Integration | Jest + Testcontainers (PostgreSQL) | Репозитории на реальной БД: upsert-идемпотентность, работа индексов |
| E2E | Jest + Supertest | Полный цикл контроллеров: 200/400/401/404/429, `whitelist` отбрасывает лишние поля, Swagger-схема соответствует ответам |
| WS | `socket.io-client` против реального `app.listen()` | `subscribe` → `candle:snapshot`, heartbeat, поведение при disconnect |

Порог покрытия в CI: 80% для `src/modules/**` и `src/integrations/**` (`coverageThreshold` в `jest.config`). Внешние HTTP-вызовы в тестах перехватываются `nock` — реальных обращений к CoinGecko в CI нет.

---

## 5. Frontend-архитектура

### 5.1 FSD-слои

Правило импортов: слой может импортировать **только слои ниже себя**. Проверяется ESLint (`eslint-plugin-boundaries`) — нарушение ломает CI.

```text
app       →  инициализация: layout, провайдеры, глобальные стили, роутинг Next.js
pages     →  композиция экрана из widgets, никакой бизнес-логики
widgets   →  самодостаточные блоки: candle-chart, symbol-list, market-header
features  →  пользовательские действия: auth-login, select-timeframe, subscribe-candles
entities  →  бизнес-сущности: candle, symbol, user — схемы, мапперы, queryOptions
shared    →  переиспользуемое без домена: shared/ui (shadcn), api, config, lib, hooks
```

| Слой | Пример содержимого | Client/Server |
|---|---|---|
| `app/` | `layout.tsx`, `providers/QueryProvider.tsx`, `globals.css` | Server (провайдеры — Client) |
| `pages/dashboard/` | `DashboardPage.tsx` — сетка из `MarketHeader` + `CandleChart` + `SymbolList` | Server |
| `widgets/candle-chart/` | `CandleChart.tsx` (lightweight-charts), `use-chart-series.ts` | **Client** (`'use client'`) |
| `features/select-timeframe/` | `TimeframeToggle.tsx`, синхронизация с URL search params | **Client** |
| `entities/candle/` | `candle.schema.ts` (Zod), `to-chart-data.ts`, `candle.queries.ts` | изоморфно |
| `shared/ui/` | `button.tsx`, `card.tsx`, `select.tsx` — **сгенерированы shadcn CLI** | по компоненту |
| `shared/api/generated/` | автоген openapi-ts, в `.gitignore` | изоморфно |

**Где живут shadcn-компоненты.** Строго в `shared/ui/`. `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "tsx": true,
  "tailwind": { "config": "tailwind.config.ts", "css": "src/app/globals.css", "baseColor": "slate", "cssVariables": true },
  "aliases": { "components": "@/shared/ui", "utils": "@/shared/lib/utils", "ui": "@/shared/ui", "hooks": "@/shared/hooks", "lib": "@/shared/lib" }
}
```

Так `npx shadcn@latest add button card select` кладёт файлы сразу в правильный слой. Правило: файлы в `shared/ui/` не правятся под конкретную фичу — только под дизайн-токены из Figma. Доменные обёртки (`PriceBadge`, `SymbolAvatar`) живут в `entities/*/ui/` и композируют примитивы из `shared/ui/`.

**Почему FSD без Atomic Design.** Atomic Design решает задачу классификации UI-компонентов по гранулярности (atoms → molecules → organisms), но эту задачу за нас уже решил shadcn/ui: его компоненты и есть слой atoms/molecules, они лежат в `shared/ui/` и обновляются через CLI. Оставшийся вопрос — куда девать доменную логику, и на него Atomic Design ответа не даёт: спор «это molecule или organism?» бесконечен и не имеет технических последствий. FSD разрезает код по другой оси — по бизнес-смыслу и направлению зависимостей, где границы проверяемы линтером и совпадают с границами задач. Смешивать обе методологии — значит получить два конкурирующих дерева каталогов и постоянный вопрос «класть в `features/` или в `organisms/`?».

### 5.2 Поток данных

```mermaid
sequenceDiagram
    participant B as Browser
    participant RSC as page.tsx (Server Component)
    participant QC as QueryClient (server)
    participant SDK as shared/api/generated (SDK)
    participant API as NestJS
    participant CC as CandleChart (Client Component)
    participant WS as socket.io-client

    B->>RSC: GET /dashboard/BTC tf=H4
    RSC->>QC: prefetchQuery(getCandlesOptions symbol=BTC interval=H4)
    QC->>SDK: getCandles(...)
    SDK->>API: GET /api/v1/candles symbol=BTC interval=H4
    API-->>SDK: CandleResponseDto[]
    SDK-->>QC: типизированные данные
    RSC-->>B: HTML + HydrationBoundary с dehydrate(QC)
    Note over B,CC: гидрация — график рисуется без лишнего запроса
    CC->>WS: subscribe (symbol=BTC, interval=H4)
    WS-->>CC: candle:update
    CC->>QC: queryClient.setQueryData(key, merge(prev, candle))
    Note over CC: chart.update() — точечная мутация серии, без ререндера дерева
```

**Server / Client разделение:**

| Компонент | Тип | Почему |
|---|---|---|
| `app/dashboard/[symbol]/page.tsx` | Server | Prefetch данных, SEO, метаданные; секреты не уезжают в бандл |
| `widgets/candle-chart` | Client | `lightweight-charts` работает с DOM-канвасом и `useRef` |
| `features/select-timeframe` | Client | Интерактив + `useRouter`/`useSearchParams` |
| `widgets/symbol-list` | Server (Client-обёртка для поиска) | Список статичен между рендерами |
| `app/providers/*` | Client | `QueryClientProvider` держит React-контекст |

**TanStack Query.** Единственный владелец серверного стейта. Конфигурация:

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // свечи меняются раз в минуту
      gcTime: 5 * 60_000,
      retry: (count, err) => !isClientError(err) && count < 2,  // не ретраим 4xx
      refetchOnWindowFocus: true,  // закрывает gap после возврата на вкладку
    },
  },
})
```

Ключи не пишутся руками — их генерирует плагин `@tanstack/react-query` из OpenAPI-спеки (`getCandlesQueryKey(...)`), поэтому инвалидация не может разойтись с фактическим запросом. WS-события не триггерят refetch, а точечно правят кэш через `setQueryData`; полный `invalidateQueries` вызывается только на реконнекте.

**Почему TanStack Query, а не Zustand для серверных данных.** Zustand — это стор: он хранит то, что вы в него положили, и всё остальное вы пишете сами. Серверные данные — не состояние, а кэш чужого состояния, и у него есть свой набор обязательных задач: дедупликация одновременных запросов, staleness и фоновая ревалидация, retry с backoff, отмена устаревших запросов при быстром переключении символов, refetch на возврат фокуса и восстановление сети, инвалидация после мутаций, SSR-дегидрация/гидрация. TanStack Query решает всё это из коробки; на Zustand это превращается в самописный слой на несколько сотен строк, который придётся отлаживать на гонках (переключили таймфрейм трижды подряд — какой ответ применится?). Практический аргумент для нас: генератор `@hey-api/openapi-ts` умеет отдавать готовые `queryOptions`/`mutationOptions`/`queryKey` — связка «спека → хуки» бесплатна, а под Zustand пришлось бы писать обёртки руками. Zustand в проекте остаётся, но для того, чем он хорош: чисто клиентский UI-стейт (открытые панели, выбранные оверлеи графика, тема) — там, где нет сервера и нечего ревалидировать.

### 5.3 Zod

Три точки применения, все с выводом типов через `z.infer` — ручных `interface` для этих данных нет.

**1. Валидация env — на этапе импорта, fail-fast при сборке:**

```ts
// shared/config/env.ts
const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_WS_URL: z.string().url(),
  NEXT_PUBLIC_DEFAULT_SYMBOL: z.string().default('BTC'),
});
export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  NEXT_PUBLIC_DEFAULT_SYMBOL: process.env.NEXT_PUBLIC_DEFAULT_SYMBOL,
});
```

Опечатка в имени переменной ломает `next build`, а не продакшн-рантайм.

**2. Формы — `react-hook-form` + `zodResolver`:**

```ts
// features/auth-login/model/schema.ts
export const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Минимум 8 символов'),
});
export type LoginValues = z.infer<typeof loginSchema>;
```

**3. Парсинг ответов API — на границах доверия.** Тут важна дисциплина, чтобы не дублировать работу генератора. Типы из OpenAPI — это *обещание* контракта на этапе компиляции; Zod — *проверка* в рантайме. Поэтому:

- **Не валидируем** каждый ответ backend'а: типы уже сгенерированы из спеки, а сам backend валидирует свои DTO. Дублирование только добавит рантайм-оверхед.
- **Валидируем** данные, которым нельзя доверять структурно: WS-payload'ы (не покрыты OpenAPI-спекой), значения из URL search params, содержимое `localStorage`, `design-tokens.json` из Figma MCP.

```ts
// entities/candle/candle.schema.ts
export const candleUpdateSchema = z.object({
  symbol: z.string(),
  interval: z.enum(['M30', 'H4', 'D4']),
  candle: z.object({
    openTime: z.coerce.date(),
    open: z.coerce.number(), high: z.coerce.number(),
    low: z.coerce.number(),  close: z.coerce.number(),
    volume: z.coerce.number().nullable(),
  }),
  isClosed: z.boolean(),
});
export type CandleUpdate = z.infer<typeof candleUpdateSchema>;
```

Опционально: плагин `zod` в `openapi-ts.config.ts` генерирует схемы и из спеки — включаем при необходимости валидировать ответы на конкретных критичных роутах, не дублируя описание руками.

### 5.4 Тесты (frontend)

| Тип | Инструменты | Примеры |
|---|---|---|
| Компоненты | Vitest + React Testing Library + `@testing-library/user-event` | `TimeframeToggle` меняет URL; `SymbolList` фильтрует по поиску; скелетоны и empty state |
| Хуки | Vitest + `renderHook` | `useChartSeries` (маппинг свечей в формат серии), `useCandlesSubscription` (реакция на WS-события) |
| Интеграция запросов | Vitest + MSW | Мокаем `/api/v1/candles` на уровне сети, проверяем loading → success → error через реальный `QueryClient` |
| Схемы | Vitest | `candleUpdateSchema` отклоняет битые payload'ы; `env.ts` падает на пустом URL |

Конфигурация: `environment: 'jsdom'`, `setupFiles` с `@testing-library/jest-dom` и стартом MSW-сервера, `globals: true`. Canvas `lightweight-charts` в jsdom не рендерится — библиотека мокается (`vi.mock('lightweight-charts')`), тестируется наш адаптер данных и вызовы API графика, а не отрисовка. Визуальную проверку графика закрываем Playwright-смоуком (вне MVP-скоупа, задел на неделю 6).

---

## 6. Дизайн-система и Figma MCP

### 6.1 Макет

**Figma:** [Treyd Crypto Trading App UI Kit (Community)](https://www.figma.com/design/jAGbP5vebc57s09dqcvqkV/Treyd-Crypto-Trading-App-UI-Kit--Community-?m=auto&t=qrm4juGLzcrbHExq-6)
**File key:** `jAGbP5vebc57s09dqcvqkV`

Макет — источник истины для цветов, типографики, отступов, радиусов и состояний компонентов. Правило: если значение есть в макете, в коде оно берётся из дизайн-токена (CSS-переменной), а не пишется литералом.

### 6.2 Установка MCP-сервера Figma

Figma поставляет официальный MCP-сервер (Dev Mode MCP) в двух вариантах. **Требование:** тарифный план Figma Professional, Organization или Enterprise — на Free/Starter MCP недоступен.

| Вариант | URL | Когда использовать |
|---|---|---|
| **Remote** (рекомендуется) | `https://mcp.figma.com/mcp` | Дефолт. Ничего не устанавливать, OAuth-логин в браузере, самый полный набор инструментов |
| **Desktop** | `http://127.0.0.1:3845/mcp` | Enterprise-ограничения на внешний трафик. Требует Figma Desktop: Dev Mode (`Shift+D`) → панель inspect → *Enable desktop MCP server* |

**Быстрый путь в Cursor** — плагин, который ставит и MCP-конфиг, и skills для работы с макетом. В чате агента:

```text
/add-plugin figma
```

Плагин добавляет конфигурацию сервера, skills (реализация дизайна, Code Connect, генерация design-system rules) и правила корректной работы с ассетами.

**Ручной путь:** Cursor → Settings → Cursor Settings → вкладка **MCP** → *+ Add new global MCP server*, либо файл `.cursor/mcp.json` в репозитории (предпочтительно — конфиг версионируется вместе с проектом). После сохранения нажать **Connect** рядом с `figma` и разрешить доступ в открывшемся браузере; в настройках MCP должен появиться зелёный индикатор и список инструментов.

### 6.3 Конфигурация `.cursor/mcp.json`

Официальный remote-сервер (основной вариант, секретов в файле нет — авторизация по OAuth):

```json
{
  "mcpServers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

Официальный desktop-сервер (если remote недоступен по политике организации):

```json
{
  "mcpServers": {
    "figma-desktop": {
      "url": "http://127.0.0.1:3845/mcp"
    }
  }
}
```

Community-альтернатива — **Framelink Figma Context MCP** (`figma-developer-mcp`). Работает на обычном Personal Access Token, то есть доступна и на бесплатном плане Figma; отдаёт упрощённое дерево макета, оптимизированное под контекст LLM:

```json
{
  "mcpServers": {
    "figma-context": {
      "command": "npx",
      "args": ["-y", "figma-developer-mcp", "--stdio"],
      "env": {
        "FIGMA_API_KEY": "${env:FIGMA_API_KEY}"
      }
    }
  }
}
```

Токен создаётся в Figma: *Settings → Security → Personal access tokens*, достаточно **read-only** на File content. Он **не коммитится**: `FIGMA_API_KEY` объявляется в `.env.example`, реальное значение живёт в локальном окружении разработчика (`~/.bashrc`, direnv или Cursor env), а `.cursor/mcp.json` подставляет его через `${env:...}`. Если после настройки прилетает `403`, первым делом проверить, нет ли второй, дублирующей конфигурации Figma MCP в глобальных настройках Cursor — она перехватывает вызов и не пробрасывает нужный ключ.

Полный MCP-набор проекта (Figma + Context7 + GitHub + Postgres read-only + Playwright) лежит в `.cursor/mcp.json`. Назначение серверов, секреты и fallback для РФ — в `AGENTS.md`. **Не** подключать второй Figma MCP и **не** подключать Prisma Cloud (`https://mcp.prisma.io/mcp`) — это hosted Prisma Postgres, не локальная БД.

### 6.4 Правила Cursor: `.cursor/rules/figma.mdc`

Правило нужно, чтобы агент не «додумывал» дизайн: без него на каждом запросе будут появляться произвольные `#3B82F6` и `p-[13px]`.

```mdc
---
description: Работа с макетом Figma как источником дизайн-токенов
globs: ["frontend/**/*.{ts,tsx,css}", "frontend/tailwind.config.ts"]
alwaysApply: false
---

# Figma как источник истины по дизайну

Макет: https://www.figma.com/design/jAGbP5vebc57s09dqcvqkV/Treyd-Crypto-Trading-App-UI-Kit--Community-
File key: `jAGbP5vebc57s09dqcvqkV`

## Порядок работы над UI-задачей
1. Если задача содержит ссылку на фрейм Figma (с `node-id`) — сначала получи данные
   узла через Figma MCP. Не начинай верстать, пока не увидел реальные значения.
2. Сверь найденные токены с `frontend/src/shared/config/design-tokens.json`.
   Токен есть → используй CSS-переменную. Токена нет → добавь его в
   `design-tokens.json`, перегенерируй CSS и только потом верстай.
3. Ассеты (иконки, изображения) скачивай инструментом MCP в
   `frontend/public/assets/`. НЕ вставляй base64 и НЕ придумывай пути к файлам.

## Жёсткие запреты
- НЕ хардкодить hex/rgb/hsl-цвета в компонентах — только `bg-background`,
  `text-muted-foreground`, `border-border` и т.п.
- НЕ использовать произвольные значения Tailwind (`p-[13px]`, `text-[15px]`),
  если в макете есть подходящий шаг шкалы. Расхождение с макетом — повод
  обновить токен, а не поставить магическое число.
- НЕ править файлы в `frontend/src/shared/ui/` под нужды одной фичи. Это
  shadcn-примитивы: их меняем только для приведения к токенам макета.
  Доменные обёртки создавай в `entities/*/ui/`.
- НЕ трогать `frontend/src/shared/api/generated/**` — это автоген.

## Соответствие Figma → код
| Figma                        | Код                                            |
|------------------------------|------------------------------------------------|
| Color styles                 | CSS-переменные в `src/app/globals.css`         |
| Text styles                  | `fontSize`/`lineHeight` в `tailwind.config.ts` |
| Corner radius                | `--radius` + шкала `borderRadius`              |
| Auto-layout gap / padding    | шкала `spacing` (кратно 4px)                   |
| Effects (shadow)             | шкала `boxShadow`                              |
| Component (Button, Card...)  | компонент shadcn в `src/shared/ui/`            |

## Тёмная тема
Макет тёмный по умолчанию. Значения светлой темы берутся из соответствующей
Figma-переменной режима (mode) и пишутся в `:root`, тёмные — в `.dark`.
```

Рядом лежит `.cursor/rules/frontend.mdc` с конвенциями FSD (направление импортов, запрет ручных API-типов) и `.cursor/rules/backend.mdc` (Controller не знает про Prisma, каждый эндпоинт декорирован Swagger). Разделение по файлам с разными `globs` — чтобы контекст не раздувался: правило про Figma не подгружается при работе над NestJS-сервисом.

### 6.5 Выгрузка дизайн-токенов в Tailwind/shadcn

Пайплайн из трёх шагов, повторяемый при любом изменении макета:

```mermaid
flowchart LR
    F["Figma<br/>variables + styles"] -->|"Figma MCP<br/>(агент в Cursor)"| J["shared/config/<br/>design-tokens.json"]
    J -->|"npm run tokens:build<br/>(scripts/figma-tokens.ts)"| C["app/globals.css<br/>CSS-переменные"]
    J --> T["tailwind.config.ts<br/>spacing / radius / fontSize"]
    C --> S["shadcn/ui<br/>shared/ui/*"]
    T --> S
    S --> W["widgets / features"]
```

**Шаг 1 — извлечение.** Запрос агенту в Cursor: «Через Figma MCP собери все color variables, text styles, corner radius и spacing из файла `jAGbP5vebc57s09dqcvqkV` и обнови `frontend/src/shared/config/design-tokens.json`». Результат — плоский, ревьюабельный JSON (диффы в PR читаемы, в отличие от прямой генерации CSS):

```json
{
  "$meta": { "figmaFileKey": "jAGbP5vebc57s09dqcvqkV", "syncedAt": "2026-08-28T12:00:00Z" },
  "color": {
    "dark": {
      "background": "#0B0E11", "foreground": "#EAECEF",
      "card": "#161A1E", "border": "#2B3139",
      "primary": "#F0B90B", "primary-foreground": "#0B0E11",
      "muted": "#1E2329", "muted-foreground": "#848E9C",
      "chart-up": "#0ECB81", "chart-down": "#F6465D"
    },
    "light": { "background": "#FFFFFF", "foreground": "#1E2329", "...": "..." }
  },
  "radius": { "base": "8px", "sm": "4px", "lg": "12px" },
  "spacing": { "unit": "4px", "steps": [0, 1, 2, 3, 4, 6, 8, 12, 16, 20, 24] },
  "typography": {
    "display": { "size": "32px", "lineHeight": "40px", "weight": 600 },
    "body":    { "size": "14px", "lineHeight": "20px", "weight": 400 },
    "mono-price": { "size": "13px", "lineHeight": "18px", "weight": 500, "family": "JetBrains Mono" }
  }
}
```

**Шаг 2 — генерация CSS-переменных.** `scripts/figma-tokens.ts` (`npm run tokens:build`) переводит hex в формат, который ожидает shadcn, и пишет блок между маркерами в `globals.css` — руками этот блок не правят:

```css
/* src/app/globals.css */
@layer base {
  /* figma-tokens:start — сгенерировано, не редактировать */
  :root {
    --background: 0 0% 100%;
    --foreground: 213 15% 13%;
    --card: 0 0% 100%;
    --border: 216 12% 84%;
    --primary: 45 89% 49%;
    --primary-foreground: 213 33% 6%;
    --muted-foreground: 214 11% 56%;
    --chart-up: 157 88% 42%;
    --chart-down: 351 91% 62%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 213 33% 6%;
    --foreground: 213 16% 90%;
    --card: 213 14% 10%;
    --border: 213 15% 20%;
    /* ... */
  }
  /* figma-tokens:end */
}
```

**Шаг 3 — подключение к Tailwind.** `tailwind.config.ts` не содержит цветов-литералов, только ссылки на переменные, плюс шкалы из того же JSON:

```ts
import tokens from './src/shared/config/design-tokens.json';

export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        border: 'hsl(var(--border))',
        chart: { up: 'hsl(var(--chart-up))', down: 'hsl(var(--chart-down))' },
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
      },
      fontSize: Object.fromEntries(
        Object.entries(tokens.typography).map(([k, v]) => [k, [v.size, { lineHeight: v.lineHeight }]]),
      ),
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
```

**Почему цвета именно как HSL-каналы без обёртки `hsl()`.** Это конвенция shadcn/ui: значение переменной — «213 33% 6%», а обёртка добавляется в конфиге. Так работает `bg-primary/50` — Tailwind подставляет альфа-канал в `hsl(var(--primary) / 0.5)`. Если положить в переменную готовый `#0B0E11`, модификаторы прозрачности перестают работать. (На Tailwind v4 те же переменные подключаются через `@theme inline` в CSS вместо `tailwind.config.ts` — пайплайн шагов 1–2 не меняется.)

**Использование цветов графика.** `lightweight-charts` — canvas, Tailwind-классы к нему не применяются, поэтому токены читаются из CSS:

```ts
// widgets/candle-chart/lib/chart-theme.ts
const css = getComputedStyle(document.documentElement);
const hsl = (name: string) => `hsl(${css.getPropertyValue(name).trim()})`;

export const chartTheme = {
  upColor: hsl('--chart-up'),
  downColor: hsl('--chart-down'),
  background: hsl('--background'),
  gridColor: hsl('--border'),
};
```

Так график автоматически соответствует теме и любому обновлению токенов из Figma — второго места, где живут цвета, не появляется.

**Дисциплина синхронизации.** Изменение токенов идёт отдельным PR с диффом `design-tokens.json` + перегенерированного `globals.css`. В CI шаг `npm run tokens:check` перегенерирует CSS и падает, если результат отличается от закоммиченного — так расхождение «поправили CSS руками, забыли про JSON» отлавливается автоматически.

---

## 7. API-контракты

### 7.1 REST-эндпоинты

Base URL: `/api/v1` (кроме `/health` и `/docs`). Все ответы — JSON. Денежные значения передаются **строками**, чтобы не терять точность `Decimal` при сериализации.

| Метод | Путь | Auth | Query / Body | Response 200 | Ошибки |
|---|---|---|---|---|---|
| `POST` | `/auth/register` | — | `{ email, password }` | `{ user: UserDto, accessToken }` + refresh cookie | 400, 409 (email занят), 429 |
| `POST` | `/auth/login` | — | `{ email, password }` | `{ user: UserDto, accessToken }` + refresh cookie | 400, 401, 429 (3/мин) |
| `POST` | `/auth/refresh` | refresh cookie | — | `{ accessToken }` | 401 |
| `POST` | `/auth/logout` | Bearer | — | `204` | 401 |
| `GET` | `/auth/me` | Bearer | — | `UserDto` | 401 |
| `GET` | `/symbols` | — | `search?`, `active?=true`, `limit?=50`, `offset?=0` | `{ items: SymbolDto[], total: number }` | 400 |
| `GET` | `/symbols/:ticker` | — | — | `SymbolDto` | 404 |
| `GET` | `/candles` | — | `symbol` (req), `interval` (req: `M30\|H4\|D4`), `from?`, `to?`, `limit?=500` (1..1000) | `{ symbol, interval, items: CandleDto[], stale: boolean }` | 400, 404, 429 |
| `GET` | `/candles/latest` | — | `symbol` (req), `interval` (req) | `CandleDto` | 400, 404 |
| `POST` | `/candles/sync` | Bearer + `ADMIN` | `{ symbol, days }` | `{ inserted, skipped }` | 401, 403, 429, 503 |
| `GET` | `/health` | — | — | `{ status, info, details }` | 503 (БД недоступна) |
| `GET` | `/docs` | — | — | Swagger UI | — |
| `GET` | `/docs-json` | — | — | OpenAPI 3 JSON — вход для генератора клиента | — |

**Ключевые DTO:**

```ts
// CandleDto
{ openTime: '2026-08-28T12:00:00.000Z', open: '64250.10000000', high: '64980.55000000',
  low: '64100.00000000', close: '64870.25000000', volume: '1245.33000000' }

// SymbolDto
{ ticker: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin', vsCurrency: 'usd',
  isActive: true, lastSyncedAt: '2026-08-28T12:00:00.000Z' }

// ErrorResponseDto (единый формат от AllExceptionsFilter)
{ statusCode: 404, code: 'SYMBOL_NOT_FOUND', message: 'Symbol DOGE2 not found',
  path: '/api/v1/candles', requestId: '01JG7X...', timestamp: '2026-08-28T12:00:00.000Z' }
```

Поле `stale: true` в ответе `/candles` означает, что CoinGecko недоступен (circuit breaker open) и данные отданы из БД без свежей синхронизации — UI показывает бейдж «данные могут быть устаревшими» вместо ошибки.

### 7.2 WebSocket-события

Namespace `/ws/candles`, транспорт socket.io. Auth (опционально): `io(url, { auth: { token } })`.

| Направление | Событие | Payload | Примечание |
|---|---|---|---|
| C → S | `subscribe` | `{ symbol: 'BTC', interval: 'H4' }` | Ack: `{ ok: true, room: 'BTC:H4' }`; сразу после — `candle:snapshot` |
| C → S | `unsubscribe` | `{ symbol: 'BTC', interval: 'H4' }` | Ack: `{ ok: true }` |
| C → S | `pong` | `{ ts: 1756382400000 }` | Ответ на `server:heartbeat` |
| S → C | `candle:snapshot` | `{ symbol, interval, candles: CandleDto[] }` | Последние 500 свечей на входе в room |
| S → C | `candle:update` | `{ symbol, interval, candle: CandleDto, isClosed: boolean }` | `isClosed: false` → та же свеча обновилась; `true` → закрылась, начинается новая |
| S → C | `server:heartbeat` | `{ ts: 1756382400000, serverTime: '2026-08-28T12:00:00.000Z' }` | Каждые 30s |
| S → C | `error` | `{ code, message }` | `INVALID_PAYLOAD \| INVALID_SYMBOL \| UNAUTHORIZED \| RATE_LIMITED` |

Контракт описан один раз в `backend/src/modules/ws-gateway/events.contract.ts` и продублирован на фронте в `shared/api/ws.ts` — с обязательной рантайм-валидацией входящих payload'ов через Zod (OpenAPI это не покрывает, доверять структуре нельзя):

```ts
export interface ServerToClientEvents {
  'candle:snapshot': (p: CandleSnapshotPayload) => void;
  'candle:update':   (p: CandleUpdatePayload) => void;
  'server:heartbeat': (p: HeartbeatPayload) => void;
  'error': (p: WsErrorPayload) => void;
}
export interface ClientToServerEvents {
  subscribe:   (p: SubscribePayload, ack: (r: SubscribeAck) => void) => void;
  unsubscribe: (p: SubscribePayload, ack: (r: { ok: boolean }) => void) => void;
  pong:        (p: { ts: number }) => void;
}
```

Типизация `Server<ClientToServerEvents, ServerToClientEvents>` и `Socket<...>` на клиенте даёт проверку имён событий и payload'ов компилятором с обеих сторон.

### 7.3 Генерация клиента через @hey-api/openapi-ts

**Конфиг:**

```ts
// frontend/openapi-ts.config.ts
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: process.env.OPENAPI_INPUT ?? 'http://localhost:3001/docs-json',
  output: {
    path: './src/shared/api/generated',
    format: 'prettier',
    lint: 'eslint',
  },
  plugins: [
    '@hey-api/client-fetch',                        // fetch-клиент, без axios
    '@hey-api/sdk',                                 // типизированные функции по операциям
    { name: '@hey-api/typescript', enums: 'javascript' },
    '@tanstack/react-query',                        // queryOptions / mutationOptions / queryKey
  ],
});
```

**Процесс генерации:**

```mermaid
flowchart LR
    DTO["NestJS DTO<br/>+ @ApiProperty"] -->|"SwaggerModule<br/>.createDocument"| SPEC["openapi.json<br/>GET /docs-json"]
    SPEC -->|"npm run api:generate<br/>@hey-api/openapi-ts"| GEN["shared/api/generated/<br/>types.gen.ts, sdk.gen.ts,<br/>@tanstack/react-query.gen.ts"]
    GEN --> USE["useQuery(getCandlesOptions(...))"]
    SPEC -.->|"CI: diff-check"| FAIL["fail при расхождении"]
```

1. **Источник.** Локально — живой backend на `http://localhost:3001/docs-json`. В CI backend не поднимается: скрипт `npm run openapi:export` в `backend/` создаёт приложение через `NestFactory.create` без `listen()`, вызывает `SwaggerModule.createDocument` и пишет `backend/openapi.json`. Файл передаётся между job'ами как артефакт, фронтенд генерирует клиент из него (`OPENAPI_INPUT=../backend/openapi.json`).
2. **Генерация.** `npm run api:generate` в `frontend/`. Создаётся `types.gen.ts` (типы всех схем), `sdk.gen.ts` (функция на операцию), `@tanstack/react-query.gen.ts` (`getCandlesOptions`, `getCandlesQueryKey`, `postAuthLoginMutation`).
3. **Гит.** `src/shared/api/generated/**` в `.gitignore`; генерация — обязательный шаг `prebuild` и `predev`. Артефакты сборки не ревьюятся и не конфликтуют при мерже.
4. **Проверка в CI.** После генерации `tsc --noEmit`: если backend поменял контракт несовместимо (переименовал поле, ужесточил enum), фронтенд-сборка падает на этом коммите — а не в рантайме у пользователя. Это главная причина выбрать генерацию вместо ручного клиента.
5. **Runtime-настройка** — единственный написанный руками файл в `shared/api/`:

```ts
// shared/api/client.ts
import { client } from './generated/client.gen';
import { env } from '@/shared/config/env';

client.setConfig({ baseUrl: env.NEXT_PUBLIC_API_URL, credentials: 'include' });
client.interceptors.request.use((req) => {
  const token = getAccessToken();
  if (token) req.headers.set('Authorization', `Bearer ${token}`);
  return req;
});
client.interceptors.response.use(async (res) => {
  if (res.status === 401) await refreshAndRetry();   // один retry через /auth/refresh
  return res;
});
```

**Использование:**

```tsx
// widgets/candle-chart/ui/CandleChart.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { getCandlesOptions } from '@/shared/api/generated/@tanstack/react-query.gen';

export function CandleChart({ symbol, interval }: Props) {
  const { data, isPending } = useQuery({
    ...getCandlesOptions({ query: { symbol, interval, limit: 500 } }),
    staleTime: 30_000,
  });
  // data типизирован из OpenAPI-спеки: опечатка в data.items[0].clos — ошибка компиляции
}
```

```tsx
// app/dashboard/[symbol]/page.tsx — prefetch в Server Component
const qc = new QueryClient();
await qc.prefetchQuery(getCandlesOptions({ query: { symbol, interval: 'H4', limit: 500 } }));
return <HydrationBoundary state={dehydrate(qc)}><DashboardPage /></HydrationBoundary>;
```

Один и тот же `getCandlesOptions` используется на сервере для prefetch и на клиенте в `useQuery` — ключи гарантированно совпадают, поэтому гидрация не вызывает повторный запрос.

**Почему @hey-api/openapi-ts, а не ручной API-клиент.** Ручной клиент — это второе, независимое описание того же контракта, и главная проблема не в трудозатратах на его написание, а в том, что расхождение с backend'ом ничем не детектируется: переименованное в DTO поле компилируется на фронте без ошибок и падает в рантайме у пользователя. Генерация делает спеку единственным источником истины и переносит поломку контракта на этап `tsc` в CI. Дополнительно снимаются рутинные слои, которые в ручном варианте пишутся и поддерживаются вручную: типы схем, функции на каждую операцию, `queryOptions`/`mutationOptions` и — критично — консистентные query keys, где ручная опечатка приводит к молча не сработавшей инвалидации кэша. Из альтернатив: `openapi-typescript` даёт только типы, а вызовы всё равно писать руками; `orval` сопоставим по функциональности, но hey-api имеет более простую плагинную модель, официальный плагин TanStack Query и не тянет axios. Ограничение генерации — качество клиента равно качеству спеки, поэтому полнота Swagger-декораторов на backend'е из «хорошей практики» становится жёстким требованием (см. 4.7).

---

## 8. План реализации MVP (6 недель)

### Неделя 1 — Backend-каркас: NestJS + Prisma + REST + Swagger

| # | Задача | Deliverable |
|---|---|---|
| 1.1 | `nest new backend`, strict TS, ESLint + Prettier, структура `common/`, `config/`, `modules/` | Репозиторий, `npm run start:dev` поднимается |
| 1.2 | `ConfigModule` + Zod-валидация env (fail-fast на старте) | Старт падает с внятным сообщением при отсутствии `DATABASE_URL` |
| 1.3 | PostgreSQL в Docker, `schema.prisma` (User, Symbol, Candle), первая миграция, `seed.ts` на 5 символов | `prisma migrate dev` + `prisma db seed` проходят; таблицы с индексами |
| 1.4 | `PrismaModule`/`PrismaService` с lifecycle-хуками | Соединение открывается/закрывается корректно |
| 1.5 | `SymbolsModule`: Controller → Service → Repository, `GET /symbols`, `GET /symbols/:ticker` | Роуты отдают данные из seed |
| 1.6 | `CandlesModule`: `GET /candles`, `GET /candles/latest`, DTO + class-validator, глобальный `ValidationPipe` (`whitelist`, `transform`) | Невалидный запрос → 400 с перечнем полей; лишние поля отбрасываются |
| 1.7 | Swagger: `DocumentBuilder`, декораторы + примеры на всех роутах, `jsonDocumentUrl: 'docs-json'` | `/docs` открывается, `/docs-json` отдаёт валидный OpenAPI 3 |
| 1.8 | Скрипт `openapi:export` (спека без `listen()`) | `backend/openapi.json` генерируется одной командой |

**Итог недели:** работающий REST API на данных из БД с полной Swagger-спекой — фронт может стартовать на моках спеки.

### Неделя 2 — CoinGecko: интеграция, кэш, rate limiting, backfill

| # | Задача | Deliverable |
|---|---|---|
| 2.1 | `CoinGeckoClient`: timeout 8s, retry 3x с backoff+jitter только на 429/5xx, header `x-cg-demo-api-key` | Unit-тесты на `nock`: retry срабатывает, 4xx не ретраится |
| 2.2 | `CoinGeckoAdapter`: маппинг `[ts,o,h,l,c]` → `Candle`, Zod-валидация внешнего ответа, маппинг `days` → `CandleInterval` | Битый payload → внятная ошибка, не `undefined` в БД |
| 2.3 | `CoinGeckoCache`: `Map` с TTL 60s + single-flight | Тест: 10 параллельных вызовов → 1 внешний запрос |
| 2.4 | Token bucket 50 req/min + учёт `Retry-After` + circuit breaker (5 ошибок → open 60s) | Тест: превышение лимита ставит вызовы в очередь, а не роняет |
| 2.5 | `@nestjs/throttler`: три уровня (`short`/`medium`/`long`), глобальный guard, `trust proxy` | Флуд на `/candles` → 429 с `Retry-After` |
| 2.6 | `CandleSyncScheduler` (cron 60s) для символов с активными подписчиками, bulk upsert | Свечи в БД обновляются, логи синхронизации в Pino |
| 2.7 | CLI `scripts/backfill.ts`: `--symbols`, `--days`, `--all`, `--dry-run`, `--resume`, отчёт, exit code | `npm run backfill -- --all --days=365` наполняет БД; повторный прогон не создаёт дублей |
| 2.8 | Graceful degradation: флаг `stale` в ответе при open circuit breaker | При недоступном CoinGecko `/candles` отдаёт 200 + `stale: true` |

**Итог недели:** БД наполнена реальной историей, свечи обновляются автоматически, квота CoinGecko под контролем.

### Неделя 3 — Auth (JWT) + WebSocket-шлюз

| # | Задача | Deliverable |
|---|---|---|
| 3.1 | `AuthModule`: register/login на argon2, `POST /auth/register`, `POST /auth/login` | Пароли хранятся хэшами, e2e-тест регистрации и входа |
| 3.2 | JWT: access 15m (Bearer) + refresh 7d (httpOnly cookie, hash в `User.refreshHash`), `POST /auth/refresh`, `POST /auth/logout` | Ротация и отзыв refresh-токена работают |
| 3.3 | `JwtStrategy`, `JwtAuthGuard` глобально через `APP_GUARD`, декораторы `@Public()`, `@CurrentUser()` | Deny-by-default: новый роут без `@Public()` требует токен |
| 3.4 | `RolesGuard` + `@Roles(ADMIN)`, `POST /candles/sync` | Не-админ получает 403 |
| 3.5 | `@Throttle` 3/мин на `/auth/login`, Swagger `addBearerAuth` | Брутфорс → 429; в Swagger UI работает кнопка Authorize |
| 3.6 | `CandlesGateway` на socket.io: namespace `/ws/candles`, `subscribe`/`unsubscribe`, rooms `TICKER:INTERVAL`, `candle:snapshot` | Клиент подписывается и сразу получает последние 500 свечей |
| 3.7 | Broadcast `candle:update` из scheduler'а; счётчик подписчиков управляет синхронизацией | Символ без подписчиков не тратит квоту CoinGecko |
| 3.8 | Heartbeat: `pingInterval: 30000`/`pingTimeout: 10000` + прикладной `server:heartbeat` каждые 30s; закрытие сокета после 2 пропущенных `pong` | Тест: соединение живёт >2 мин без активности, мёртвый клиент отваливается |
| 3.9 | `handleDisconnect`: выход из rooms, очистка состояния; `WsJwtGuard`; `events.contract.ts` | Нет утечки состояния при 100 циклах connect/disconnect |

**Итог недели:** авторизация и live-канал готовы, WS-контракт зафиксирован.

### Неделя 4 — Frontend: Next.js + FSD + shadcn + TanStack Query + графики + Figma MCP

| # | Задача | Deliverable |
|---|---|---|
| 4.1 | `create-next-app` (App Router, TS), FSD-каталоги, alias `@/*`, ESLint `boundaries` на направление импортов | Нарушение слоёв (`shared` → `features`) ломает lint |
| 4.2 | Tailwind + shadcn init (`components.json` с alias на `shared/ui`), базовые компоненты | `npx shadcn add button card select` кладёт файлы в `shared/ui/` |
| 4.3 | Zod-валидация env (`shared/config/env.ts`) | Отсутствующий `NEXT_PUBLIC_API_URL` ломает `next build` |
| 4.4 | `.cursor/mcp.json` с Figma MCP + `.cursor/rules/figma.mdc`, проверка доступа к макету из Cursor | Агент читает узлы макета; правила запрещают хардкод цветов |
| 4.5 | Выгрузка токенов через MCP → `design-tokens.json`, `scripts/figma-tokens.ts` → CSS-переменные, маппинг в `tailwind.config.ts` | `npm run tokens:build` обновляет `globals.css`; тёмная тема из макета работает |
| 4.6 | `openapi-ts.config.ts`, `npm run api:generate`, `predev`/`prebuild` хуки, `shared/api/client.ts` с auth-интерцептором | Клиент генерируется из `/docs-json`, `generated/` в `.gitignore` |
| 4.7 | `QueryClientProvider` с дефолтами (`staleTime` 30s, retry без 4xx), dev-tools | Провайдеры в `app/providers/` |
| 4.8 | `widgets/candle-chart` на lightweight-charts: Client Component, `useQuery(getCandlesOptions(...))`, тема графика из CSS-переменных | График рисует историю BTC/H4 в цветах макета |
| 4.9 | `features/subscribe-candles`: socket.io-client, Zod-валидация payload, `setQueryData` на `candle:update`, реконнект + `invalidateQueries` | График обновляется live; после разрыва сети gap закрывается |
| 4.10 | `pages/dashboard` + `app/dashboard/[symbol]/page.tsx`: Server Component с `prefetchQuery` + `HydrationBoundary`; `features/select-timeframe` с синхронизацией в URL | SSR отдаёт готовый график без клиентского фетча; таймфрейм шарится ссылкой |
| 4.11 | `widgets/symbol-list`, `market-header`, `features/auth-login` (react-hook-form + zodResolver) | Полный UI-флоу: логин → выбор символа → график |

**Итог недели:** end-to-end работающее приложение с дизайном из макета.

### Неделя 5 — Тесты, CI/CD, health-check, логирование

| # | Задача | Deliverable |
|---|---|---|
| 5.1 | `nestjs-pino`: JSON в prod, `pino-pretty` в dev, `x-request-id`, redaction секретов, игнор `/health` | Логи коррелируются по `requestId` |
| 5.2 | `AllExceptionsFilter`: единый формат ошибок, маппинг Prisma-кодов (P2002→409, P2025→404), сокрытие внутренних деталей | Все ошибки в формате `ErrorResponseDto` |
| 5.3 | `GET /health` на `@nestjs/terminus`: `SELECT 1` через Prisma, статус circuit breaker (не критичный), heap | 200 при живой БД, 503 при мёртвой; CoinGecko down не даёт 503 |
| 5.4 | Backend unit-тесты: сервисы, адаптер, кэш, auth (`nock` вместо реальных вызовов) | Покрытие ≥80% по `modules/` и `integrations/` |
| 5.5 | Backend e2e (Supertest) + integration на Testcontainers | Проверены 200/400/401/403/404/429 и идемпотентность upsert |
| 5.6 | WS-тесты: `subscribe` → snapshot, heartbeat, disconnect-очистка | Зелёные тесты на реальном `app.listen()` |
| 5.7 | Vitest + RTL + MSW: компоненты, хуки, схемы; мок `lightweight-charts` | Покрытие ≥70% по `widgets/`, `features/`, `entities/` |
| 5.8 | `.github/workflows/backend.yml`: lint → test (сервис postgres) → build, кэш npm, path-filter, артефакт `openapi.json` | PR не мержится с красным CI |
| 5.9 | `.github/workflows/frontend.yml`: lint → generate client (из артефакта спеки) → `tsc --noEmit` → test → build; шаг `tokens:check` | Несовместимое изменение контракта ломает сборку фронта |

**Итог недели:** качество зафиксировано автоматикой, приложение наблюдаемо.

### Неделя 6 — Docker, деплой на VPS, README, полировка

| # | Задача | Deliverable |
|---|---|---|
| 6.1 | Multi-stage `backend/Dockerfile` (deps → build → runtime на alpine, non-root, `prisma generate`, `dumb-init`) | Образ <200 MB, стартует с `migrate deploy` |
| 6.2 | `frontend/Dockerfile` c `output: 'standalone'`, копирование `.next/standalone` и `static` | Образ <150 MB, без `node_modules` в рантайме |
| 6.3 | `docker-compose.yml` (dev: postgres + backend + frontend, volume для БД, healthchecks, `depends_on: service_healthy`) | `docker compose up` поднимает всё одной командой |
| 6.4 | `docker-compose.prod.yml`: образы из registry (Selectel CR, GHCR — запасной), `restart: unless-stopped`, лимиты ресурсов, Caddy как reverse proxy с авто-TLS | Прод-конфиг отличается от dev только этим файлом |
| 6.5 | `.env.example` со всеми переменными и комментариями | Новый разработчик стартует по README без вопросов |
| 6.6 | `.github/workflows/deploy.yml`: build+push в registry (Selectel CR / GHCR) по тегу, ssh-деплой, `migrate deploy`, smoke-тест `/health`, откат при неуспехе | Деплой одной кнопкой, откат на предыдущий тег |
| 6.7 | Подготовка VPS (Selectel): ufw, ssh-hardening, docker + зеркало Docker Hub (`daemon.json`), non-root deploy-пользователь, `pg_dump` в cron → Selectel Object Storage | Сервер воспроизводим по чеклисту из раздела 10 |
| 6.8 | Корневой `README.md`: быстрый старт, структура, команды, троблшутинг; ссылка на `ARCHITECTURE.md` и макет | Онбординг с нуля ≤15 минут |
| 6.9 | Полировка: loading-скелетоны, empty/error states, бейдж `stale`, адаптив по макету, Lighthouse ≥90 | Приложение выглядит и ведёт себя завершённо |

**Итог недели:** приложение в продакшне на своём домене, с CI/CD и документацией.

**Критерии готовности MVP:** график BTC/ETH/SOL рисуется на трёх таймфреймах; live-обновления приходят по WS и переживают разрыв сети; регистрация/логин работают; `/health` зелёный; CI гоняет lint+test+build на каждом PR; деплой автоматизирован; при недоступном CoinGecko приложение продолжает работать на данных БД.

---

## 9. Обоснования ключевых решений

### 9.1 Почему монолит, а не микросервисы

Микросервисы решают организационные и масштабные проблемы, которых у нас нет: независимые релизные циклы разных команд и раздельное масштабирование частей с принципиально разной нагрузкой. У Trading Dashboard одна команда, один релизный цикл и один узкий профиль нагрузки — чтение свечей по индексу. Разрезав это на `auth-service`, `candles-service` и `ws-service`, мы бы обменяли вызов метода в процессе на сетевой вызов с собственными таймаутами, ретраями, распределённой трассировкой и eventual consistency между сервисами — платя эту цену без единой выгоды взамен. Дополнительно: WS-шлюзу нужен доступ к тем же свечам, что и REST-контроллеру, и в монолите это один `CandlesService`; в микросервисной версии это либо дублирование логики, либо синхронный вызов между сервисами на горячем пути.

При этом модульная структура NestJS удерживает границы домена явными, поэтому если `candles` когда-нибудь понадобится выделить, это будет вынос уже изолированного модуля, а не распутывание клубка. Реальный порог для пересмотра: несколько инстансов backend (тогда сначала появится Redis для кэша и WS-адаптера) или отдельный воркер под тяжёлый backfill.

### 9.2 Почему NestJS, а не Express/Fastify

| Критерий | NestJS | Express / Fastify |
|---|---|---|
| Структура | Навязана фреймворком: модули, DI, слои | Своя на каждом проекте, размывается со временем |
| DI | Из коробки, тестируемость через подмену провайдеров | Руками или сторонний контейнер |
| Валидация | `ValidationPipe` + DTO как единственное описание входа | Middleware, схема отдельно от типов |
| Swagger | `@nestjs/swagger` читает те же DTO → спека не расходится с кодом | Отдельный YAML/JSON, поддерживается вручную |
| WebSocket | `@nestjs/websockets` в той же DI-системе | Отдельная интеграция и своя мостовая логика |
| Rate limit / cron / health | Официальные модули `throttler`, `schedule`, `terminus` | Сборка из независимых пакетов |

Ключевой для нас пункт — третий и четвёртый: генерация фронтового клиента (раздел 7.3) построена на том, что Swagger-спека автоматически выводится из DTO, которые уже используются для валидации. На Express пришлось бы поддерживать спеку вручную, и она бы неизбежно разошлась с реальностью — а вместе с ней сломался бы весь смысл кодогенерации. NestJS платит за это накладными расходами на декораторы и более крутой кривой входа; для команды, знакомой с Angular-подобным DI, это несущественно, а Fastify при необходимости подключается как адаптер под тем же NestJS.

### 9.3 Почему Prisma, а не TypeORM

См. развёрнутое обоснование в разделе 4.3. Коротко:

| Критерий | Prisma | TypeORM |
|---|---|---|
| Источник истины | Одна декларативная `schema.prisma` | Декораторы, размазанные по классам-сущностям |
| Типизация результата | Структурная: `select`/`include` меняют тип, неподгруженное поле — ошибка компиляции | Relations как «возможно загружено», рантайм-`undefined` |
| Миграции | SQL-дифф в репозитории, ревьюабельный и воспроизводимый | `synchronize: true` как ловушка; генерация требует соединения и шумит |
| Стиль | Один способ (Data Mapper через клиент) | Active Record и Data Mapper конкурируют |
| Bulk-операции | `createMany({ skipDuplicates })`, `upsert` по композитному PK | Есть, но менее предсказуемо типизированы |
| Слабое место | Сложный динамический SQL → `$queryRaw` | Гибче в экзотических запросах |

Наш профиль (диапазонные выборки по индексу + идемпотентный bulk upsert) полностью попадает в сильную сторону Prisma.

### 9.4 Почему TanStack Query, а не Zustand для серверных данных

См. раздел 5.2. Сводно:

| Задача кэша серверных данных | TanStack Query | Zustand |
|---|---|---|
| Дедупликация одновременных запросов | Встроено | Пишем сами |
| Staleness + фоновая ревалидация | `staleTime`, `refetchOnWindowFocus`/`OnReconnect` | Сами |
| Retry с backoff, без ретрая 4xx | Конфигом | Сами |
| Отмена устаревших ответов (race при быстром переключении) | Встроено | Сами, с риском применить старый ответ |
| SSR: dehydrate/hydrate | Встроено, ключи совпадают с prefetch | Сами |
| Инвалидация после мутаций | `invalidateQueries` по типизированным ключам | Сами |
| Кодогенерация хуков из OpenAPI | Плагин `@tanstack/react-query` в hey-api | Отсутствует |

Zustand не «хуже» — он про другое. В проекте он остаётся для чисто клиентского UI-стейта (тема, открытые панели, включённые оверлеи графика), где нет сервера и нечего ревалидировать. Смешивать роли (класть свечи в Zustand) значит переписать TanStack Query руками и хуже.

### 9.5 Почему FSD без Atomic Design

См. раздел 5.1. Три причины:

1. **Уровни atoms/molecules уже закрыты.** shadcn/ui поставляет примитивы (`Button`, `Card`, `Select`, `Dialog`) через CLI прямо в `shared/ui/`. Заводить над ними собственную классификацию по гранулярности — переупаковывать чужую библиотеку.
2. **Atomic Design не отвечает на главный вопрос проекта** — куда девать доменную логику. Спор «molecule или organism?» не имеет технических последствий и не проверяется инструментом. FSD режет по бизнес-смыслу, и его границы enforce'ятся ESLint (`eslint-plugin-boundaries`): нарушение направления импортов ломает CI.
3. **Две методологии = два дерева каталогов.** Появляется постоянный вопрос «`features/` или `organisms/`?» и, как следствие, дрейф: одинаковые по смыслу компоненты расходятся по разным местам.

Единственное, что мы берём из Atomic Design по духу — дисциплину «примитивы не знают о домене»: файлы в `shared/ui/` не правятся под конкретную фичу, доменные обёртки живут в `entities/*/ui/`.

### 9.6 Почему @hey-api/openapi-ts, а не ручной API-клиент

См. раздел 7.3. Сводно:

| Аспект | Генерация | Ручной клиент |
|---|---|---|
| Источник истины контракта | Один (OpenAPI-спека NestJS) | Два, расходятся молча |
| Обнаружение поломки контракта | `tsc --noEmit` в CI на том же коммите | Рантайм у пользователя |
| Типы схем, функции операций | Генерируются | Пишутся и поддерживаются руками |
| `queryOptions` / `mutationOptions` | Генерируются | Руками |
| Query keys | Генерируются, консистентны | Руками; опечатка = молча не сработавшая инвалидация |
| Стоимость нового эндпоинта | `npm run api:generate` | Типы + функция + хук + ключ |
| Ограничение | Клиент не лучше спеки → полнота Swagger обязательна | Полный контроль |

Из альтернатив: `openapi-typescript` даёт только типы (вызовы всё равно руками), `orval` близок по возможностям, но у hey-api проще плагинная модель, есть официальный плагин TanStack Query и нет зависимости от axios.

---

## 10. Инфраструктура

### 10.1 Docker

**`backend/Dockerfile`** — multi-stage:

```dockerfile
# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init && addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/package.json ./
USER app
EXPOSE 3001
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

`dumb-init` — чтобы `SIGTERM` доходил до Node и `enableShutdownHooks()` успевал закрыть соединения Prisma и WS. `prisma migrate deploy` при старте (а не отдельным job'ом) допустимо при единственном инстансе; при масштабировании миграции выносятся в отдельный шаг деплоя.

**`frontend/Dockerfile`** — standalone output (`next.config.mjs`: `output: 'standalone'`):

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# openapi.json кладётся в build-контекст заранее (CI: артефакт из backend-job;
# локально: npm run openapi:export в backend/). Live-сервер на этапе сборки не нужен.
ENV OPENAPI_INPUT=./openapi.json
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
RUN npm run api:generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

Важно: `NEXT_PUBLIC_*` инлайнятся в бандл **на этапе сборки**, поэтому передаются через `ARG`/`--build-arg`, а не через `environment` в рантайме.

**`docker-compose.yml`** (три сервиса):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  backend:
    build: { context: ./backend }
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      COINGECKO_API_KEY: ${COINGECKO_API_KEY}
      CORS_ORIGIN: ${CORS_ORIGIN}
    depends_on:
      postgres: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/health"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s
    ports: ["3001:3001"]
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
        NEXT_PUBLIC_WS_URL: ${NEXT_PUBLIC_WS_URL}
    depends_on:
      backend: { condition: service_healthy }
    ports: ["3000:3000"]
    restart: unless-stopped

volumes:
  pgdata:
```

В `docker-compose.prod.yml` добавляется Caddy как reverse proxy (авто-TLS от Let's Encrypt), порты backend/frontend закрываются наружу, образы берутся из registry (Selectel CR — основной для РФ, GHCR — запасной) по тегу.

### 10.2 `.env.example`

```dotenv
# ─── PostgreSQL ────────────────────────────────────────────────────────────────
POSTGRES_USER=trading
POSTGRES_PASSWORD=change_me_strong_password
POSTGRES_DB=trading_dashboard
# Строка подключения для Prisma. В docker-compose host = имя сервиса (postgres),
# при локальном запуске backend вне контейнера — localhost:5432
DATABASE_URL=postgresql://trading:change_me_strong_password@localhost:5432/trading_dashboard?schema=public

# ─── Backend ───────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3001
# Разрешённые origin для CORS, через запятую. В прод — только реальный домен
CORS_ORIGIN=http://localhost:3000
# Уровень Pino: fatal|error|warn|info|debug|trace
LOG_LEVEL=debug

# ─── JWT ───────────────────────────────────────────────────────────────────────
# Два РАЗНЫХ секрета, минимум 32 байта: openssl rand -base64 48
JWT_ACCESS_SECRET=change_me_access_secret_min_32_chars
JWT_REFRESH_SECRET=change_me_refresh_secret_min_32_chars
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# ─── CoinGecko ─────────────────────────────────────────────────────────────────
COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
# Demo-ключ (бесплатный, coingecko.com/en/api/pricing). Без ключа лимит 5–15 req/min
# с шэрингом по IP; с Demo-ключом — 100 req/min
COINGECKO_API_KEY=
# Внутренний лимитер: держим ниже квоты плана
COINGECKO_RATE_LIMIT_PER_MIN=50
# TTL in-memory кэша ответов, мс
COINGECKO_CACHE_TTL_MS=60000
# Период cron-синхронизации свечей, мс
CANDLE_SYNC_INTERVAL_MS=60000

# ─── Frontend (инлайнятся в бандл на этапе сборки!) ───────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_WS_URL=http://localhost:3001
NEXT_PUBLIC_DEFAULT_SYMBOL=BTC

# ─── Кодогенерация API-клиента ────────────────────────────────────────────────
# Живой backend в dev или путь к файлу спеки в CI (../backend/openapi.json)
OPENAPI_INPUT=http://localhost:3001/docs-json

# ─── Figma MCP (только локальная разработка, НЕ коммитить значение) ───────────
# Нужен для community-сервера figma-developer-mcp. Официальный remote-сервер
# (mcp.figma.com) использует OAuth и ключ не требует.
# Создать: Figma → Settings → Security → Personal access tokens (read-only)
FIGMA_API_KEY=
FIGMA_FILE_KEY=jAGbP5vebc57s09dqcvqkV

# ─── Деплой (GitHub Secrets, не в .env на сервере) ────────────────────────────
# VPS_HOST, VPS_USER, VPS_SSH_KEY
# Registry (основной для РФ — Selectel CR): SELECTEL_CR_TOKEN, SELECTEL_CR_USER
# GHCR_TOKEN — запасной вариант, если образы хостятся в ghcr.io
```

### 10.3 CI/CD (GitHub Actions)

Два отдельных workflow с path-фильтрами вместо одной матрицы: у backend и frontend разные шаги (сервис PostgreSQL против генерации API-клиента), и матрица превратилась бы в лес `if`. Плюс изменение только фронта не гоняет backend-тесты.

**`.github/workflows/backend.yml`**

```yaml
name: backend
on:
  push: { branches: [main] }
  pull_request: { paths: ['backend/**', '.github/workflows/backend.yml'] }

jobs:
  ci:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_USER: test, POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
        ports: ['5432:5432']
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/test?schema=public
      JWT_ACCESS_SECRET: test_access_secret_at_least_32_characters
      JWT_REFRESH_SECRET: test_refresh_secret_at_least_32_chars
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: backend/package-lock.json }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npx prisma migrate deploy
      - run: npm run test:cov          # unit + integration
      - run: npm run test:e2e          # Supertest + WS
      - run: npm run build
      - run: npm run openapi:export    # → backend/openapi.json
      - uses: actions/upload-artifact@v4
        with: { name: openapi-spec, path: backend/openapi.json, retention-days: 7 }
```

**`.github/workflows/frontend.yml`**

```yaml
name: frontend
on:
  push: { branches: [main] }
  pull_request: { paths: ['frontend/**', 'backend/src/**/dto/**', '.github/workflows/frontend.yml'] }

jobs:
  ci:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      # Спека берётся из backend-репы: генерим локально, чтобы не зависеть от live-сервера
      - name: Export OpenAPI spec
        working-directory: backend
        run: npm ci && npx prisma generate && npm run openapi:export
      - name: Generate API client
        run: npm run api:generate
        env: { OPENAPI_INPUT: ../backend/openapi.json }
      - run: npm run lint                 # включая eslint-plugin-boundaries (FSD-слои)
      - run: npm run tokens:check         # design-tokens.json ↔ globals.css не разошлись
      - run: npx tsc --noEmit             # ловит поломку контракта backend ↔ frontend
      - run: npm run test -- --coverage   # Vitest + RTL + MSW
      - run: npm run build
        env:
          NEXT_PUBLIC_API_URL: http://localhost:3001/api/v1
          NEXT_PUBLIC_WS_URL: http://localhost:3001
```

**`deploy.yml`** (по тегу `v*` или вручную): build+push образов в registry (Selectel CR `registry.sel.cloud` — основной для РФ; GHCR — запасной) с тегами `sha` и `latest` → ssh на VPS → `docker compose pull` → `up -d` → smoke-тест `/health` → при неуспехе `docker compose up -d` на предыдущем теге.

### 10.4 Деплой на VPS (Selectel)

Один сервер, `docker compose`. Целевая конфигурация: **Selectel Cloud VPS** (2 vCPU, 4 GB RAM, 40 GB NVMe), Ubuntu 24.04 LTS — с запасом для трёх контейнеров и PostgreSQL при MVP-нагрузке. Выбор российского провайдера обусловлен ограничениями оплаты и доступа для РФ (см. врезку ниже); подход `docker compose` + Caddy не зависит от площадки и переносится на любой Linux-VPS (Timeweb Cloud, Рег.облако, Yandex Cloud) сменой только IP и провайдера registry.

> **Почему Selectel, а не Hetzner.** Hetzner из РФ недоступен для оплаты (нужна иностранная карта, были отказы российским пользователям). Selectel — российский провайдер: оплата рублёвой картой, дата-центры в РФ (152-ФЗ), собственный Container Registry (`registry.sel.cloud`) и S3-совместимое объектное хранилище для бэкапов. Дополнительно с начала 2026 доступ к публичному Docker Hub из РФ ограничен (ошибки 403/429, деградация скорости) — поэтому на сервере обязательно настраивается зеркало Docker Hub (шаг 3.1).

**Первичная настройка (один раз):**

```bash
# 1. Пользователь и SSH-hardening
adduser deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/;s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh

# 2. Firewall — снаружи только SSH и HTTP(S); порты 3000/3001/5432 закрыты
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable

# 3. Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
systemctl enable --now docker

# 3.1 Зеркало Docker Hub (обязательно для РФ) — способ A, прозрачное зеркало.
# Правится только демон, образы в Dockerfile/compose НЕ меняются:
# docker.io тянется сначала с зеркал, при промахе — с апстрима.
cat >/etc/docker/daemon.json <<'JSON'
{
  "registry-mirrors": [
    "https://dockerhub.timeweb.cloud",
    "https://dh-mirror.gitverse.ru",
    "https://mirror.gcr.io"
  ],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
systemctl reload docker
docker info | grep -A4 'Registry Mirrors'   # проверка: зеркала подхватились

# 4. Автообновления безопасности + swap (страховка на 4 GB RAM)
apt install -y unattended-upgrades fail2ban
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**Актуальные зеркала Docker Hub (2026):**

| Зеркало | Endpoint | Кто держит |
|---|---|---|
| Timeweb | `https://dockerhub.timeweb.cloud` | Timeweb Cloud |
| GitVerse | `https://dh-mirror.gitverse.ru` | SberTech |
| Google | `https://mirror.gcr.io` | Google (базовые образы) |
| Beget (запасное) | `https://dockerhub1.beget.com` | Beget |

Зеркало нужно именно на **российском VPS** при `docker compose pull/build`. На GitHub-раннерах (вне РФ) Docker Hub доступен — там зеркало не требуется. Если понадобится собирать образы без зависимости от хостового демона (например, self-hosted CI в РФ), альтернатива — явный префикс в именах образов: `FROM dockerhub.timeweb.cloud/library/node:22-alpine` (официальные образы лежат в неймспейсе `library`).

**Первый деплой:**

```bash
# 5. DNS: A-запись домена → IP сервера (до старта Caddy, иначе TLS не выпустится)

# 6. Код и секреты
sudo -iu deploy
git clone https://github.com/<org>/trading-dashboard.git ~/app && cd ~/app
cp .env.example .env
# заполнить: POSTGRES_PASSWORD, JWT_*_SECRET (openssl rand -base64 48),
# COINGECKO_API_KEY, CORS_ORIGIN=https://<домен>,
# NEXT_PUBLIC_API_URL=https://<домен>/api/v1, NEXT_PUBLIC_WS_URL=https://<домен>
chmod 600 .env

# 7. Логин в registry и старт.
# Основной для РФ — Selectel CR (registry.sel.cloud), стабильно доступен изнутри страны.
# GHCR из РФ работает нестабильно; если используется он — строка с ghcr.io.
echo "$SELECTEL_CR_TOKEN" | docker login registry.sel.cloud -u <token-name> --password-stdin
# echo "$GHCR_TOKEN" | docker login ghcr.io -u <user> --password-stdin   # запасной вариант
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 8. Миграции применяются автоматически при старте backend. Наполнение данными:
docker compose exec backend npx prisma db seed
docker compose exec backend npm run backfill -- --all --days=365

# 9. Проверка
curl -fsS https://<домен>/health && docker compose ps
```

**Регулярные деплои** — через `deploy.yml`, вручную эквивалентно:

```bash
cd ~/app && git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
curl -fsS --retry 10 --retry-delay 3 https://<домен>/health || echo 'ROLLBACK NEEDED'
docker image prune -f
```

Downtime при таком обновлении — секунды на рестарт контейнеров. Zero-downtime (две реплики backend + переключение в Caddy) в MVP не делаем: усложнение не оправдано, а миграции всё равно потребуют совместимости схемы в обе стороны.

**Эксплуатация:**

| Задача | Решение |
|---|---|
| Бэкапы БД | Cron: `pg_dump` в `/var/backups`, ротация 14 дней, `rclone` в Selectel Object Storage (S3-совместимое); ежемесячная проверка восстановлением |
| Логи | JSON от Pino в `docker logs`, драйвер `json-file` с `max-size: 10m`, `max-file: 3` (задан в `daemon.json`, шаг 3.1) |
| Мониторинг | Uptime Kuma / внешний пинг на `/health` + алерт в Telegram |
| TLS | Caddy выпускает и продлевает сертификаты сам |
| Обновления ОС | `unattended-upgrades`, ручной ребут в окно обслуживания |
| Снапшоты | Snapshot диска в панели Selectel перед каждым мажорным обновлением |

**Риски единственного VPS:** одна точка отказа (нет HA), деплой с коротким downtime, вертикальное масштабирование до предела тарифа. Для MVP это приемлемо: цена вопроса — минуты недоступности в год против кратного роста сложности инфраструктуры. Порог для пересмотра — платящие пользователи с SLA либо нагрузка, упирающаяся в выбранный тариф VPS.
