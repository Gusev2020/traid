---
name: figma-to-ui
description: Implements UI from the Treyd Figma file using MCP tokens, shadcn, and FSD. Use when the user asks to implement a screen, widget, or layout from Figma, or pastes a figma.com URL.
---

# Figma → UI

Макет file key `jAGbP5vebc57s09dqcvqkV`. Skill Figma `design-to-code` / `get_design_context` — до вёрстки.

1. Снять узел MCP. Сверить токены с `frontend/src/shared/config/design-tokens.json`. Нет токена — добавить, `tokens:build`, не хардкодить.
2. Собрать экран в `pages/` из `widgets/` + `features/`. Примитивы — `shared/ui` (shadcn). Не плодить кнопки с нуля.
3. Ассеты — MCP download в `frontend/public/assets/`.
4. График: цвета из CSS-переменных (`--chart-up` / `--chart-down`), не литералы в lightweight-charts.
5. Проверка: страница рендерится, нет hex в tsx, boundaries lint чистый.

Не открывать второй Figma MCP. Не править `shared/ui` под одну фичу.
