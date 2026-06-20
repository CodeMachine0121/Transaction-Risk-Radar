import type { SafeCohortConsensusQuery } from '../domain/vo/safeCohortConsensusQuery';
import { parseProvider } from './parseProvider';

/** 共識/訊號端點共用的 querystring 形狀。 */
export type SafeCohortConsensusRequest = {
  provider?: string;
  weighting?: string;
  maxRiskScore?: string;
  minParticipants?: string;
  offset?: string;
  limit?: string;
};

export type ConsensusParseResult = { query: SafeCohortConsensusQuery } | { error: string };

/** 解析並校驗 querystring；非法回 error（controller 轉 400）。/consensus 與 /signals 共用。 */
export const parseConsensusRequest = (raw: SafeCohortConsensusRequest): ConsensusParseResult => {
  const query: SafeCohortConsensusQuery = {};
  const provider = parseProvider(raw.provider);
  if (provider !== undefined) {
    query.provider = provider;
  }
  if (raw.weighting !== undefined) {
    if (raw.weighting !== 'equal' && raw.weighting !== 'conviction') {
      return { error: "weighting must be 'equal' or 'conviction'" };
    }
    query.weighting = raw.weighting;
  }
  if (raw.maxRiskScore !== undefined) {
    const value = Number(raw.maxRiskScore);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { error: 'maxRiskScore must be a number between 0 and 100' };
    }
    query.maxRiskScore = value;
  }
  if (raw.minParticipants !== undefined) {
    const value = Number(raw.minParticipants);
    if (!Number.isInteger(value) || value < 1) {
      return { error: 'minParticipants must be an integer >= 1' };
    }
    query.minimumConsensusParticipants = value;
  }
  if (raw.offset !== undefined) {
    const value = Number(raw.offset);
    if (!Number.isInteger(value) || value < 0) {
      return { error: 'offset must be an integer >= 0' };
    }
    query.offset = value;
  }
  if (raw.limit !== undefined) {
    const value = Number(raw.limit);
    if (!Number.isInteger(value) || value < 1) {
      return { error: 'limit must be an integer >= 1' };
    }
    query.limit = value;
  }
  return { query };
};
