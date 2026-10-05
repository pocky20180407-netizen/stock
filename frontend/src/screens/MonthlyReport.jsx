import { useEffect, useState } from 'react';
import { api } from '../api.js';

function currentYearMonth() {
  return new Date().toISOString().slice(0, 7);
}
function shiftMonth(yearMonth, delta) {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function MonthlyReport() {
  const [month, setMonth] = useState(currentYearMonth());
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setReports(null);
    api
      .getMonthlyReports(month)
      .then((d) => setReports(d.reports))
      .catch((e) => setError(e.message));
  }, [month]);

  const hasAnyTrades = reports?.some((r) => r.tradeCount > 0);

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>績效比較</h1>
      </header>
      <div className="screen-body">
        <div className="month-switcher">
          <button className="text-btn" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ← 上個月
          </button>
          <span className="stat-value">{month}</span>
          <button className="text-btn" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            下個月 →
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}
        {reports && !hasAnyTrades && (
          <p className="empty-hint">這個月所有策略都還沒有已出清的交易，等自動交易開始運作後這裡會顯示比較結果</p>
        )}

        <div className="report-list">
          {reports?.map((r, i) => (
            <div className="report-row" key={r.strategyId}>
              <span className="report-rank">{i + 1}</span>
              <div className="table-cell-main">
                <span>{r.strategyName}</span>
                <span className="text-faint">{r.tradeCount} 筆已出清交易</span>
              </div>
              <div className="table-cell-num">
                <span
                  className={`num stat-value ${
                    r.tradeCount === 0 ? '' : r.monthlyReturnPct >= 0 ? 'text-gain' : 'text-loss'
                  }`}
                >
                  {r.tradeCount === 0 ? '—' : `${r.monthlyReturnPct >= 0 ? '+' : ''}${r.monthlyReturnPct}%`}
                </span>
                <span className="text-faint num">勝率 {r.winRate ?? '—'}{r.winRate != null ? '%' : ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
