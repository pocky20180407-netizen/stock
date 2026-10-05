import { useEffect, useState } from 'react';
import { api } from '../api.js';

function StockRow({ stock, onClick }) {
  const changeClass = stock.changePct == null ? '' : stock.changePct >= 0 ? 'text-gain' : 'text-loss';
  return (
    <button className="stock-row" onClick={onClick}>
      <div className="table-cell-main">
        <span>{stock.name}</span>
        <span className="text-faint">
          {stock.code}・{stock.market === 'TSE' ? '上市' : '上櫃'}
        </span>
      </div>
      <div className="table-cell-num">
        <span className="num stat-value">{stock.close}</span>
        <span className={`num ${changeClass}`}>
          {stock.changePct == null ? '—' : `${stock.changePct >= 0 ? '+' : ''}${stock.changePct}%`}
        </span>
      </div>
    </button>
  );
}

function IndicatorGrid({ latest }) {
  const items = [
    ['K值', latest.k?.toFixed(1)],
    ['D值', latest.d?.toFixed(1)],
    ['RSI(14)', latest.rsi14?.toFixed(1)],
    ['MA5', latest.ma5?.toFixed(2)],
    ['MA20', latest.ma20?.toFixed(2)],
    ['MA60', latest.ma60?.toFixed(2)],
    ['布林上軌', latest.bollUpper?.toFixed(2)],
    ['布林下軌', latest.bollLower?.toFixed(2)],
    ['量比', latest.volRatio5?.toFixed(2)],
  ];
  return (
    <div className="indicator-grid">
      {items.map(([label, value]) => (
        <div key={label} className="indicator-cell">
          <span className="stat-label">{label}</span>
          <span className="num stat-value">{value ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}

function StockDetailSheet({ code, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getStockDetail(code).then(setDetail).catch((e) => setError(e.message));
  }, [code]);

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {error && <p className="error-text">{error}</p>}
        {!detail && !error && <p className="empty-hint">載入中...</p>}
        {detail && (
          <>
            <h2 className="section-title">
              {detail.name} <span className="text-faint">{detail.code}</span>
            </h2>
            <p className="num" style={{ fontSize: 'var(--fs-display)', fontWeight: 700 }}>
              {detail.latest.close}
            </p>
            <IndicatorGrid latest={detail.latest} />
          </>
        )}
      </div>
    </div>
  );
}

export default function Screener() {
  const [stocks, setStocks] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedCode, setSelectedCode] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .getStocks({ search, limit: 50 })
        .then((d) => setStocks(d.stocks))
        .catch((e) => setError(e.message));
    }, 250); // debounce：不用每打一個字就打一次API
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>選股</h1>
      </header>
      <div className="screen-body" style={{ gap: 'var(--sp-3)' }}>
        <input
          type="text"
          className="search-input"
          placeholder="搜尋股票代號或名稱"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {error && <p className="error-text">{error}</p>}
        {stocks?.length === 0 && <p className="empty-hint">找不到符合的股票</p>}
        <div className="table">
          {stocks?.map((s) => (
            <StockRow key={s.code} stock={s} onClick={() => setSelectedCode(s.code)} />
          ))}
        </div>
      </div>
      {selectedCode && <StockDetailSheet code={selectedCode} onClose={() => setSelectedCode(null)} />}
    </div>
  );
}
