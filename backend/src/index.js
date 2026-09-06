// 排程主程式：Cloudflare Cron Trigger 每5分鐘呼叫一次 scheduled()
// 設計上把「純決策邏輯」(planTradesForCycle) 跟「資料庫讀寫」(runScreeningCycle) 分開，
// 決策邏輯不直接碰資料庫，可以單獨用假資料測試，不用真的連資料庫或連網路。

import { fetchTseTodaySnapshot, fetchTseValuations } from './data/twse.js';
import { buildIndicatorBundle } from './indicators.js';
import { evaluateConditions } from './conditions.js';
import { executeBuy, executeSell, TRADING_RULES } from './trading.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScreeningCycle(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    // 部署後可以直接用瀏覽器打開 https://你的網址/run-now 手動跑一次，方便測試，不用等到交易時段、也不用學wrangler指令
    // 這是給自己測試用的簡易端點，沒有做存取保護；如果之後在意有人亂觸發，可以再加一組密語驗證
    if (url.pathname === '/run-now') {
      try {
        const result = await runScreeningCycle(env, { force: true });
        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      } catch (err) {
        // 不管哪裡出錯，都直接把錯誤訊息跟發生位置顯示出來，不要讓Cloudflare跳出看不出原因的錯誤頁
        return new Response(
          JSON.stringify({ success: false, error: err.message, stack: err.stack }, null, 2),
          { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        );
      }
    }

    // 給 GitHub Actions 用的端點：因為 TPEx 會擋掉 Cloudflare 的IP，改由 GitHub Actions 抓取上櫃資料後推送進來
    if (url.pathname === '/ingest/otc' && request.method === 'POST') {
      const secret = request.headers.get('X-Ingest-Secret');
      if (!env.INGEST_SECRET || secret !== env.INGEST_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }
      try {
        const rows = await request.json();
        if (!Array.isArray(rows)) {
          return new Response(JSON.stringify({ success: false, error: 'body必須是陣列' }), { status: 400 });
        }
        await upsertStocksAndPrices(env.DB, rows, 'OTC');
        return new Response(JSON.stringify({ success: true, count: rows.length }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
    }
    return new Response('TW Stock Sim backend is running', { status: 200 });
  },
};

/** 把「現在」換算成台北時間（Workers 預設是 UTC） */
export function nowInTaipei() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

/** 判斷（已經換算成台北時間的）某個時間點是不是在交易時段內（週一到週五 09:00-13:30） */
export function isTradingHours(taipeiDate) {
  const day = taipeiDate.getUTCDay(); // 因為 nowInTaipei() 已經手動加了8小時，這裡用 getUTCDay 讀到的其實是台北的星期幾
  if (day === 0 || day === 6) return false;
  const minutesSinceMidnight = taipeiDate.getUTCHours() * 60 + taipeiDate.getUTCMinutes();
  return minutesSinceMidnight >= 9 * 60 && minutesSinceMidnight <= 13 * 60 + 30;
}

/**
 * 純決策邏輯：給定這一輪的市場資料、指標、目前持倉、策略設定，算出這一輪該執行哪些買賣
 * 不碰資料庫，方便單獨測試
 */
export function planTradesForCycle({ allRows, valuations, historyByCode, positionsByAccount, strategies }) {
  const buys = [];
  const sells = [];

  // 這一輪「暫定」的持倉狀態（避免同一輪內，同一策略對同一檔重複買進、或超過檔數上限）
  const workingHeldCodes = new Map(); // accountId -> Set(code)
  for (const [accountId, posMap] of positionsByAccount.entries()) {
    workingHeldCodes.set(accountId, new Set(posMap.keys()));
  }

  for (const row of allRows) {
    const history = historyByCode.get(row.code);
    if (!history || history.length < 9) continue; // 資料還不夠算KD，先跳過

    const bundle = buildIndicatorBundle(history);
    bundle.valuation = valuations[row.code] || {};
    bundle.institutional = {}; // 三大法人資料之後補上，現在先給空物件（相關條件會自然判斷為不符合）

    for (const strat of strategies) {
      const accountPositions = positionsByAccount.get(strat.accountId) || new Map();
      const held = accountPositions.get(row.code);
      const workingSet = workingHeldCodes.get(strat.accountId) || new Set();

      if (held) {
        const shouldSell = evaluateConditions(bundle, strat.sellConditions, strat.sellLogic, {
          buyPrice: held.buy_price,
        });
        if (shouldSell) sells.push({ accountId: strat.accountId, position: held, price: row.close });
      } else if (workingSet.size < TRADING_RULES.MAX_POSITIONS && !workingSet.has(row.code)) {
        const shouldBuy = evaluateConditions(bundle, strat.buyConditions, strat.buyLogic, null);
        if (shouldBuy) {
          buys.push({ accountId: strat.accountId, code: row.code, price: row.close });
          workingSet.add(row.code);
          workingHeldCodes.set(strat.accountId, workingSet);
        }
      }
    }
  }

  return { buys, sells };
}

/** 把 planTradesForCycle() 算出來的計畫，實際寫進資料庫（呼叫已經測試過的 trading.js） */
export async function applyTrades(db, plan, nowIso) {
  let buyCount = 0;
  let sellCount = 0;
  // 先處理賣出，釋放出來的現金與部位額度，同一輪就能被買進用到
  for (const s of plan.sells) {
    const result = await executeSell(db, s.accountId, s.position, s.price, nowIso);
    if (result.success) sellCount++;
  }
  for (const b of plan.buys) {
    const result = await executeBuy(db, b.accountId, b.code, b.price, nowIso);
    if (result.success) buyCount++;
  }
  return { buyCount, sellCount };
}

/** 把今天的股票基本資料與收盤快照 upsert 進資料庫（用 batch 一次送出，避免上千筆逐筆等待） */
export async function upsertStocksAndPrices(db, rows, market) {
  if (rows.length === 0) return;
  const nowStr = new Date().toISOString();
  const stmts = [];
  for (const r of rows) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO stocks (code, name, market, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(code) DO UPDATE SET name=excluded.name, market=excluded.market, updated_at=excluded.updated_at`
        )
        .bind(r.code, r.name, market, nowStr)
    );
    stmts.push(
      db
        .prepare(
          `INSERT INTO daily_prices (code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(code, date) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume`
        )
        .bind(r.code, r.date, r.open, r.high, r.low, r.close, r.volume)
    );
  }
  await db.batch(stmts);
}

/** 讀出所有帳戶目前的持倉，組成 Map<accountId, Map<code, positionRow>> 方便查找 */
export async function loadAllPositions(db) {
  const { results } = await db.prepare('SELECT * FROM positions').all();
  const map = new Map();
  for (const p of results) {
    if (!map.has(p.account_id)) map.set(p.account_id, new Map());
    map.get(p.account_id).set(p.code, p);
  }
  return map;
}

/** 一次撈出最近 N 天所有股票的歷史股價，組成 Map<code, 該檔的歷史陣列(舊到新)> */
export async function loadHistoryForCodes(db, days) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.ceil(days * 1.6)); // 交易日大約是日曆天的6成多，抓寬一點確保天數夠
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const { results } = await db
    .prepare('SELECT * FROM daily_prices WHERE date >= ? ORDER BY code, date')
    .bind(cutoffIso)
    .all();

  const map = new Map();
  for (const row of results) {
    if (!map.has(row.code)) map.set(row.code, []);
    map.get(row.code).push(row);
  }
  return map;
}

/** 讀出所有啟用中的策略，連同各自對應的虛擬帳戶id */
export async function getActiveStrategiesWithAccounts(db) {
  const { results } = await db
    .prepare(
      `SELECT s.id as strategyId, s.buy_conditions, s.buy_logic, s.sell_conditions, s.sell_logic, a.id as accountId
       FROM strategies s JOIN accounts a ON a.strategy_id = s.id
       WHERE s.is_active = 1`
    )
    .all();
  return results.map((r) => ({
    strategyId: r.strategyId,
    accountId: r.accountId,
    buyConditions: JSON.parse(r.buy_conditions),
    buyLogic: r.buy_logic,
    sellConditions: JSON.parse(r.sell_conditions),
    sellLogic: r.sell_logic,
  }));
}

/** 對容易受網路波動影響的外部請求做簡單重試（最多重試2次，間隔1秒） */
async function withRetry(fn, retries = 2, delayMs = 1000) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/** 讀出資料庫裡「今天」某個市場（TSE/OTC）已經有的收盤快照 */
export async function loadTodayMarketRows(db, todayIso, market) {
  const { results } = await db
    .prepare(
      `SELECT dp.* FROM daily_prices dp JOIN stocks s ON s.code = dp.code WHERE dp.date = ? AND s.market = ?`
    )
    .bind(todayIso, market)
    .all();
  return results;
}

/**
 * 交易時段內每5分鐘執行一次的完整流程：抓資料 -> 算指標 -> 跑策略 -> 模擬買賣 -> 寫回資料庫
 * 重要：一定要先把「今天」的即時價寫進資料庫，才能呼叫 loadHistoryForCodes()，
 * 因為所有條件判斷（KD交叉、停利停損等）用的都是「歷史陣列最後一筆」當作現價，
 * 如果順序顛倒，最後一筆會是「昨天」的收盤價，等於整整慢了一個交易日在判斷訊號。
 * 上市（TSE）資料在這裡直接抓；上櫃（TPEx）因為會擋掉 Cloudflare 的IP，
 * 改由 GitHub Actions 用不同網路來源抓取後，透過 /ingest/otc 寫進資料庫，這裡只負責讀出來用。
 */
export async function runScreeningCycle(env, options = {}) {
  const taipeiNow = nowInTaipei();
  if (!options.force && !isTradingHours(taipeiNow)) {
    return { skipped: true, reason: 'not-trading-hours' };
  }

  const nowIso = taipeiNow.toISOString();
  const todayIso = taipeiNow.toISOString().slice(0, 10);

  const [tseResult, valuationsResult] = await Promise.allSettled([
    withRetry(() => fetchTseTodaySnapshot()),
    withRetry(() => fetchTseValuations()),
  ]);

  const dataSourceErrors = {};
  if (tseResult.status === 'rejected') dataSourceErrors.tse = tseResult.reason.message;
  if (valuationsResult.status === 'rejected') dataSourceErrors.valuations = valuationsResult.reason.message;

  const tseRows = tseResult.status === 'fulfilled' ? tseResult.value : [];
  const valuations = valuationsResult.status === 'fulfilled' ? valuationsResult.value : {};

  if (tseRows.length > 0) await upsertStocksAndPrices(env.DB, tseRows, 'TSE');

  const otcRows = await loadTodayMarketRows(env.DB, todayIso, 'OTC');
  if (otcRows.length === 0) {
    dataSourceErrors.otc = '資料庫裡還沒有今天的上櫃資料（GitHub Actions可能還沒執行過，或今天還沒觸發過）';
  }

  const allRows = [...tseRows, ...otcRows];
  if (allRows.length === 0) {
    return { skipped: true, reason: 'no-data', dataSourceErrors };
  }

  const strategies = await getActiveStrategiesWithAccounts(env.DB);
  const positionsByAccount = await loadAllPositions(env.DB);
  const historyByCode = await loadHistoryForCodes(env.DB, 70);

  const plan = planTradesForCycle({ allRows, valuations, historyByCode, positionsByAccount, strategies });
  const { buyCount, sellCount } = await applyTrades(env.DB, plan, nowIso);

  return {
    success: true,
    tseCount: tseRows.length,
    otcCount: otcRows.length,
    stocksProcessed: allRows.length,
    strategiesRun: strategies.length,
    buyCount,
    sellCount,
    dataSourceErrors: Object.keys(dataSourceErrors).length > 0 ? dataSourceErrors : undefined,
  };
}
