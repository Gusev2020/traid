---
name: build-chain
description: Orchestrates the Treyd feature chain grill-with-docs → to-spec → to-tickets → implement → code-review. Use when the user asks to start the build chain, organizes a feature before coding, mentions grill-with-docs / to-spec / to-tickets, or says цепочка / build chain.
disable-model-invocation: true
---

# Build chain

Прочитать `docs/agents/build-chain.md` целиком и вести текущий шаг. Не копировать апстрим-скилы в ответ — вызывать их по имени.

## Правила

1. Источники истины: `ARCHITECTURE.md`, `ROADMAP.md`. Цепочка не меняет порядок слоёв B→F→I.
2. User-invoked скилы Pocock не вызывать вложенно. В конце шага написать точную следующую slash-команду.
3. Frontend не начинать, пока B1–B4 не закрыты. Вертикальный тикет = тонкий срез *внутри текущего слоя* (см. §6 playbook).
4. Коммит только по явной просьбе пользователя.
5. Если setup ещё не делали (`docs/agents/issue-tracker.md` нет) — первым шагом `/setup-matt-pocock-skills`, не grilling.

## Старт сессии

Определить, какой шаг уже сделан (есть ли `CONTEXT.md` по теме, spec-issue, тикеты). Сказать, где мы в цепочке, и какую команду набрать сейчас.
