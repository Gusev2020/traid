/**
 * Индикатор CoinGecko на GET /health (тикет 03).
 *
 * Оператор видит деградацию Source по состоянию circuit breaker.
 * Это локальный статус адаптера, а не отдельный запрос доступности CoinGecko.
 *
 * Terminus при status "down" отвечает 503. CoinGecko — некритичная зависимость:
 * история из БД остаётся доступной при ошибках внешнего источника.
 * Поэтому status остаётся "up", а в state пишем "degraded" или "up".
 */
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { CoinGeckoAdapter } from '../../integrations/coingecko/coingecko.adapter';

@Injectable()
export class SourceHealthIndicator extends HealthIndicator {
  constructor(private readonly source: CoinGeckoAdapter) {
    super();
  }

  isHealthy(key: string): HealthIndicatorResult {
    // isCircuitOpen() сеть не трогает: это флаг в памяти, его уже выставил адаптер.
    const degraded = this.source.isCircuitOpen();
    return this.getStatus(key, true, {
      state: degraded ? 'degraded' : 'up',
    });
  }
}
