// 統一的後端API呼叫入口。
// 預設直接連正式後端；本機開發想連假資料伺服器時，在 .env 設定 VITE_API_URL=http://localhost:8787 即可覆蓋
export const BASE_URL = import.meta.env.VITE_API_URL || 'https://tw-stock-sim-backend.pocky0407.workers.dev';

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`連不上後端（${BASE_URL}），請檢查網路，或後端是否正常運作`);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // 後端有回應，但不是JSON——最常見的原因是後端還沒部署包含 /api 路由的最新版
    throw new Error(`後端回應格式不對（${path}），可能是後端還沒部署最新版本。收到的內容：${text.slice(0, 60)}`);
  }
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
