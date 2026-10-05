import { useEffect, useState } from 'react';
import { api } from '../api.js';

function formatMoney(n) {
  return Math.round(n).toLocaleString('zh-TW');
}
function formatDateTime(iso) {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '';
}

export default function StrategyDetail({ strategy, onBack, onEdit }) {
  const [positions, setPositions] = useState(null);
  const [trades, setTrades] = useState(null);

  useEffect(() => {
    api.getPositions(strategy.id).then((d) => setPositions(d.positions));
    api.getTrades(strategy.id).then((d) => setTrades(d.trades));
  }, [strategy.id]);

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="text-btn" onClick={onBack}>
          ← 返回
        </button>
        <h1>{strategy.name}</h1>
        <button className="text-btn accent" onClick={() => onEdit(strategy)}>
          編輯
        </button>
      </header>

      <div className="screen-body">
        <div className="detail-summary">
          <div>
            <span className="stat-label">可用現金</span>
            <span className="num stat-value-lg">NT$ {formatMoney(strategy.account.cash)}</span>
          </div>
          <div>
            <span className="stat-label">起始資金</span>
            <span className="num stat-value-lg">NT$ {formatMoney(strategy.account.initialCapital)}</span>
          </div>
        </div>

        <section>
          <h2 className="section-title">目前持倉（{positions?.length ?? '...'}）</h2>
          {positions?.length === 0 && <p className="empty-hint">目前沒有持倉</p>}
          <div className="table">
            {positions?.map((p) => (
              <div className="table-row" key={p.id}>
                <div className="table-cell-main">
                  <span>{p.stock_name || p.code}</span>
                  <span className="text-faint">{p.code}</span>
                </div>
                <div className="table-cell-num">
                  <span className="num">{p.shares.toLocaleString('zh-TW')} 股</span>
                  <span className="text-faint num">成本 {p.buy_price}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title">交易紀錄（{trades?.length ?? '...'}）</h2>
          {trades?.length === 0 && <p className="empty-hint">還沒有任何交易，等策略觸發條件後會自動出現在這裡</p>}
          <div className="table">
            {trades?.map((t) => (
              <div className="table-row" key={t.id}>
                <div className="table-cell-main">
                  <span>
                    <span className={t.side === 'BUY' ? 'text-gain' : 'text-loss'}>
                      {t.side === 'BUY' ? '買進' : '賣出'}
                    </span>{' '}
                    {t.code}
                  </span>
                  <span className="text-faint">{formatDateTime(t.executed_at)}</span>
                </div>
                <div className="table-cell-num">
                  <span className="num">{t.shares.toLocaleString('zh-TW')} 股 @ {t.price}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
