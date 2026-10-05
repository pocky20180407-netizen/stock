import { useState } from 'react';

const PARAM_LABELS = {
  period: '天數',
  threshold: '門檻值',
  percent: '百分比',
  multiple: '倍數',
  days: '天數',
  max: '上限',
  min: '下限',
};

function ConditionRow({ condition, definition, onChangeParams, onRemove }) {
  const params = { ...definition.defaultParams, ...condition.params };
  const paramKeys = Object.keys(definition.defaultParams || {});

  return (
    <div className="condition-row">
      <div className="condition-row-main">
        <span className="condition-label">{definition.label}</span>
        {paramKeys.length > 0 && (
          <div className="condition-params">
            {paramKeys.map((key) => (
              <label key={key} className="condition-param">
                <span>{PARAM_LABELS[key] || key}</span>
                <input
                  type="number"
                  className="num"
                  value={params[key]}
                  onChange={(e) => onChangeParams({ ...params, [key]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="icon-btn" onClick={onRemove} aria-label={`移除${definition.label}`}>
        ✕
      </button>
    </div>
  );
}

/**
 * conditions: [{ type, params }]
 * library: [{ type, label, defaultParams }]（來自 /api/conditions）
 */
export default function ConditionPicker({ title, conditions, logic, library, onChange }) {
  const [pickerValue, setPickerValue] = useState('');
  const libraryByType = Object.fromEntries(library.map((l) => [l.type, l]));

  function addCondition(type) {
    if (!type) return;
    const def = libraryByType[type];
    onChange({ conditions: [...conditions, { type, params: { ...def.defaultParams } }], logic });
    setPickerValue('');
  }

  function removeAt(index) {
    onChange({ conditions: conditions.filter((_, i) => i !== index), logic });
  }

  function updateParamsAt(index, params) {
    const next = conditions.slice();
    next[index] = { ...next[index], params };
    onChange({ conditions: next, logic });
  }

  return (
    <section className="condition-picker">
      <div className="condition-picker-header">
        <h3>{title}</h3>
        {conditions.length > 1 && (
          <div className="logic-toggle" role="group" aria-label={`${title}邏輯`}>
            <button
              type="button"
              className={logic === 'ALL' ? 'active' : ''}
              onClick={() => onChange({ conditions, logic: 'ALL' })}
            >
              全部符合
            </button>
            <button
              type="button"
              className={logic === 'ANY' ? 'active' : ''}
              onClick={() => onChange({ conditions, logic: 'ANY' })}
            >
              符合任一
            </button>
          </div>
        )}
      </div>

      {conditions.length === 0 && <p className="empty-hint">還沒有設定任何條件</p>}

      <div className="condition-list">
        {conditions.map((c, i) =>
          libraryByType[c.type] ? (
            <ConditionRow
              key={i}
              condition={c}
              definition={libraryByType[c.type]}
              onChangeParams={(params) => updateParamsAt(i, params)}
              onRemove={() => removeAt(i)}
            />
          ) : null
        )}
      </div>

      <select className="add-condition-select" value={pickerValue} onChange={(e) => addCondition(e.target.value)}>
        <option value="">+ 新增條件...</option>
        {library.map((l) => (
          <option key={l.type} value={l.type}>
            {l.label}
          </option>
        ))}
      </select>
    </section>
  );
}
