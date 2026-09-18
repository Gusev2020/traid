/**
 * Глобальный HTTP-throttler слоя B3, тикет 01.
 *
 * ThrottlerGuard считает удары по IP и трём окнам (short/medium/long).
 * При превышении бросает ThrottlerException → AllExceptionsFilter → JSON 429.
 *
 * Зачем подкласс, а не стоковый guard: для именованных уровней библиотека
 * ставит Retry-After-short / Retry-After-medium / Retry-After-long.
 * Контракт тикета и §4.8 — канонический Retry-After (секунды до разблокировки).
 * Пишем его на response до throw; filter делает .json(), уже выставленные
 * заголовки Express не затирает.
 */
import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Response } from 'express';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    (res as Response).header(
      'Retry-After',
      String(throttlerLimitDetail.timeToBlockExpire),
    );
    await super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
