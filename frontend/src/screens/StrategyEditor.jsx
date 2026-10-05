import { useState } from 'react';
import ConditionPicker from '../components/ConditionPicker.jsx';
import { api } from '../api.js';

export default function StrategyEditor({ strategy, library, onDone, onCancel }) {
  const isNew = !strategy;
  const [name, setName] = useState(strategy?.name || '');
  const [buyConditions, setBuyConditions] = useState(strategy?.buyConditions || []);
  const [buyLogic, setBuyLogic] = useState(strategy?.buyLogic || 'ALL');
  const [sellConditions, setSellConditions] = useState(strategy?.sellConditions || []);
  const [sellLogic, setSellLogic] = useState(strategy?.sellLogic || 'ANY');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setError('');
    if (!name.trim()) {
      setError('請先幫這組策略取個名字');
      return;
    }
    if (buyConditions.length === 0) {
      setError('至少要設定一個買進條件，不然永遠不會進場');
      return;
    }
    setSaving(true);
    try {
      const payload = { name, buyConditions, buyLogic, sellConditions, sellLogic };
      if (isNew) {
        await api.createStrategy(payload);
      } else {
        await api.updateStrategy(strategy.id, payload);
      }
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="text-btn" onClick={onCancel}>
          取消
        </button>
        <h1>{isNew ? '新增策略' : '編輯策略'}</h1>
        <button className="text-btn accent" onClick={handleSave} disabled={saving}>
          {saving ? '儲存中...' : '儲存'}
        </button>
      </header>

      <div className="screen-body">
        <label className="field">
          <span className="field-label">策略名稱</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：KD低檔黃金交叉"
            maxLength={30}
          />
        </label>

        <ConditionPicker
          title="買進條件"
          conditions={buyConditions}
          logic={buyLogic}
          library={library}
          onChange={({ conditions, logic }) => {
            setBuyConditions(conditions);
            setBuyLogic(logic);
          }}
        />

        <ConditionPicker
          title="賣出條件"
          conditions={sellConditions}
          logic={sellLogic}
          library={library}
          onChange={({ conditions, logic }) => {
            setSellConditions(conditions);
            setSellLogic(logic);
          }}
        />
        {sellConditions.length === 0 && (
          <p className="empty-hint" style={{ marginTop: -12 }}>
            沒有設定賣出條件的話，買進後會一直持有，不會自動出場
          </p>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
