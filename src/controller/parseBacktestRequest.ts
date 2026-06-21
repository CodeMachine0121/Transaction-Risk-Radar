/** /backtest 端點接收的 querystring 形狀。 */
export type BacktestRequest = {
  coin?: string;
  since?: string;
  /** 逗號分隔的小時清單（如 `4,24,72`）；覆蓋 env 預設。 */
  horizonsHours?: string;
};

/** 解析後的回測查詢（horizons 已換算為毫秒）。 */
export type BacktestQuery = {
  coin: string;
  since: number;
  horizonsMilliseconds: number[];
};

export type BacktestParseResult = { query: BacktestQuery } | { error: string };

const HOUR_MILLISECONDS = 60 * 60 * 1000;
/** env 也缺時的程式預設視窗（小時）。 */
const CODE_DEFAULT_HORIZONS_HOURS = [1, 4, 24];

const parseHorizonsHours = (raw: string): number[] | { error: string } => {
  const hours = raw.split(',').map((part) => Number(part.trim()));
  if (hours.some((value) => !Number.isFinite(value) || value <= 0)) {
    return { error: 'horizonsHours must be a comma-separated list of positive numbers' };
  }
  return hours;
};

/**
 * 解析並校驗 /backtest querystring；非法回 error（controller 轉 400）。
 * horizons 優先序：request > env 預設（`defaultHorizonsHours`）> 程式預設；單位小時，換算毫秒。
 */
export const parseBacktestRequest = (
  raw: BacktestRequest,
  defaultHorizonsHours: number[],
): BacktestParseResult => {
  if (raw.coin === undefined || raw.coin === '') {
    return { error: 'coin is required' };
  }

  let since = 0;
  if (raw.since !== undefined) {
    const value = Number(raw.since);
    if (!Number.isFinite(value) || value < 0) {
      return { error: 'since must be a number >= 0' };
    }
    since = value;
  }

  const fallbackHours =
    defaultHorizonsHours.length > 0 ? defaultHorizonsHours : CODE_DEFAULT_HORIZONS_HOURS;
  const hours = raw.horizonsHours === undefined ? fallbackHours : parseHorizonsHours(raw.horizonsHours);
  if (!Array.isArray(hours)) {
    return hours;
  }

  return {
    query: {
      coin: raw.coin,
      since,
      horizonsMilliseconds: hours.map((value) => value * HOUR_MILLISECONDS),
    },
  };
};
