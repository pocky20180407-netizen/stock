// 技術指標計算模組
// candles 格式：依日期由舊到新排序的陣列 [{ date, open, high, low, close, volume }, ...]
// 所有函式回傳與輸入等長的陣列，資料不足的位置回傳 null

/** 簡單移動平均線 SMA */
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * KD 指標（隨機指標，台股慣用 9,3,3 平滑法，初值 K=D=50）
 * RSV = (今日收盤 - N日內最低價) / (N日內最高價 - N日內最低價) * 100
 * K = 前一日K * 2/3 + 今日RSV * 1/3
 * D = 前一日D * 2/3 + 今日K * 1/3
 */
export function kd(candles, period = 9) {
  const k = new Array(candles.length).fill(null);
  const d = new Array(candles.length).fill(null);
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) continue;
    let highN = -Infinity;
    let lowN = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > highN) highN = candles[j].high;
      if (candles[j].low < lowN) lowN = candles[j].low;
    }
    const rsv = highN === lowN ? 50 : ((candles[i].close - lowN) / (highN - lowN)) * 100;
    const curK = prevK * (2 / 3) + rsv * (1 / 3);
    const curD = prevD * (2 / 3) + curK * (1 / 3);
    k[i] = curK;
    d[i] = curD;
    prevK = curK;
    prevD = curD;
  }
  return { k, d };
}

/** RSI 相對強弱指標（Wilder's smoothing，預設14日） */
export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain += Math.max(change, 0);
    avgLoss += Math.max(-change, 0);
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** 布林通道：中軌為 SMA，上下軌為中軌 ± k 倍標準差（預設20日、2倍標準差） */
export function bollinger(closes, period = 20, k = 2) {
  const mid = sma(closes, period);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const window = closes.slice(i - period + 1, i + 1);
    const mean = mid[i];
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    upper[i] = mean + k * std;
    lower[i] = mean - k * std;
  }
  return { mid, upper, lower };
}

/** 量比：當日成交量 / N日均量（預設5日） */
export function volumeRatio(volumes, period = 5) {
  const avg = sma(volumes, period);
  return volumes.map((v, i) => (avg[i] ? v / avg[i] : null));
}

/** 一次算好一檔股票常用的完整指標組合，給選股引擎使用 */
export function buildIndicatorBundle(candles) {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const { k, d } = kd(candles, 9);
  const boll = bollinger(closes, 20, 2);
  return {
    candles,
    closes,
    k,
    d,
    rsi14: rsi(closes, 14),
    ma5: sma(closes, 5),
    ma10: sma(closes, 10),
    ma20: sma(closes, 20),
    ma60: sma(closes, 60),
    bollMid: boll.mid,
    bollUpper: boll.upper,
    bollLower: boll.lower,
    volRatio5: volumeRatio(volumes, 5),
  };
}
