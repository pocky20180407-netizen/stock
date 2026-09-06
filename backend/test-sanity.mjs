import { sma, kd, rsi, bollinger, volumeRatio, buildIndicatorBundle } from './src/indicators.js';
import { evaluateConditions, CONDITION_TYPES } from './src/conditions.js';

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// 產生 40 天的假股價資料（模擬一段緩步上漲後拉回的走勢）
function fakeCandles(n) {
  const out = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const drift = i < n - 8 ? 0.5 : -1.2; // 前段緩漲，最後8天拉回
    const noise = (Math.sin(i * 1.7) * 0.8);
    const close = +(price + drift + noise).toFixed(2);
    const high = +(close + 1 + Math.random()).toFixed(2);
    const low = +(close - 1 - Math.random()).toFixed(2);
    const open = +(low + Math.random() * (high - low)).toFixed(2);
    const volume = Math.round(1000 + Math.random() * 500 + (i === n - 3 ? 4000 : 0)); // 倒數第3天故意爆量
    out.push({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, open, high, low, close, volume });
    price = close;
  }
  return out;
}

// ---- 1. SMA 基本驗證 ----
const simple = [1, 2, 3, 4, 5];
const s = sma(simple, 3);
assert(s[0] === null && s[1] === null, 'SMA 前面資料不足應為 null');
assert(Math.abs(s[2] - 2) < 1e-9, 'SMA(period=3) 第3筆應為 (1+2+3)/3=2');
assert(Math.abs(s[4] - 4) < 1e-9, 'SMA(period=3) 第5筆應為 (3+4+5)/3=4');

// ---- 2. KD / RSI 值域驗證 ----
const candles = fakeCandles(40);
const { k, d } = kd(candles, 9);
const closes = candles.map((c) => c.close);
const r = rsi(closes, 14);
for (let i = 0; i < candles.length; i++) {
  if (k[i] != null) assert(k[i] >= -0.01 && k[i] <= 100.01, `K[${i}] 應介於 0~100，實際為 ${k[i].toFixed(2)}`);
  if (d[i] != null) assert(d[i] >= -0.01 && d[i] <= 100.01, `D[${i}] 應介於 0~100`);
  if (r[i] != null) assert(r[i] >= -0.01 && r[i] <= 100.01, `RSI[${i}] 應介於 0~100`);
}

// ---- 3. 布林通道 上軌 >= 中軌 >= 下軌 ----
const boll = bollinger(closes, 20, 2);
for (let i = 19; i < closes.length; i++) {
  assert(boll.upper[i] >= boll.mid[i] && boll.mid[i] >= boll.lower[i], `布林通道第${i}筆應滿足 上軌>=中軌>=下軌`);
}

// ---- 4. 量比：故意爆量的那天應該 >= 2 ----
const volumes = candles.map((c) => c.volume);
const vr = volumeRatio(volumes, 5);
const spikeIndex = candles.length - 3;
assert(vr[spikeIndex] > 2, `第${spikeIndex}天故意爆量，量比應明顯大於2，實際為 ${vr[spikeIndex].toFixed(2)}`);

// ---- 5. buildIndicatorBundle 整合測試 ----
const bundle = buildIndicatorBundle(candles);
assert(bundle.ma20.length === candles.length, 'buildIndicatorBundle 回傳長度應與輸入一致');
assert(bundle.k[bundle.k.length - 1] != null, '最後一筆 K 值不應為 null（資料夠長）');

// ---- 6. 條件引擎測試：手動建構一個「必定符合RSI超賣」的資料，確認條件會觸發 ----
const oversoldBundle = { ...bundle, rsi14: bundle.rsi14.map(() => 20) }; // 全部強制設為20，必定超賣
const matched = evaluateConditions(oversoldBundle, [{ type: 'RSI_OVERSOLD' }], 'ALL');
assert(matched === true, 'RSI全部為20時，RSI_OVERSOLD(threshold=30)應判定為符合');

const notMatched = evaluateConditions(oversoldBundle, [{ type: 'RSI_OVERBOUGHT' }], 'ALL');
assert(notMatched === false, 'RSI全部為20時，RSI_OVERBOUGHT(threshold=70)不應判定為符合');

// ---- 7. 停利條件測試 ----
const tpResult = evaluateConditions(
  bundle,
  [{ type: 'TAKE_PROFIT_PERCENT', params: { percent: 1 } }],
  'ALL',
  { buyPrice: bundle.closes[bundle.closes.length - 1] * 0.5 } // 假設買在現價的一半，漲幅遠超過1%
);
assert(tpResult === true, '買在現價一半時，停利1%條件應觸發');

// ---- 8. 條件庫涵蓋度檢查 ----
const typeCount = Object.keys(CONDITION_TYPES).length;
assert(typeCount === 13, `目前應有13種條件類型，實際為 ${typeCount}`);

console.log(`\n全部測試通過（共 ${typeCount} 種選股條件類型可用）`);
