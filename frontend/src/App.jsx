import { useEffect, useState } from 'react';
import StrategyList from './screens/StrategyList.jsx';
import StrategyDetail from './screens/StrategyDetail.jsx';
import StrategyEditor from './screens/StrategyEditor.jsx';
import Screener from './screens/Screener.jsx';
import MonthlyReport from './screens/MonthlyReport.jsx';
import { api } from './api.js';
import './styles/app.css';

const TABS = [
  { key: 'strategies', label: '策略' },
  { key: 'screener', label: '選股' },
  { key: 'reports', label: '績效' },
];

function StrategiesTab({ library }) {
  // view: {screen:'list'} | {screen:'detail', strategy} | {screen:'editor', strategy|null}
  const [view, setView] = useState({ screen: 'list' });
  const [refreshKey, setRefreshKey] = useState(0);

  function backToList() {
    setRefreshKey((k) => k + 1);
    setView({ screen: 'list' });
  }

  if (view.screen === 'editor') {
    return <StrategyEditor strategy={view.strategy} library={library} onDone={backToList} onCancel={backToList} />;
  }
  if (view.screen === 'detail') {
    return (
      <StrategyDetail
        strategy={view.strategy}
        onBack={backToList}
        onEdit={(s) => setView({ screen: 'editor', strategy: s })}
      />
    );
  }
  return (
    <StrategyList
      key={refreshKey}
      onEdit={(s) => setView({ screen: 'detail', strategy: s })}
      onAddNew={() => setView({ screen: 'editor', strategy: null })}
    />
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('strategies');
  const [library, setLibrary] = useState(null);

  useEffect(() => {
    api.getConditions().then((data) => setLibrary(data.conditions));
  }, []);

  if (!library) {
    return (
      <div className="app-loading">
        <p>載入中...</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        {activeTab === 'strategies' && <StrategiesTab library={library} />}
        {activeTab === 'screener' && <Screener />}
        {activeTab === 'reports' && <MonthlyReport />}
      </main>
      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-item ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
