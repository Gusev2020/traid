/**
 * HTTP к CoinGecko. Про свечи и проверку JSON ничего не знает — сырой ответ.
 *
 * Зачем отдельно от Adapter: сюда собраны таймаут, повторы и лимит квоты.
 * Adapter потом проверяет JSON и делает Candle.
 *
 * Правила Demo-плана:
 *   ждём ответа не дольше 8 секунд;
 *   повторяем до 3 раз только если 429 (нас лимитируют), 5xx (у них сбой) или сеть упала;
 *   404 и прочие 4xx не повторяем — такой монеты нет, ждать бессмысленно;
 *   в заголовке 429 могут написать «подожди N секунд» (Retry-After) — ждём, не считая это повтором;
 *   своих запросов не больше 50 в минуту: нет слота — подождать, не ошибка;
 *   Demo-ключ в заголовке; пустой ключ — заголовок не ставим.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  COINGECKO_SETTINGS,
  type CoinGeckoSettings,
} from './coingecko.settings';
import { SourceHttpError, SourceNetworkError } from './source.errors';

/** Сколько раз можно повторить после первого сбоя. */
const RETRY_LIMIT = 3;
/** База паузы между повторами, мс. Каждый следующий раз примерно вдвое дольше. */
const BACKOFF_BASE_MS = 100;
/** Окно token bucket: сколько миллисекунд на «полную кружку» токенов. */
const TOKEN_WINDOW_MS = 60_000;

@Injectable()
export class CoinGeckoClient {
  private readonly logger = new Logger(CoinGeckoClient.name);
  private readonly bucket: TokenBucket;

  constructor(
    @Inject(COINGECKO_SETTINGS)
    private readonly settings: CoinGeckoSettings,
  ) {
    this.bucket = new TokenBucket(settings.rateLimitPerMin);
  }

  async getOhlc(
    coingeckoId: string,
    vsCurrency: string,
    days: number,
  ): Promise<unknown> {
    let retriesUsed = 0; // сколько повторов уже потратили; Retry-After сюда не входит

    // Крутимся, пока не получим JSON или не исчерпаем повторы.
    for (;;) {
      await this.bucket.acquire(); // один жетон из кружки 50/мин; нет жетона — ждём
      try {
        const response = await axios.get<unknown>(
          `${trimSlash(this.settings.baseUrl)}/coins/${encodeURIComponent(coingeckoId)}/ohlc`,
          {
            params: { vs_currency: vsCurrency, days },
            timeout: this.settings.timeoutMs,
            headers: demoKeyHeaders(this.settings.apiKey),
            // Иначе axios сам бросит на 429, и мы не прочитаем Retry-After.
            validateStatus: () => true,
          },
        );

        // Нас лимитируют. Если сказали «подожди N сек» — ждём и пробуем снова без траты retry.
        if (response.status === 429) {
          this.logger.warn('Source 429');
          const retryAfterSec = parseRetryAfter(
            response.headers['retry-after'],
          );
          if (retryAfterSec !== undefined) {
            await sleep(retryAfterSec * 1000);
            continue;
          }
          if (retriesUsed >= RETRY_LIMIT) {
            throw new SourceHttpError(429);
          }
          retriesUsed += 1;
          await sleep(backoffMs(retriesUsed));
          continue;
        }

        // У них сбой (500+). Повторяем с паузой, но не бесконечно.
        if (response.status >= 500) {
          if (retriesUsed >= RETRY_LIMIT) {
            throw new SourceHttpError(response.status);
          }
          retriesUsed += 1;
          await sleep(backoffMs(retriesUsed));
          continue;
        }

        // 404 и прочие 4xx: такой монеты нет / плохой запрос. Повторять бессмысленно.
        if (response.status >= 400) {
          throw new SourceHttpError(response.status);
        }

        return response.data; // 2xx — сырой JSON, проверкой занимается Adapter
      } catch (error) {
        // Ошибки, которые мы сами бросили выше — сразу наверх, без нового круга.
        if (
          error instanceof SourceHttpError ||
          error instanceof SourceNetworkError
        ) {
          throw error;
        }
        // Сюда попадают таймаут и обрыв сети. Не сеть или retry кончились — сдаёмся.
        if (!isRetriableNetwork(error) || retriesUsed >= RETRY_LIMIT) {
          throw new SourceNetworkError(error);
        }
        retriesUsed += 1;
        await sleep(backoffMs(retriesUsed));
      }
    }
  }
}

/**
 * Своя кружка запросов к CoinGecko (не путать с HTTP-throttler на /candles).
 *
 * Представь кружку на 50 жетонов. Каждый HTTP забирает один.
 * Жетоны капают обратно за минуту. Кружка пустая — ждём, не кричим ошибкой.
 *
 * Очередь за жетоном строгая: иначе 51 вызов разом все увидят «ещё 50» и проскочат.
 */
class TokenBucket {
  /** Сколько жетонов сейчас можно потратить. */
  private tokens: number;
  /** Когда последний раз доливали жетоны. */
  private lastRefill: number;
  /** Хвост очереди: следующий acquire ждёт предыдущего. */
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly capacity: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /** Взять один жетон. Нет жетона — подождать, пока накапает. */
  acquire(): Promise<void> {
    const next = this.tail.then(() => this.acquireLocked());
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async acquireLocked(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = (1 - this.tokens) * (TOKEN_WINDOW_MS / this.capacity);
    await sleep(waitMs);
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) {
      return;
    }
    this.tokens = Math.min(
      this.capacity,
      this.tokens + (elapsed / TOKEN_WINDOW_MS) * this.capacity,
    );
    this.lastRefill = now;
  }
}

/** Заголовок Demo-ключа. Пустая строка = ключа нет, CoinGecko пускает с лимитом по IP. */
function demoKeyHeaders(apiKey: string): Record<string, string> {
  if (!apiKey) {
    return {};
  }
  return { 'x-cg-demo-api-key': apiKey };
}

function trimSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/** Сколько секунд нас просят подождать. Не число — считаем, что заголовка нет. */
function parseRetryAfter(value: unknown): number | undefined {
  if (typeof value !== 'string' || value === '') {
    return undefined;
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  return seconds;
}

/** Пауза перед повтором: чем больше попытка, тем дольше, плюс чуть случайности. */
function backoffMs(retryNumber: number): number {
  const exp = BACKOFF_BASE_MS * 2 ** (retryNumber - 1);
  const jitter = Math.floor(Math.random() * BACKOFF_BASE_MS);
  return exp + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Обрыв сети / таймаут: ответа нет. На 4xx/5xx у axios как раз есть response. */
function isRetriableNetwork(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response === undefined;
}
