// 統一的後端API呼叫入口。API網址從環境變數讀取（部署時在 .env 設定，見 .env.example）
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

async function request(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `伺服器錯誤（HTTP ${res.status}）`);
  }
  return data;
}

export const api = {
  getConditions: () => request('GET', '/api/conditions'),
  getStrategies: () => request('GET', '/api/strategies'),
  createStrategy: (payload) => request('POST', '/api/strategies', payload),
  updateStrategy: (id, payload) => request('PUT', `/api/strategies/${id}`, payload),
  getPositions: (strategyId) => request('GET', `/api/strategies/${strategyId}/positions`),
  getTrades: (strategyId) => request('GET', `/api/strategies/${strategyId}/trades`),
  getStocks: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/stocks${qs ? `?${qs}` : ''}`);
  },
  getStockDetail: (code) => request('GET', `/api/stocks/${code}`),
  getMonthlyReports: (month) => request('GET', `/api/reports/monthly?month=${month}`),
};
