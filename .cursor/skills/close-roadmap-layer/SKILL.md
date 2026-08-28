---
name: close-roadmap-layer
description: Closes a ROADMAP.md layer only after full Definition of Done. Use when the user asks to close a layer, mark a milestone done, move to the next B/F/I layer, or checks DoD / зелёные тесты.
---

# Закрыть слой ROADMAP

1. Прочитать чек-лист слоя в `ROADMAP.md` (B1–B4, F1–F4, I1–I4) и общий DoD в §1.
2. Сверить реализацию с `ARCHITECTURE.md`. Незакрытые пункты чек-листа — слой не закрыт.
3. Прогнать команды `verify-layer` для backend или frontend. Любой красный шаг → стоп, чинить, не объявлять Done.
4. Frontend-слой нельзя закрывать (и нельзя начинать), если B1–B4 не закрыты.
5. В ответе: список выполненного DoD, команды и их exit code, **следующий слой запрещён / разрешён**. Не стартовать следующий слой в том же PR без явной просьбы.

Не отмечать слой закрытым по «работает у меня в браузере».
