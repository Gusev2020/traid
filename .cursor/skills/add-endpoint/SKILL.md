---
name: add-endpoint
description: Adds a REST endpoint with DTO, class-validator, Swagger, Public/Guards, and e2e status codes. Use when adding or changing a NestJS HTTP route or controller method.
---

# Новый REST-эндпоинт

1. Query/body/param — класс DTO, не голый `@Query()`. `whitelist` + `forbidNonWhitelisted` уже глобальные.
2. `@ApiOperation`, `@ApiOkResponse({ type })`, все ошибки `@ApiResponse`. `@ApiProperty({ example })` на полях.
3. Auth: по умолчанию закрыт. Публичный — `@Public()`. Админ — `@Roles(Role.ADMIN)`.
4. Decimal/деньги в response — `string`. Ошибки — `ErrorResponseDto` через исключения сервиса, не ручной JSON в контроллере.
5. E2E: 200 счастливый путь; 400 на лишние/невалидные поля; 401 без токена если защищён; 404 на неизвестный ticker/id.
6. Запустить skill `openapi-sync`.
