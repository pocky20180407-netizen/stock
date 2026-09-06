import { readFileSync } from 'node:fs';
import { createTestD1 } from './test-d1-adapter.mjs';
import { executeBuy, executeSell, getMonthlySellTrades, TRADING_RULES } from './src/trading.js';

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

const schemaSql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const db = createTestD1(schemaSql);

// ---- 建立測試用的策略與帳戶（起始資金 100 萬） ----
await db
  .prepare(`INSERT INTO strategies (id, name, buy_conditions, sell_conditions, created_at) VALUES (1, '測試策略', '[]', '[]', '2026-08-01')`)
  .run();
await db
  .prepare(`INSERT INTO accounts (id, strategy_id, initial_capital, cash, created_at) VALUES (1, 1, 1000000, 1000000, '2026-08-01')`)
  .run();

// ---- 1. 正常買進：股價 100 元，應該買 1000 股（10萬/100=1000股），手續費 max(20, 1000*100*0.001425) ----
const buy1 = await executeBuy(db, 1, '2330', 100, '2026-08-03T09:05:00+08:00');
assert(buy1.success, '正常情況下買進應該成功');
assert(buy1.trade.shares === 1000, `10萬元用100元買進應該買到1000股，實際為 ${buy1.trade.shares}`);
const expectedFee1 = Math.max(20, Math.round(1000 * 100 * TRADING_RULES.FEE_RATE));
assert(buy1.trade.fee === expectedFee1, `手續費應為 ${expectedFee1}，實際為 ${buy1.trade.fee}`);

const accountAfterBuy1 = await db.prepare('SELECT * FROM accounts WHERE id = 1').first();
const expectedCashAfterBuy1 = 1000000 - (1000 * 100 + expectedFee1);
assert(accountAfterBuy1.cash === expectedCashAfterBuy1, `買進後現金應為 ${expectedCashAfterBuy1}，實際為 ${accountAfterBuy1.cash}`);

// ---- 2. 同一檔股票、同一策略不應重複買進 ----
const buy2 = await executeBuy(db, 1, '2330', 105, '2026-08-03T09:10:00+08:00');
assert(buy2.success === false, '同一檔股票已持有時，不應該重複買進');

// ---- 3. 股價太高、10萬元買不到1股時應該失敗 ----
const buy3 = await executeBuy(db, 1, '9999', 200000, '2026-08-03T09:10:00+08:00');
assert(buy3.success === false, '股價高於單筆投入金額時應該買不到1股而失敗');

// ---- 4. 買到達 MAX_POSITIONS 上限後應該拒絕 ----
// 這裡刻意開一個資金寬裕的獨立帳戶（帳戶2），單純測試「檔數上限」邏輯本身，
// 不要跟「資金是否剛好足夠付手續費」這件事混在一起（那是另一個獨立的真實限制，下面第4.5點會特別驗證）
await db
  .prepare(`INSERT INTO accounts (id, strategy_id, initial_capital, cash, created_at) VALUES (2, 1, 5000000, 5000000, '2026-08-01')`)
  .run();
const codes = ['1101', '1216', '1301', '1303', '2002', '2317', '2412', '2882', '2891', '3008'];
for (const code of codes) {
  const r = await executeBuy(db, 2, code, 50, '2026-08-03T09:15:00+08:00');
  assert(r.success, `帳戶2資金寬裕，建立測試部位 ${code} 應該成功`);
}
const posCount = await db.prepare('SELECT COUNT(*) as count FROM positions WHERE account_id = 2').first();
assert(posCount.count === TRADING_RULES.MAX_POSITIONS, `應該剛好持有 ${TRADING_RULES.MAX_POSITIONS} 檔，實際為 ${posCount.count}`);

const buyOverLimit = await executeBuy(db, 2, '3034', 50, '2026-08-03T09:20:00+08:00');
assert(buyOverLimit.success === false, `已達 ${TRADING_RULES.MAX_POSITIONS} 檔上限時，第11筆買進應該被拒絕`);

// ---- 4.5 真實情境：起始資金剛好等於「10檔 x 10萬」時，因為每筆還要付手續費，
//      實際上通常買不滿10檔——這是真實券商帳戶也會遇到的情況，不是bug，這裡驗證這個行為符合預期 ----
const tightBuys = ['1101', '1216', '1301', '1303', '2002', '2317', '2412', '2882', '2891'];
let tightSuccessCount = 1; // 帳戶1一開始已經成功買了2330
for (const code of tightBuys) {
  const r = await executeBuy(db, 1, code, 50, '2026-08-03T09:15:00+08:00');
  if (r.success) tightSuccessCount++;
}
assert(
  tightSuccessCount < TRADING_RULES.MAX_POSITIONS,
  `起始資金剛好=10檔x10萬時，扣掉手續費後應該買不滿10檔（實際成功 ${tightSuccessCount} 檔），這是真實、預期中的資金限制`
);

// ---- 5. 賣出：用比買價高的價格賣出，應該獲利，勝率判斷為賺錢 ----
const position2330 = await db.prepare(`SELECT * FROM positions WHERE account_id = 1 AND code = '2330'`).first();
const sell1 = await executeSell(db, 1, position2330, 110, '2026-08-10T13:25:00+08:00');
assert(sell1.success, '賣出應該成功');
assert(sell1.trade.isWin === true, `用110元賣出成本100元買進的部位，應該判定為獲利，實際 netPnl=${sell1.trade.netPnl}`);

const positionGone = await db.prepare(`SELECT * FROM positions WHERE account_id = 1 AND code = '2330'`).first();
assert(positionGone === null, '賣出後，該檔持倉應該被移除');

// ---- 6. 賣出後應該可以查到這筆月份的已實現交易 ----
const augTrades = await getMonthlySellTrades(db, 1, '2026-08');
assert(augTrades.length === 1, `8月份應該查到1筆已出清交易，實際為 ${augTrades.length}`);
assert(augTrades[0].matched_buy_trade_id === buy1.trade.tradeId, '賣出紀錄應該正確連結回對應的買進交易，才能算損益');

console.log('\n交易引擎測試全部通過（用真實 SQLite 資料庫跑過完整的 schema）');
