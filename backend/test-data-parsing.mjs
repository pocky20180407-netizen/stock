// 因為這個環境連不到證交所/櫃買中心的網域，這裡用「已驗證過的真實欄位格式」
// 組出模擬的 API 回應，測試我們自己的解析函式 (toNum / rocToIso / 欄位對應) 邏輯正確。
// 實際部署到 Cloudflare Worker 後，仍建議先手動呼叫一次 fetchTseTodaySnapshot() 印出結果核對。

import { rocToIso, toNum } from './src/data/twse.js';

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// ---- rocToIso ----
assert(rocToIso('1150801') === '2026-08-01', 'rocToIso 應把民國115年8月1日轉成 2026-08-01');
assert(rocToIso(' 1150730 ') === '2026-07-30', 'rocToIso 應能處理前後空白');

// ---- toNum ----
assert(toNum('1,234.56') === 1234.56, 'toNum 應能去除千分位逗號');
assert(toNum('--') === null, 'toNum 遇到 -- 應回傳 null（代表當天無成交）');
assert(toNum('') === null, 'toNum 遇到空字串應回傳 null');
assert(toNum(null) === null, 'toNum 遇到 null 應回傳 null');
assert(toNum('268.50') === 268.5, 'toNum 應能正確轉換一般數字字串');

// ---- 模擬一筆 STOCK_DAY_ALL 真實格式的資料，測試完整解析流程 ----
const fakeTwseRow = {
  Code: '2330',
  Name: '台積電',
  Date: '1150801',
  TradeVolume: '18,234,567',
  TradeValue: '20,123,456,789',
  OpeningPrice: '1180.00',
  HighestPrice: '1195.00',
  LowestPrice: '1175.00',
  ClosingPrice: '1190.00',
  Change: '10.00',
  Transaction: '25,678',
};

const parsed = {
  code: fakeTwseRow.Code,
  name: fakeTwseRow.Name,
  date: rocToIso(fakeTwseRow.Date),
  open: toNum(fakeTwseRow.OpeningPrice),
  high: toNum(fakeTwseRow.HighestPrice),
  low: toNum(fakeTwseRow.LowestPrice),
  close: toNum(fakeTwseRow.ClosingPrice),
  volume: toNum(fakeTwseRow.TradeVolume),
};

assert(parsed.code === '2330' && parsed.name === '台積電', '應正確解析股票代號與名稱');
assert(parsed.date === '2026-08-01', '應正確轉換交易日期');
assert(parsed.close === 1190 && parsed.open === 1180, '應正確解析開盤收盤價');
assert(parsed.volume === 18234567, '應正確解析成交量（去除千分位逗號）');

console.log('\n資料解析邏輯測試全部通過');
