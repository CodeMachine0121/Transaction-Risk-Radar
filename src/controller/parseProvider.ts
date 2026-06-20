import { Provider } from '../domain/vo/provider';

/** 解析 querystring 的 provider；無法辨識或缺漏回傳 undefined（由呼叫端決定預設）。 */
export const parseProvider = (raw: string | undefined): Provider | undefined => {
  if (raw === 'hyperliquid') {
    return Provider.Hyperliquid;
  }
  if (raw === 'okx') {
    return Provider.Okx;
  }
  return undefined;
};
