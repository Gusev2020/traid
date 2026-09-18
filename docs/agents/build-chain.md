# Build chain: grill-with-docs → to-spec → to-tickets → implement → code-review

Playbook цепочки [mattpocock/skills](https://github.com/mattpocock/skills). Этот файл — оркестрация и привязка к репо; тексты самих скилов не копировать сюда (они живут в `.cursor/skills/<name>/SKILL.md` и обновляются через `npx skills update`).

**Источник истины продукта не меняется:** архитектура — `ARCHITECTURE.md`, порядок слоёв — `ROADMAP.md`. Цепочка ведёт *одну фичу* внутри разрешённого окна ROADMAP, а не заменяет слои B/F/I.

Ответы агента — на русском, термины — на английish (`spec`, `ticket`, `seam`, `tracer bullet`).

---

## 1. Зачем эта цепочка

Агент ломается в четырёх местах. Каждый шаг закрывает одно:

| Провал | Шаг |
|---|---|
| Сделал не то, что вы имели в виду | `/grill-with-docs` — интервью + `CONTEXT.md` / ADR |
| Договорённости умерли вместе с чатом | `/to-spec` — зафиксировать *что* |
| Работа слишком большая для одного контекста | `/to-tickets` — нарезать tracer bullets |
| Код без обратной связи | `/implement` + `/tdd` |
| Стандарты и spec смешались в одном review | `/code-review` — две оси раздельно |

Не начинать со средины: `/to-spec` без grilling пишет уверенный документ из догадок. `/implement` без spec/tickets пишет код «вообще».

---

## 2. Каноническая цепочка

```
/setup-matt-pocock-skills     один раз на репо
        ↓
/grill-with-docs              выровняться + словарь домена
        ↓  тот же чат, не чистить
/to-spec                      синтез в spec (бывший PRD)
        ↓
/to-tickets                   вертикальные тикеты с blocking edges
        ↓  новый чат на каждый тикет с пустым frontier
/implement                    tdd на согласованных seams
        ↓  вызывается из implement
/code-review                  Standards ∥ Spec
        ↓  Treyd-обёртка
verify-layer → close-roadmap-layer   только если закрывается слой ROADMAP
```

User-invoked скилы **не вызывают друг друга**. Агент в конце шага говорит: «следующий шаг — наберите `/to-spec` в этом чате». Исключение: `/implement` сам тянет model-invoked `/tdd` и `/code-review`.

| Скил | Кто запускает | Пишет файлы? | Интервью? |
|---|---|---|---|
| `setup-matt-pocock-skills` | вы, 1× на репо | `docs/agents/*`, блок в `AGENTS.md` | да, короткие секции |
| `grill-with-docs` | вы | `CONTEXT.md`, иногда `docs/adr/` | да, раундами |
| `to-spec` | вы, тот же чат | issue / `.scratch/` | нет, только seams подтвердить |
| `to-tickets` | вы | тикеты в tracker | да, гранулярность нарезки |
| `implement` | вы, 1 тикет = 1 чат | код | нет |
| `tdd` | агент внутри implement | тесты | seams, если ещё не согласованы |
| `code-review` | агент в конце implement или вы | ничего (отчёт) | нет |

Зависимости, без которых цепочка молча деградирует:

- `grill-with-docs` = одна строка «вызови `grilling` + `domain-modeling`». Ставить все три.
- `implement` опирается на `tdd` и `code-review`.
- `tdd` ссылается на `codebase-design` (словарь: seam, deep module). Ставить вместе.

Роутер при сомнении: `/ask-matt`. Слишком большая работа на много сессий: `/wayfinder`, затем куски обратно в `/grill-with-docs`. Идея вне репо: `/grill-me` (stateless), не эта цепочка.

---

## 3. Структура на диске после установки

```
.
├── AGENTS.md                          # индекс; блок ## Agent skills после setup
├── CONTEXT.md                         # glossary; появляется на первом grill-with-docs
├── ARCHITECTURE.md                    # не трогать цепочкой
├── ROADMAP.md                         # не заменять тикетами
├── docs/
│   ├── adr/                           # ADR; пусто, пока решение не пройдёт 3 гейта
│   └── agents/
│       ├── build-chain.md             # этот playbook
│       ├── issue-tracker.md           # пишет setup
│       └── domain.md                  # пишет setup (куда читать CONTEXT.md / ADR)
├── skills-lock.json                   # пишет npx skills (коммитить)
├── .scratch/<feature>/issues/         # только если tracker = local markdown
│   └── 01-<slug>.md
├── .agents/skills/                    # Pocock: npx skills -a cursor
│   ├── grill-with-docs/
│   ├── grilling/
│   ├── domain-modeling/
│   ├── to-spec/
│   ├── to-tickets/
│   ├── implement/
│   ├── tdd/
│   ├── code-review/
│   ├── codebase-design/
│   ├── setup-matt-pocock-skills/
│   ├── ask-matt/
│   ├── prototype/
│   └── diagnosing-bugs/
└── .cursor/skills/                    # Treyd procedural
    ├── build-chain/
    ├── add-endpoint/
    ├── new-nest-module/
    ├── openapi-sync/
    ├── coingecko-adapter-change/
    ├── new-fsd-slice/
    ├── figma-to-ui/
    ├── verify-layer/
    └── close-roadmap-layer/
```

Что коммитить:

| Коммитить | Не коммитить |
|---|---|
| `.agents/skills/**`, `.cursor/skills/**`, `skills-lock.json` | `.env`, ключи |
| `CONTEXT.md`, `docs/adr/`, `docs/agents/` | `frontend/src/shared/api/generated/**` |
| `.scratch/` если выбрали local tracker и это рабочий бэклог | дубли скилов из Claude Code plugin |

Не ставить **одновременно** Claude Code plugin `mattpocock-skills` и копии через `npx skills` — получите каждый скил дважды.

---

## 4. Установка (один раз)

Нужны Node.js и `npx`. Для GitHub-tracker ещё `gh` CLI и auth (`gh auth status`).

### 4.1 Скопировать скилы в проект

```bash
npx skills@latest add mattpocock/skills
```

В интерактивном установщике:

1. Агент: **Cursor** (класть в `.cursor/skills/`, рядом с Treyd-скилами). Не выбирать «все агенты».
2. Режим: копии в репо (editable), не read-only plugin.
3. Отметить минимум:

**Цепочка (user-invoked)**

- `setup-matt-pocock-skills`
- `grill-with-docs`
- `to-spec`
- `to-tickets`
- `implement`

**Примитивы (model-invoked) — обязательны**

- `grilling`
- `domain-modeling`
- `tdd`
- `code-review`
- `codebase-design`

**Рекомендуется**

- `ask-matt`
- `prototype` — когда вопрос ungrillable (нужно увидеть UI/поведение)
- `diagnosing-bugs` — не в основной цепи, для регрессий

**Не обязательно для старта**

- `grill-me` — идеи вне репо
- `wayfinder` — эпик на много сессий
- `triage` — если нет потока входящих issues
- `improve-codebase-architecture` — отдельно, раз в несколько дней

Не выбирать скилы, которые перезапишут Treyd (`add-endpoint` и т.д. — имён коллизий нет).

Точечная доустановка:

```bash
npx skills add mattpocock/skills --skill grill-with-docs --skill grilling --skill domain-modeling
```

Обновление:

```bash
npx skills update
```

Перед merge скилов — просмотреть diff: апстрим не должен затереть локальные правки Treyd-скилов.

### 4.2 `/setup-matt-pocock-skills`

Новый чат в корне репо. Набрать `/setup-matt-pocock-skills`. Агент сначала исследует репо, потом спрашивает секциями. Рекомендуемые ответы для **этого** репо:

| Секция | Рекомендация | Почему |
|---|---|---|
| Issue tracker | **GitHub** (есть `gh` + GitHub MCP) | `to-spec` / `to-tickets` пишут issues; CI и PR уже вокруг GitHub |
| Альтернатива | Local markdown → `.scratch/<feature>/` | если не хотите issues на MVP |
| Triage labels | пропустить, пока нет `triage` | дефолты: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wont-fix` |
| Domain docs | **single-context**: корневой `CONTEXT.md` + `docs/adr/` | монолит Nest + Next, не multi-package |

Не давать setup переписывать `ARCHITECTURE.md` / `ROADMAP.md`. Он добавляет в `AGENTS.md` блок `## Agent skills` (ссылки на `docs/agents/*.md`) — это ожидаемо.

После setup проверить, что появились:

- `docs/agents/issue-tracker.md`
- `docs/agents/domain.md`
- в `AGENTS.md` — секция Agent skills

`CONTEXT.md` и `docs/adr/` **не** создаются на setup: первый термин/ADR пишет `/grill-with-docs`.

### 4.3 Проверка, что цепочка живая

1. В Cursor скилы видны как slash-commands: `/grill-with-docs`, `/to-spec`, …
2. Открыть `.agents/skills/grill-with-docs/SKILL.md` — там делегирование на `grilling` и `domain-modeling`. Обе папки рядом существуют.
3. Набрать `/build-chain` — агент читает этот файл.

---

## 5. Как идти по шагам

### 5.0 Когда не запускать цепочку целиком

| Ситуация | Что делать |
|---|---|
| Опечатка, lint, один красный тест | сразу править, без grilling |
| Слой ROADMAP уже специфицирован в `ROADMAP.md` и вы просто закрываете DoD | `/implement` по чек-листу слоя + `verify-layer` |
| Не хватает backend-фичи на фронте | вернуться в backend-слой, короткий grill если контракт неясен, затем код + `openapi-sync` |
| Идея не про этот репо | `/grill-me` |

Цепочка обязательна, когда меняется поведение продукта, контракт или доменные слова.

### 5.1 `/grill-with-docs`

- Новый чат. Plan mode выключить.
- Сказать слой ROADMAP и ограничение: «мы в B2, UI вне scope».
- Отвечать самому: не «согласен» на все recommended answers. «Не знаю» — валидный ответ; тогда `/prototype` или отложить ветку.
- Агент читает код сам; вам задают только *решения*.
- Раунды: весь frontier сразу, у каждого вопроса recommended answer. Следующий раунд — после ваших ответов.
- В `CONTEXT.md` попадают только термины (словарь), не spec. ADR — только если решение трудно откатить, удивительно без контекста, и это настоящий trade-off. Ноль ADR за сессию — норма.
- Конец: frontier пуст. **Не чистить чат.** Сразу `/to-spec`.

Ungrillable («как это должно ощущаться?») — стоп, `/prototype`, потом вернуться одной строкой.

### 5.2 `/to-spec`

- Тот же чат.
- Агент **не** интервьюирует заново. Единственный вопрос — **seams** (где тестируем). Предпочитать существующие швы, как можно выше, идеал — один.
- Пишет spec по шаблону скила (Problem, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope) словарём из `CONTEXT.md`.
- Публикует в tracker из `docs/agents/issue-tracker.md`, лейбл `ready-for-agent`.
- В spec **нет** путей файлов и сниппетов (исключение — кусок из prototype, который сам есть решение).

Для Treyd в Implementation Decisions явно фиксировать: слой ROADMAP, публичность эндпоинта (`@Public` vs JWT), нужен ли `openapi:export`.

### 5.3 `/to-tickets`

- Можно тот же чат или новый с ссылкой на spec-issue.
- Нарезка — **вертикальные** tracer bullets, не «сначала вся БД, потом весь API».
- Каждый тикет: title, blocked by, what it delivers (поведение, не список слоёв), размер = один свежий context window.
- Показать нарезку вам → утвердить гранулярность → только потом публиковать.
- Работать **frontier**: тикеты без открытых blockers. Линейная цепочка = сверху вниз.
- Parent spec-issue не закрывать.

Адаптация «вертикали» под ROADMAP — §6.

### 5.4 `/implement`

- **Один тикет — один новый чат.** В промпте: номер issue / путь `.scratch/…` и ссылка на parent spec.
- `/tdd` на seams из spec. Red → green, один тест за цикл. Не писать пачку тестов заранее.
- Регулярно: `tsc --noEmit` и узкий test file; полный suite — в конце.
- Внутри implement подгружать Treyd-скилы по файлам (§7), не игнорировать их.
- Коммит **только если пользователь попросил** (локальное правило репо сильнее строки «commit» в апстрим `implement`).
- В конце — `/code-review` (скил implement вызывает сам; если не вызвал — набрать вручную).

### 5.5 `/code-review`

- Fixed point: обычно `main` или merge-base ветки. Если агент не спросил — сказать явно.
- Две оси, два sub-agent, отчёты **рядом**, без ранжирования «что важнее»:
  - **Standards** — `.cursor/rules/*.mdc`, этот playbook не подменяет rules. Плюс Fowler smell baseline (всегда judgement call). То, что ловит ESLint/`tsc`, не дублировать.
  - **Spec** — missing / scope creep / wrong vs originating spec.
- Красный Spec → дописать в том же тикете. Красный Standards без ломки spec → отдельный follow-up, не смешивать в «ещё одну попытку всё сразу».
- После зелёного review на Treyd: `verify-layer`. Закрытие слоя ROADMAP — только `close-roadmap-layer`.

---

## 6. Вертикальные тикеты vs слои ROADMAP

Апстрим Pocock режет schema + API + UI в одном тикете. В этом репо до закрытия B4 фронт **запрещён**. Конфликт снимается так:

**Определение tracer bullet здесь:** самый тонкий срез, который *разрешён текущим слоем* и сам по себе проверяем (тест + DoD-кусок).

| Окно ROADMAP | Что считается вертикальным срезом | Что нельзя класть в тот же тикет |
|---|---|---|
| B1–B4 | Prisma (если нужно) + Nest module/endpoint + unit + e2e + Swagger | любой `frontend/` |
| F1–F4 (B1–B4 зелёные) | FSD-слайс + TanStack Query/Zod + UI + тест; клиент только из OpenAPI | новый backend-контракт «заодно» — сначала возврат в B-слой |
| I1–I4 | сквозной e2e (браузер, WS, auth) | новые фичи вне DoD слоя |
| После MVP, B и F уже есть | классический Pocock: один user-visible path через все слои | горизонтальные «весь кэш, потом весь UI» |

Плохо: Phase 1 = вся Prisma, Phase 2 = все контроллеры, Phase 3 = все тесты.  
Хорошо в B2: «`GET /symbols/:ticker` — 200/404, DTO, Swagger, e2e».  
Хорошо в F3: «подписка на один ticker, snapshot в график, реконнект».

Недостающая backend-фича на фронте: стоп F-тикета → B-тикет (grill если контракт новый) → `openapi-sync` → продолжить F.

---

## 7. Стыковка с Treyd-скилами

Pocock оркестрирует *когда*. Treyd-скилы говорят *как* в этом стеке. Во время `/implement` агент обязан читать локальный скил, если трогает соответствующую зону:

| Зона | Скил |
|---|---|
| новый Nest-модуль | `new-nest-module` |
| REST-роут | `add-endpoint` |
| смена DTO/контракта | `openapi-sync` |
| CoinGecko / cache / backfill | `coingecko-adapter-change` |
| виджет / feature / entity | `new-fsd-slice` |
| экран из макета | `figma-to-ui` |
| lint + tsc + тесты слоя | `verify-layer` |
| отметить слой ROADMAP Done | `close-roadmap-layer` |

Nest / Next / Prisma / TanStack Query — сначала Context7 MCP, не API из памяти. postgres MCP — только SELECT.

---

## 8. Артефакты и где живёт правда

| Артефакт | Роль | Когда появляется |
|---|---|---|
| `CONTEXT.md` | словарь домена, без implementation | термин резолвится в grill |
| `docs/adr/*.md` | труднооткатываемое решение | 3 гейта ADR |
| spec (GitHub issue или `.scratch`) | *что* и *зачем*, seams | `/to-spec` |
| tickets | *порядок* и blocking edges | `/to-tickets` |
| `ARCHITECTURE.md` | система | не пишет цепочка |
| `ROADMAP.md` | слои и DoD | не пишет цепочка |
| код + тесты | реализация одного тикета | `/implement` |

Большая часть ответов grilling живёт **только в чате**. Поэтому `/to-spec` в том же разговоре обязателен: иначе решения испаряются.

---

## 9. Правила сессий

1. Grilling — свежий чат, без заранее сгенерированного агентом плана.
2. `grill-with-docs` → `to-spec` — один непрерывный контекст.
3. `implement` — один тикет на чат; между тикетами чат сбрасывать.
4. Не запускать два user-invoked оркестратора сразу (`/grill-with-docs` внутри `/wayfinder` руками, не вложенным вызовом скила).
5. Модель: grilling и spec — сильнее модель; implement после хорошего spec терпит дешевле.
6. Не оставлять Plan mode на grilling: он торопит к плану.

Шаблон старта implement-чата:

```
/implement

Тикет: <url или .scratch/.../01-....md>
Parent spec: <url>
Слой ROADMAP: B2
Seams из spec: <перечислить>
Не коммитить, пока не попрошу.
```

---

## 10. Чек-лист одной фичи

```
- [ ] Слой ROADMAP разрешает эту работу
- [ ] /setup-matt-pocock-skills уже прогнан в этом репо
- [ ] /grill-with-docs: frontier пуст, термины в CONTEXT.md
- [ ] /to-spec в том же чате, seams подтверждены, spec в tracker
- [ ] /to-tickets: нарезка утверждена, тикеты опубликованы
- [ ] Пока есть тикет с пустым frontier:
      - [ ] новый чат /implement
      - [ ] Treyd-скил зоны
      - [ ] /tdd на seams
      - [ ] /code-review vs spec
      - [ ] verify-layer если задет DoD слоя
- [ ] Недостающий backend на фронте → возврат в B, не «дописать в F-тикете»
- [ ] Слой закрывать только close-roadmap-layer, не по зелёному одному тикету
```

---

## 11. Перенос в другой репозиторий

1. Скопировать этот файл в `docs/agents/build-chain.md`.
2. Заменить §6–§7 (ROADMAP / Treyd-скилы) на локальные ограничения и procedural-скилы.
3. Повторить §4 (installer + `/setup-matt-pocock-skills`).
4. Добавить строку в индекс агента (`AGENTS.md` / `CLAUDE.md`): цепочка фичи → этот файл.
5. Не копировать `CONTEXT.md` и ADR чужого продукта — только пустой layout.

Ярлык для Cursor в новом репо: skill `build-chain` с `disable-model-invocation: true` и единственной инструкцией «прочитай `docs/agents/build-chain.md` и веди пользователя по текущему шагу».
