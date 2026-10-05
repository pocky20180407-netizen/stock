// 開發用的假API伺服器：回傳有實際內容的假資料，方便本地預覽/截圖驗證畫面，不是正式後端
import { createServer } from 'node:http';

const conditions = [
  { type: 'KD_GOLDEN_CROSS', label: 'KD黃金交叉', defaultParams: {} },
  { type: 'KD_DEAD_CROSS', label: 'KD死亡交叉', defaultParams: {} },
  { type: 'PRICE_ABOVE_MA', label: '股價站上均線', defaultParams: { period: 20 } },
  { type: 'PRICE_BELOW_MA', label: '股價跌破均線', defaultParams: { period: 20 } },
  { type: 'RSI_OVERSOLD', label: 'RSI超賣', defaultParams: { threshold: 30 } },
  { type: 'RSI_OVERBOUGHT', label: 'RSI超買', defaultParams: { threshold: 70 } },
  { type: 'VOLUME_SPIKE', label: '成交量爆量', defaultParams: { multiple: 2 } },
  { type: 'BOLLINGER_BREAKOUT_UP', label: '突破布林上軌', defaultParams: {} },
  { type: 'INSTITUTIONAL_BUY_STREAK', label: '三大法人連續買超', defaultParams: { days: 3 } },
  { type: 'PE_RATIO_BELOW', label: '本益比低於', defaultParams: { max: 15 } },
  { type: 'DIVIDEND_YIELD_ABOVE', label: '殖利率高於', defaultParams: { min: 4 } },
  { type: 'TAKE_PROFIT_PERCENT', label: '停利百分比', defaultParams: { percent: 10 } },
  { type: 'STOP_LOSS_PERCENT', label: '停損百分比', defaultParams: { percent: 8 } },
];

const strategies = [
  {
    id: 1, name: 'KD低檔黃金交叉', isActive: true,
    buyConditions: [{ type: 'KD_GOLDEN_CROSS', params: {} }], buyLogic: 'ALL',
    sellConditions: [{ type: 'STOP_LOSS_PERCENT', params: { percent: 8 } }], sellLogic: 'ANY',
    account: { id: 1, initialCapital: 1000000, cash: 742300, positionCount: 3 },
  },
  {
    id: 2, name: '法人連買＋量增', isActive: true,
    buyConditions: [{ type: 'INSTITUTIONAL_BUY_STREAK', params: { days: 3 } }, { type: 'VOLUME_SPIKE', params: { multiple: 2 } }],
    buyLogic: 'ALL', sellConditions: [{ type: 'TAKE_PROFIT_PERCENT', params: { percent: 12 } }], sellLogic: 'ANY',
    account: { id: 2, initialCapital: 1000000, cash: 1085600, positionCount: 5 },
  },
  {
    id: 3, name: '低本益比高股息', isActive: false,
    buyConditions: [{ type: 'PE_RATIO_BELOW', params: { max: 15 } }, { type: 'DIVIDEND_YIELD_ABOVE', params: { min: 4 } }],
    buyLogic: 'ALL', sellConditions: [], sellLogic: 'ANY',
    account: { id: 3, initialCapital: 1000000, cash: 968200, positionCount: 2 },
  },
];

const positions = [
  { id: 1, code: '2330', stock_name: '台積電', shares: 1000, buy_price: 1150 },
  { id: 2, code: '2317', stock_name: '鴻海', shares: 3000, buy_price: 198 },
  { id: 3, code: '3008', stock_name: '大立光', shares: 100, buy_price: 2450 },
];

const trades = [
  { id: 1, side: 'BUY', code: '2330', shares: 1000, price: 1150, executed_at: '2026-09-03T09:35:00+08:00' },
  { id: 2, side: 'SELL', code: '2454', shares: 500, price: 880, executed_at: '2026-09-02T10:20:00+08:00' },
  { id: 3, side: 'BUY', code: '2317', shares: 3000, price: 198, executed_at: '2026-09-01T11:05:00+08:00' },
];

const stocks = [
  { code: '2330', name: '台積電', market: 'TSE', date: '2026-09-04', close: 1190, volume: 18234567, changePct: 1.28 },
  { code: '2317', name: '鴻海', market: 'TSE', date: '2026-09-04', close: 201.5, volume: 32456789, changePct: -0.74 },
  { code: '2454', name: '聯發科', market: 'TSE', date: '2026-09-04', close: 1075, volume: 4521300, changePct: 2.15 },
  { code: '3008', name: '大立光', market: 'TSE', date: '2026-09-04', close: 2480, volume: 312400, changePct: -1.03 },
  { code: '6488', name: '環球晶', market: 'OTC', date: '2026-09-04', close: 505, volume: 1203400, changePct: 0.6 },
];

const stockDetail = {
  code: '2330', name: '台積電', market: 'TSE',
  latest: { close: 1190, k: 78.3, d: 65.1, rsi14: 62.4, ma5: 1178.4, ma20: 1155.2, ma60: 1102.8, bollUpper: 1205.3, bollLower: 1120.6, volRatio5: 1.42 },
};

const reports = [
  { strategyId: 2, strategyName: '法人連買＋量增', tradeCount: 8, winRate: 62.5, monthlyReturnPct: 3.4 },
  { strategyId: 1, strategyName: 'KD低檔黃金交叉', tradeCount: 5, winRate: 40, monthlyReturnPct: -1.2 },
  { strategyId: 3, strategyName: '低本益比高股息', tradeCount: 0, winRate: null, monthlyReturnPct: 0 },
];

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/conditions') res.end(JSON.stringify({ conditions }));
  else if (url.pathname === '/api/strategies') res.end(JSON.stringify({ strategies }));
  else if (url.pathname.endsWith('/positions')) res.end(JSON.stringify({ positions }));
  else if (url.pathname.endsWith('/trades')) res.end(JSON.stringify({ trades }));
  else if (url.pathname === '/api/stocks') {
    const search = url.searchParams.get('search') || '';
    res.end(JSON.stringify({ stocks: stocks.filter((s) => !search || s.code.startsWith(search) || s.name.includes(search)) }));
  } else if (url.pathname.startsWith('/api/stocks/')) res.end(JSON.stringify(stockDetail));
  else if (url.pathname === '/api/reports/monthly') res.end(JSON.stringify({ month: '2026-09', reports }));
  else res.end(JSON.stringify({ success: true }));
}).listen(8787, () => console.log('假API伺服器啟動於 :8787'));
