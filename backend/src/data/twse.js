// 台灣證交所（上市股票）資料存取模組

export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  Referer: 'https://www.tpex.org.tw/zh-tw/mainboard/trading/info/mi-pricing.html',
};

const ROC_YEAR_OFFSET = 1911;

/** 民國年日期字串（例如 "1150801"）轉西元 ISO 格式（"2026-08-01"） */
export function rocToIso(rocDate) {
  const s = String(rocDate).trim();
  const y = parseInt(s.slice(0, s.length - 4), 10) + ROC_YEAR_OFFSET;
  const m = s.slice(-4, -2);
  const d = s.slice(-2);
  return `${y}-${m}-${d}`;
}

/** 安全把官方端點回傳的字串數字轉成 number（可能有千分位逗號、空字串或 '--'） */
export function toNum(v) {
  if (v == null) return null;
  const cleaned = String(v).replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '--' || cleaned === '---') return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

/**
 * 抓取上市股票「今天」全市場收盤資訊（開高低收、成交量）
 * 來源：證交所官方 OpenAPI（有 Swagger 文件），欄位名稱已用實際回應驗證過
 * 注意：這個端點只回傳「最新一個交易日」的快照，沒有歷史區間查詢參數，
 * 要建立歷史資料庫，必須每天收盤後呼叫一次並存進自己的資料庫累積。
 */
export async function fetchTseTodaySnapshot() {
  const res = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
    headers: BROWSER_HEADERS,
  });
  if (!res.ok) throw new Error(`TWSE STOCK_DAY_ALL 失敗：HTTP ${res.status}`);
  const rows = await res.json();
  return rows
    .map((r) => ({
      code: r.Code,
      name: r.Name,
      date: rocToIso(r.Date),
      open: toNum(r.OpeningPrice),
      high: toNum(r.HighestPrice),
      low: toNum(r.LowestPrice),
      close: toNum(r.ClosingPrice),
      volume: toNum(r.TradeVolume),
    }))
    .filter((r) => r.close != null);
}

/** 抓取上市股票本益比、殖利率、股價淨值比（同樣是快照，每天收盤後更新一次即可） */
export async function fetchTseValuations() {
  const res = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL', {
    headers: BROWSER_HEADERS,
  });
  if (!res.ok) throw new Error(`TWSE BWIBBU_ALL 失敗：HTTP ${res.status}`);
  const rows = await res.json();
  const out = {};
  for (const r of rows) {
    out[r.Code] = {
      pe: toNum(r.PEratio),
      dividendYield: toNum(r.DividendYield),
      pbRatio: toNum(r.PriceBookRatio),
    };
  }
  return out;
}

/**
 * 補歷史資料用：抓取「某一天」上市全市場收盤行情，用來一次性回補技術指標需要的歷史天數
 * （KD需要9天、RSI需要14天、MA60需要60天，剛上線時資料庫是空的，需要這個函式回補）
 * 來源不是正式 OpenAPI 文件的一部分，是證交所網站本身在用的內部端點，
 * 欄位名稱沿用與 fetchTseTodaySnapshot 相同的命名，但實際部署時務必先手動測試一次再大量呼叫。
 */
export async function fetchTseHistoricalDay(dateIso) {
  const ymd = dateIso.replace(/-/g, '');
  const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?date=${ymd}&response=json`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`TWSE 歷史資料失敗（${dateIso}）：HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({
      code: r.Code,
      name: r.Name,
      date: dateIso,
      open: toNum(r.OpeningPrice),
      high: toNum(r.HighestPrice),
      low: toNum(r.LowestPrice),
      close: toNum(r.ClosingPrice),
      volume: toNum(r.TradeVolume),
    }))
    .filter((r) => r.close != null);
}
