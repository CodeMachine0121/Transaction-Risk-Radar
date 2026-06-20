import type { Provider } from './provider';

/** 交易員的唯一識別：`(provider, address)`。供跨來源迭代輪詢 / 重算。 */
export type TraderKey = {
  provider: Provider;
  address: string;
};
