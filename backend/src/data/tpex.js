// 櫃買中心（上櫃股票）資料存取模組
// 已用實際回應確認的欄位：Date、SecuritiesCompanyCode、Close、TradingShares
// Open/High/Low/股票名稱欄位是依照慣例推測，第一次實際部署時務必印出一筆原始資料核對欄位名稱是否正確

import { rocToIso, toNum, BROWSER_HEADERS } from './twse.js';

/**
 * 抓取上櫃股票「今天」全市場收盤資訊
 * 注意：同樣只回傳最新一個交易日的快照，沒有歷史查詢參數，
 * 要建立歷史資料庫，必須每天收盤後呼叫一次並存進自己的資料庫累積。
 */
export async function fetchOtcTodaySnapshot() {
  const res = await fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', {
    headers: BROWSER_HEADERS,
  });
  if (!res.ok) throw new Error(`TPEx 每日行情失敗：HTTP ${res.status}`);
  const rows = await res.json();
  return rows
    .map((r) => ({
      code: r.SecuritiesCompanyCode,
      name: r.CompanyName ?? r.SecuritiesName ?? r.Name ?? r.SecuritiesCompanyCode,
      date: rocToIso(r.Date),
      open: toNum(r.Open ?? r.OpeningPrice),
      high: toNum(r.High ?? r.HighestPrice),
      low: toNum(r.Low ?? r.LowestPrice),
      close: toNum(r.Close),
      volume: toNum(r.TradingShares),
    }))
    .filter((r) => r.close != null);
}
