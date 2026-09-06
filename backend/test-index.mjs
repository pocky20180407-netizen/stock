import { readFileSync } from 'node:fs';
import { createTestD1 } from './test-d1-adapter.mjs';
import {
  isTradingHours,
  planTradesForCycle,
  upsertStocksAndPrices,
  loadAllPositions,
  loadHistoryForCodes,
  loadTodayMarketRows,
  getActiveStrategiesWithAccounts,
} from './src/index.js';
import { buildIndicatorBundle } from './src/indicators.js';

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// =========================================================
// 1. isTradingHours()
// =========================================================
// new Date(Date.UTC(...)) 建構的時間，經過 nowInTaipei() 的邏輯後 getUTCDay/Hours 讀到的就是台北時間，
// 這裡直接建構「已經是台北時間」的 Date 物件來測試 isTradingHours 本身的邏輯。
assert(isTradingHours(new Date(Date.UTC(2026, 7, 27, 9, 0))) === true, '週四早上9:00應該算交易時段（27日是週四）');
assert(isTradingHours(new Date(Date.UTC(2026, 7, 27, 13, 30))) === true, '週四13:30應該還算交易時段（收盤當下）');
assert(isTradingHours(new Date(Date.UTC(2026, 7, 27, 13, 31))) === false, '週四13:31應該已經過交易時段');
assert(isTradingHours(new Date(Date.UTC(2026, 7, 27, 8, 59))) === false, '週四8:59應該還沒開盤');
assert(isTradingHours(new Date(Date.UTC(2026, 7, 29, 10, 0))) === false, '週六即使在時段內也不該執行（29日是週六）');
assert(isTradingHours(new Date(Date.UTC(2026, 7, 30, 10, 0))) === false, '週日即使在時段內也不該執行（30日是週日）');

// =========================================================
// 2. planTradesForCycle() —— 核心決策邏輯，不碰資料庫
// =========================================================

// 用「先跌後急漲」的走勢構造一組會出現KD黃金交叉的歷史資料，並先印出K/D確認真的有交叉，避免測試本身寫錯而誤判
function buildCandles(closes) {
  return closes.map((close, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
  }));
}
const dipThenSpike = [100, 96, 92, 88, 85, 83, 82, 82, 83, 88, 96]; // 最後兩天急漲，觸發KD黃金交叉
const goldenCrossBundle = buildIndicatorBundle(buildCandles(dipThenSpike));
const lastIdx = dipThenSpike.length - 1;
assert(
  goldenCrossBundle.k[lastIdx - 1] <= goldenCrossBundle.d[lastIdx - 1] && goldenCrossBundle.k[lastIdx] > goldenCrossBundle.d[lastIdx],
  `測試資料本身必須真的產生KD黃金交叉，才能拿來測試買進邏輯（K:${goldenCrossBundle.k[lastIdx]?.toFixed(1)} D:${goldenCrossBundle.d[lastIdx]?.toFixed(1)}）`
);

const flatCandles = buildCandles([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]); // 平盤，不該觸發任何訊號

const strategies = [
  {
    strategyId: 1,
    accountId: 1,
    buyConditions: [{ type: 'KD_GOLDEN_CROSS' }],
    buyLogic: 'ALL',
    sellConditions: [{ type: 'STOP_LOSS_PERCENT', params: { percent: 8 } }],
    sellLogic: 'ANY',
  },
];

const allRows = [
  { code: '2330', close: dipThenSpike[lastIdx] }, // 應該觸發買進
  { code: '1101', close: 90 }, // 帳戶1目前持有，成本100，跌到90（-10%）應該觸發停損賣出
  { code: '2317', close: 100 }, // 平盤股，不該有任何動作
];
const historyByCode = new Map([
  ['2330', buildCandles(dipThenSpike)],
  // 1101 的歷史資料最後一筆刻意設為90，對應allRows裡1101現在的即時價格90
  // （實際排程中，今天的即時價會先upsert進資料庫，loadHistoryForCodes讀出來的歷史陣列最後一筆本來就會是今天的價格，這裡讓測試資料模擬同樣的狀態）
  ['1101', buildCandles([...dipThenSpike.slice(0, -1), 90])],
  ['2317', flatCandles],
]);
const positionsByAccount = new Map([[1, new Map([['1101', { code: '1101', buy_price: 100 }]])]]);

const plan1 = planTradesForCycle({ allRows, valuations: {}, historyByCode, positionsByAccount, strategies });
assert(plan1.buys.length === 1 && plan1.buys[0].code === '2330', `應該只對2330觸發1筆買進，實際買進：${JSON.stringify(plan1.buys)}`);
assert(plan1.sells.length === 1 && plan1.sells[0].position.code === '1101', `應該只對1101觸發1筆賣出，實際賣出：${JSON.stringify(plan1.sells)}`);

// ---- 2.1 已經達到最大持倉上限的帳戶，即使訊號符合也不該再買進 ----
const fullPositions = new Map();
for (let i = 0; i < 10; i++) fullPositions.set(`999${i}`, { code: `999${i}`, buy_price: 50 });
const positionsAtLimit = new Map([[1, fullPositions]]);
const plan2 = planTradesForCycle({ allRows, valuations: {}, historyByCode, positionsByAccount: positionsAtLimit, strategies });
assert(plan2.buys.length === 0, `已經持有10檔的帳戶不應該再產生新的買進訊號，實際：${JSON.stringify(plan2.buys)}`);

// ---- 2.2 同一輪內，同一帳戶不會對同一檔股票重複下單（用兩個都會觸發黃金交叉的同代號資料模擬） ----
const dupRows = [
  { code: '2330', close: dipThenSpike[lastIdx] },
  { code: '2330', close: dipThenSpike[lastIdx] }, // 故意重複同一檔（模擬資料源理論上不該重複，但引擎本身要防呆）
];
const plan3 = planTradesForCycle({
  allRows: dupRows,
  valuations: {},
  historyByCode: new Map([['2330', buildCandles(dipThenSpike)]]),
  positionsByAccount: new Map(),
  strategies,
});
assert(plan3.buys.length === 1, `同一輪同一帳戶對同一檔股票最多只能出現1筆買進，實際：${plan3.buys.length}筆`);

// =========================================================
// 3. 資料庫輔助函式：upsertStocksAndPrices / loadAllPositions / loadHistoryForCodes / getActiveStrategiesWithAccounts
// =========================================================
const schemaSql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const db = createTestD1(schemaSql);

await db.prepare(`INSERT INTO strategies (id, name, buy_conditions, buy_logic, sell_conditions, sell_logic, is_active, created_at)
  VALUES (1, '測試策略', '[{"type":"KD_GOLDEN_CROSS"}]', 'ALL', '[{"type":"STOP_LOSS_PERCENT","params":{"percent":8}}]', 'ANY', 1, '2026-08-01')`).run();
await db.prepare(`INSERT INTO strategies (id, name, buy_conditions, buy_logic, sell_conditions, sell_logic, is_active, created_at)
  VALUES (2, '停用中的策略', '[]', 'ALL', '[]', 'ANY', 0, '2026-08-01')`).run(); // 用來確認 is_active=0 的策略不會被讀到
await db.prepare(`INSERT INTO accounts (id, strategy_id, initial_capital, cash, created_at) VALUES (1, 1, 1000000, 1000000, '2026-08-01')`).run();
await db.prepare(`INSERT INTO accounts (id, strategy_id, initial_capital, cash, created_at) VALUES (2, 2, 1000000, 1000000, '2026-08-01')`).run();
await db.prepare(`INSERT INTO positions (account_id, code, shares, buy_price, opened_at) VALUES (1, '1101', 1000, 100, '2026-08-01')`).run();

const activeStrategies = await getActiveStrategiesWithAccounts(db);
assert(activeStrategies.length === 1, `應該只讀到1組啟用中的策略，實際為 ${activeStrategies.length}`);
assert(activeStrategies[0].buyConditions[0].type === 'KD_GOLDEN_CROSS', 'buy_conditions欄位的JSON字串應該被正確解析成物件');

const positions = await loadAllPositions(db);
assert(positions.get(1).get('1101').buy_price === 100, 'loadAllPositions應該正確讀出帳戶1持有1101、成本100');
assert(!positions.has(2), '帳戶2沒有持倉，Map裡不應該有帳戶2的key');

await upsertStocksAndPrices(
  db,
  [{ code: '2330', name: '台積電', date: '2026-08-20', open: 1180, high: 1195, low: 1175, close: 1190, volume: 18000000 }],
  'TSE'
);
const priceRow = await db.prepare(`SELECT * FROM daily_prices WHERE code='2330' AND date='2026-08-20'`).first();
assert(priceRow.close === 1190, `upsertStocksAndPrices應該正確寫入收盤價，實際為 ${priceRow.close}`);

// upsert 同一天同一檔再寫一次（模擬同一天內被排程重複觸發），應該更新而不是報錯或產生第二筆
await upsertStocksAndPrices(
  db,
  [{ code: '2330', name: '台積電', date: '2026-08-20', open: 1180, high: 1200, low: 1175, close: 1198, volume: 19000000 }],
  'TSE'
);
const priceRowUpdated = await db.prepare(`SELECT * FROM daily_prices WHERE code='2330' AND date='2026-08-20'`).first();
assert(priceRowUpdated.close === 1198, `重複upsert同一天應該更新收盤價為最新值，實際為 ${priceRowUpdated.close}`);
const countCheck = await db.prepare(`SELECT COUNT(*) as c FROM daily_prices WHERE code='2330' AND date='2026-08-20'`).first();
assert(countCheck.c === 1, `同一檔同一天重複upsert不應該產生兩筆紀錄，實際為 ${countCheck.c}筆`);

const history = await loadHistoryForCodes(db, 70);
assert(history.get('2330').length === 1, 'loadHistoryForCodes應該讀到剛剛寫入的那1筆2330歷史資料');

// ---- loadTodayMarketRows：這是給「上櫃資料改由GitHub Actions寫入資料庫」用的讀取函式 ----
await upsertStocksAndPrices(
  db,
  [{ code: '6488', name: '環球晶', date: '2026-08-20', open: 500, high: 510, low: 495, close: 505, volume: 3000000 }],
  'OTC'
);
const otcToday = await loadTodayMarketRows(db, '2026-08-20', 'OTC');
assert(otcToday.length === 1 && otcToday[0].code === '6488', 'loadTodayMarketRows應該只讀到market=OTC、日期正確的那一筆');
const tseToday = await loadTodayMarketRows(db, '2026-08-20', 'TSE');
assert(tseToday.length === 1 && tseToday[0].code === '2330', 'loadTodayMarketRows應該正確區分TSE跟OTC，不會混在一起');
const noMatch = await loadTodayMarketRows(db, '2099-01-01', 'TSE');
assert(noMatch.length === 0, '查詢沒有資料的日期應該回傳空陣列');

console.log('\n排程主程式測試全部通過');
