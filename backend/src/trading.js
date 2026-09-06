// 模擬交易引擎：實作虛擬帳戶的買進、賣出邏輯
// 交易規則（可調整的常數都集中在最上面，之後要改資金配置只要改這裡）

export const TRADING_RULES = {
  POSITION_SIZE_TWD: 100000, // 每次觸發買進訊號，固定投入這個金額
  MAX_POSITIONS: 10,         // 單一帳戶最多同時持有幾檔
  FEE_RATE: 0.001425,        // 手續費率（買賣都算）
  FEE_MIN_TWD: 20,           // 手續費最低收費（比照台灣券商常見的低消門檻）
  TAX_RATE: 0.003,           // 證交稅率（僅賣出收取）
};

/** 用固定金額換算成可買的整股股數（不買零股） */
function toWholeShares(twd, price) {
  if (!price || price <= 0) return 0;
  return Math.floor(twd / price);
}

function calcFee(amount) {
  return Math.max(TRADING_RULES.FEE_MIN_TWD, Math.round(amount * TRADING_RULES.FEE_RATE));
}

/**
 * 執行一筆模擬買進
 * @param {object} db D1Database（或相容的 adapter）
 * @param {number} accountId
 * @param {string} code 股票代號
 * @param {number} price 當下成交價
 * @param {string} executedAt ISO 時間字串
 */
export async function executeBuy(db, accountId, code, price, executedAt) {
  const account = await db.prepare('SELECT * FROM accounts WHERE id = ?').bind(accountId).first();
  if (!account) return { success: false, reason: '帳戶不存在' };

  const posCountRow = await db
    .prepare('SELECT COUNT(*) as count FROM positions WHERE account_id = ?')
    .bind(accountId)
    .first();
  if (posCountRow.count >= TRADING_RULES.MAX_POSITIONS) {
    return { success: false, reason: `已達最多持有 ${TRADING_RULES.MAX_POSITIONS} 檔上限` };
  }

  const existing = await db
    .prepare('SELECT id FROM positions WHERE account_id = ? AND code = ?')
    .bind(accountId, code)
    .first();
  if (existing) return { success: false, reason: '同一策略已持有這檔，不重複買進' };

  const shares = toWholeShares(TRADING_RULES.POSITION_SIZE_TWD, price);
  if (shares <= 0) return { success: false, reason: '股價過高，投入金額買不到1股' };

  const cost = shares * price;
  const fee = calcFee(cost);
  const totalCost = cost + fee;

  if (totalCost > account.cash) return { success: false, reason: '可用現金不足' };

  const tradeResult = await db
    .prepare(
      `INSERT INTO trades (account_id, code, side, shares, price, fee, tax, executed_at)
       VALUES (?, ?, 'BUY', ?, ?, ?, 0, ?)`
    )
    .bind(accountId, code, shares, price, fee, executedAt)
    .run();
  const tradeId = tradeResult.meta.last_row_id;

  await db
    .prepare(
      `INSERT INTO positions (account_id, code, shares, buy_price, buy_trade_id, opened_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, code, shares, price, tradeId, executedAt)
    .run();

  await db.prepare('UPDATE accounts SET cash = cash - ? WHERE id = ?').bind(totalCost, accountId).run();

  return { success: true, trade: { tradeId, code, shares, price, fee, totalCost } };
}

/**
 * 執行一筆模擬賣出（觸發賣出條件時，該檔全部出清）
 */
export async function executeSell(db, accountId, position, price, executedAt) {
  const proceeds = position.shares * price;
  const fee = calcFee(proceeds);
  const tax = Math.round(proceeds * TRADING_RULES.TAX_RATE);
  const netProceeds = proceeds - fee - tax;

  const tradeResult = await db
    .prepare(
      `INSERT INTO trades (account_id, code, side, shares, price, fee, tax, matched_buy_trade_id, executed_at)
       VALUES (?, ?, 'SELL', ?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, position.code, position.shares, price, fee, tax, position.buy_trade_id, executedAt)
    .run();

  await db.prepare('DELETE FROM positions WHERE id = ?').bind(position.id).run();
  await db.prepare('UPDATE accounts SET cash = cash + ? WHERE id = ?').bind(netProceeds, accountId).run();

  const costBasis = position.shares * position.buy_price;
  const netPnl = netProceeds - costBasis;

  return {
    success: true,
    trade: { tradeId: tradeResult.meta.last_row_id, code: position.code, shares: position.shares, price, fee, tax, netPnl, isWin: netPnl > 0 },
  };
}

/**
 * 計算某帳戶某個月份的績效（勝率／總報酬率／最大回撤用的交易明細）
 * 之後排程會在每月初對前一個月執行一次，寫進 monthly_reports
 */
export async function getMonthlySellTrades(db, accountId, yearMonth) {
  const { results } = await db
    .prepare(
      `SELECT * FROM trades WHERE account_id = ? AND side = 'SELL' AND executed_at LIKE ? ORDER BY executed_at`
    )
    .bind(accountId, `${yearMonth}%`)
    .all();
  return results;
}
