// 選股條件庫：定義所有可用的條件類型，並提供統一的判斷邏輯
// 每個策略 = 買進條件組合（buy_conditions + buy_logic）+ 賣出條件組合（sell_conditions + sell_logic）
// data 參數是 indicators.js 的 buildIndicatorBundle() 算出來的指標組合，
// 可再附加 institutional（三大法人）、valuation（本益比／殖利率）等資料

import { sma } from './indicators.js';

export const CONDITION_TYPES = {
  KD_GOLDEN_CROSS: {
    label: 'KD黃金交叉',
    defaultParams: {},
    evaluate: (data) => {
      const i = data.closes.length - 1;
      if (i < 1 || data.k[i] == null || data.k[i - 1] == null) return false;
      return data.k[i - 1] <= data.d[i - 1] && data.k[i] > data.d[i];
    },
  },
  KD_DEAD_CROSS: {
    label: 'KD死亡交叉',
    defaultParams: {},
    evaluate: (data) => {
      const i = data.closes.length - 1;
      if (i < 1 || data.k[i] == null || data.k[i - 1] == null) return false;
      return data.k[i - 1] >= data.d[i - 1] && data.k[i] < data.d[i];
    },
  },
  PRICE_ABOVE_MA: {
    label: '股價站上均線',
    defaultParams: { period: 20 },
    evaluate: (data, params) => {
      const i = data.closes.length - 1;
      const ma = sma(data.closes, params.period);
      return ma[i] != null && data.closes[i] > ma[i];
    },
  },
  PRICE_BELOW_MA: {
    label: '股價跌破均線',
    defaultParams: { period: 20 },
    evaluate: (data, params) => {
      const i = data.closes.length - 1;
      const ma = sma(data.closes, params.period);
      return ma[i] != null && data.closes[i] < ma[i];
    },
  },
  RSI_OVERSOLD: {
    label: 'RSI超賣',
    defaultParams: { threshold: 30 },
    evaluate: (data, params) => {
      const i = data.closes.length - 1;
      return data.rsi14[i] != null && data.rsi14[i] < params.threshold;
    },
  },
  RSI_OVERBOUGHT: {
    label: 'RSI超買',
    defaultParams: { threshold: 70 },
    evaluate: (data, params) => {
      const i = data.closes.length - 1;
      return data.rsi14[i] != null && data.rsi14[i] > params.threshold;
    },
  },
  VOLUME_SPIKE: {
    label: '成交量爆量',
    defaultParams: { multiple: 2 },
    evaluate: (data, params) => {
      const i = data.closes.length - 1;
      return data.volRatio5[i] != null && data.volRatio5[i] >= params.multiple;
    },
  },
  BOLLINGER_BREAKOUT_UP: {
    label: '突破布林上軌',
    defaultParams: {},
    evaluate: (data) => {
      const i = data.closes.length - 1;
      return data.bollUpper[i] != null && data.closes[i] > data.bollUpper[i];
    },
  },
  INSTITUTIONAL_BUY_STREAK: {
    label: '三大法人連續買超',
    defaultParams: { days: 3 },
    evaluate: (data, params) => (data.institutional?.buyStreak ?? 0) >= params.days,
  },
  PE_RATIO_BELOW: {
    label: '本益比低於',
    defaultParams: { max: 15 },
    evaluate: (data, params) => {
      const pe = data.valuation?.pe;
      return pe != null && pe > 0 && pe < params.max;
    },
  },
  DIVIDEND_YIELD_ABOVE: {
    label: '殖利率高於',
    defaultParams: { min: 4 },
    evaluate: (data, params) => {
      const y = data.valuation?.dividendYield;
      return y != null && y > params.min;
    },
  },
  TAKE_PROFIT_PERCENT: {
    label: '停利百分比',
    defaultParams: { percent: 10 },
    evaluate: (data, params, position) => {
      if (!position) return false;
      const i = data.closes.length - 1;
      const gainPct = ((data.closes[i] - position.buyPrice) / position.buyPrice) * 100;
      return gainPct >= params.percent;
    },
  },
  STOP_LOSS_PERCENT: {
    label: '停損百分比',
    defaultParams: { percent: 8 },
    evaluate: (data, params, position) => {
      if (!position) return false;
      const i = data.closes.length - 1;
      const changePct = ((data.closes[i] - position.buyPrice) / position.buyPrice) * 100;
      return changePct <= -params.percent;
    },
  },
};

/**
 * 判斷一檔股票是否符合一組條件
 * @param {object} data buildIndicatorBundle() 產生的指標組合（可再加 institutional / valuation）
 * @param {Array<{type:string, params?:object}>} conditions 條件陣列
 * @param {'ALL'|'ANY'} logic 'ALL' = 全部符合才算, 'ANY' = 符合任一即算
 * @param {object|null} position 判斷賣出條件時，帶入目前持倉（需含 buyPrice）
 */
export function evaluateConditions(data, conditions, logic, position = null) {
  if (!conditions || conditions.length === 0) return false;
  const results = conditions.map((c) => {
    const def = CONDITION_TYPES[c.type];
    if (!def) return false;
    const params = { ...def.defaultParams, ...(c.params || {}) };
    return def.evaluate(data, params, position);
  });
  return logic === 'ANY' ? results.some(Boolean) : results.every(Boolean);
}
