// GitHub Actions 排程執行這個腳本：抓取上櫃股票資料，推送到 Cloudflare Worker 寫進資料庫
// 直接複用 backend 裡已經寫好、測試過的解析邏輯，不重新寫一份，避免兩邊邏輯不一致
import { fetchOtcTodaySnapshot } from '../backend/src/data/tpex.js';

const workerUrl = process.env.WORKER_URL;
const secret = process.env.INGEST_SECRET;

if (!workerUrl || !secret) {
  console.error('缺少 WORKER_URL 或 INGEST_SECRET 環境變數（要在 GitHub repo 的 Settings > Secrets 設定）');
  process.exit(1);
}

console.log('開始抓取上櫃股票資料...');
const rows = await fetchOtcTodaySnapshot();
console.log(`抓到 ${rows.length} 筆上櫃股票資料`);

if (rows.length === 0) {
  console.log('抓到0筆資料，可能是非交易時間，結束執行');
  process.exit(0);
}

const res = await fetch(`${workerUrl}/ingest/otc`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Ingest-Secret': secret,
  },
  body: JSON.stringify(rows),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`推送失敗：HTTP ${res.status} - ${text}`);
  process.exit(1);
}

const result = await res.json();
console.log('推送成功：', JSON.stringify(result));
