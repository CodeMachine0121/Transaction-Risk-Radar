import type { BackoffOptions } from './backoff';

/** jitter 佔 exponential delay 的比例（± 由 random 決定，0 → 無 jitter）。 */
const JITTER_RATIO = 0.2;
const TOO_MANY_REQUESTS_STATUS = 429;

export type RetryDependencies = {
  backoff: BackoffOptions;
  sleep: (milliseconds: number) => Promise<void>;
  random: () => number;
};

const retryDelayMilliseconds = (
  response: Response,
  attempt: number,
  backoff: BackoffOptions,
  random: () => number,
): number => {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }
  const exponential = Math.min(
    backoff.baseDelayMilliseconds * 2 ** attempt,
    backoff.maximumDelayMilliseconds,
  );
  return Math.round(exponential * (1 + JITTER_RATIO * random()));
};

/**
 * 送出單次嘗試（`attempt` thunk）；遇 429 依 Retry-After / exponential backoff + jitter
 * 重試至上限為止。非 429 的回應（含其他非 ok）直接回傳交由呼叫端處理。
 * 呼叫端在 thunk 內自理 per-attempt 前置（如取限流 token），重試決策則集中於此。
 */
export const sendWithRetryOn429 = async (
  attempt: () => Promise<Response>,
  dependencies: RetryDependencies,
): Promise<Response> => {
  let attemptCount = 0;
  for (;;) {
    const response = await attempt();
    if (
      response.status !== TOO_MANY_REQUESTS_STATUS ||
      attemptCount >= dependencies.backoff.maximumRetryCount
    ) {
      return response;
    }
    await dependencies.sleep(
      retryDelayMilliseconds(response, attemptCount, dependencies.backoff, dependencies.random),
    );
    attemptCount += 1;
  }
};
