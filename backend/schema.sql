-- 台股模擬交易 APP 資料庫結構（Cloudflare D1 / SQLite 語法）

-- 股票基本資料
CREATE TABLE stocks (
  code TEXT PRIMARY KEY,       -- 股票代號，例如 2330
  name TEXT NOT NULL,          -- 股票名稱，例如 台積電
  market TEXT NOT NULL,        -- 'TSE' 上市 / 'OTC' 上櫃
  updated_at TEXT
);

-- 每日歷史股價（用來計算技術指標）
CREATE TABLE daily_prices (
  code TEXT NOT NULL,
  date TEXT NOT NULL,          -- 格式 'YYYY-MM-DD'
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume INTEGER,
  PRIMARY KEY (code, date)
);

-- 選股策略設定（10組虛擬帳戶各自對應一組）
CREATE TABLE strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  buy_conditions TEXT NOT NULL,          -- JSON 陣列，例如 [{"type":"KD_GOLDEN_CROSS","params":{}}]
  buy_logic TEXT NOT NULL DEFAULT 'ALL', -- 'ALL' 全部符合 / 'ANY' 符合任一
  sell_conditions TEXT NOT NULL,
  sell_logic TEXT NOT NULL DEFAULT 'ANY',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT
);

-- 虛擬帳戶
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id INTEGER NOT NULL REFERENCES strategies(id),
  initial_capital REAL NOT NULL DEFAULT 1000000,
  cash REAL NOT NULL,           -- 目前可用現金
  created_at TEXT
);

-- 目前持倉
CREATE TABLE positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  code TEXT NOT NULL,
  shares INTEGER NOT NULL,
  buy_price REAL NOT NULL,
  buy_trade_id INTEGER,
  opened_at TEXT
);

-- 交易紀錄（買進、賣出各記一筆）
CREATE TABLE trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  code TEXT NOT NULL,
  side TEXT NOT NULL,                    -- 'BUY' 或 'SELL'
  shares INTEGER NOT NULL,
  price REAL NOT NULL,
  fee REAL NOT NULL,                     -- 手續費估算
  tax REAL NOT NULL DEFAULT 0,           -- 證交稅（僅賣出）
  matched_buy_trade_id INTEGER,          -- SELL 交易對應的 BUY 交易 id，用來算損益／勝率
  executed_at TEXT NOT NULL
);

-- 每月績效報告（10組策略互相比較用）
CREATE TABLE monthly_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  year_month TEXT NOT NULL,              -- 格式 'YYYY-MM'
  win_rate REAL,
  total_return_pct REAL,
  max_drawdown_pct REAL,
  trade_count INTEGER,
  generated_at TEXT,
  UNIQUE(account_id, year_month)
);
