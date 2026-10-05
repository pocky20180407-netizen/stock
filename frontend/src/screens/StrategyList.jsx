import { useEffect, useState } from 'react';
import { api } from '../api.js';

function formatMoney(n) {
  return Math.round(n).toLocaleString('zh-TW');
}

function StrategyCard({ strategy, onEdit, onToggleActive }) {
  const { account } = strategy;
  const totalAssets = account.cash; // 之後接上持倉市值後，這裡會改成 現金+持倉市值
  const pnlPct = ((totalAssets - account.initialCapital) / account.initialCapital) * 100;

  return (
    <div
      className="strategy-card"
      role="button"
      tabIndex={0}
      onClick={() => onEdit(strategy)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onEdit(strategy)}
    >
      <div className="strategy-card-top">
        <span className="strategy-name">{strategy.name}</span>
        <button
          type="button"
          className={`status-dot ${strategy.isActive ? 'status-on' : 'status-off'}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive(strategy);
          }}
          aria-pressed={strategy.isActive}
          title={strategy.isActive ? '運作中，點擊暫停' : '已暫停，點擊啟用'}
        />
      </div>
      <div className="strategy-card-stats">
        <div>
          <span className="stat-label">帳戶現金</span>
          <span className="num stat-value">NT$ {formatMoney(account.cash)}</span>
        </div>
        <div>
          <span className="stat-label">持倉</span>
          <span className="num stat-value">{account.positionCount} 檔</span>
        </div>
        <div>
          <span className="stat-label">損益</span>
          <span className={`num stat-value ${pnlPct >= 0 ? 'text-gain' : 'text-loss'}`}>
            {pnlPct >= 0 ? '+' : ''}
            {pnlPct.toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="strategy-card-conditions">
        買進：{strategy.buyConditions.length} 個條件・賣出：{strategy.sellConditions.length} 個條件
      </div>
    </div>
  );
}

export default function StrategyList({ onEdit, onAddNew }) {
  const [strategies, setStrategies] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await api.getStrategies();
      setStrategies(data.strategies);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(strategy) {
    await api.updateStrategy(strategy.id, { isActive: !strategy.isActive });
    load();
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>策略總覽</h1>
      </header>
      <div className="screen-body">
        {error && <p className="error-text">{error}</p>}
        {strategies === null && !error && <p className="empty-hint">載入中...</p>}
        {strategies?.length === 0 && (
          <p className="empty-hint">還沒有任何策略。點下面的按鈕建立第一組，最多可以設定10組。</p>
        )}

        <div className="strategy-list">
          {strategies?.map((s) => (
            <StrategyCard key={s.id} strategy={s} onEdit={onEdit} onToggleActive={toggleActive} />
          ))}
        </div>

        {strategies && strategies.length < 10 && (
          <button className="primary-btn" onClick={onAddNew}>
            + 新增策略（{strategies.length}/10）
          </button>
        )}
      </div>
    </div>
  );
}
