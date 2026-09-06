// 讓 trading.js／conditions.js 之後在 Cloudflare Worker 上用的是 D1 API（prepare/bind/run/first/all），
// 這裡用 Node 內建的 node:sqlite 包一層一樣的介面，這樣本地測試可以跑「真的 SQL」，
// 而不是自己模擬一個假的資料庫，測試才有意義。
import { DatabaseSync } from 'node:sqlite';

export function createTestD1(schemaSql) {
  const sqliteDb = new DatabaseSync(':memory:');
  sqliteDb.exec(schemaSql);

  const db = {
    prepare(sql) {
      const stmt = sqliteDb.prepare(sql);
      let boundArgs = [];
      const wrapper = {
        bind(...args) {
          boundArgs = args;
          return wrapper;
        },
        async run() {
          const info = stmt.run(...boundArgs);
          return {
            success: true,
            meta: { last_row_id: Number(info.lastInsertRowid), changes: Number(info.changes) },
          };
        },
        async first() {
          const row = stmt.get(...boundArgs);
          return row === undefined ? null : row;
        },
        async all() {
          const rows = stmt.all(...boundArgs);
          return { success: true, results: rows };
        },
      };
      return wrapper;
    },
    async batch(statements) {
      // D1 的 batch 是在同一個交易內依序執行；這裡用 node:sqlite 的交易語法做等效行為
      const results = [];
      sqliteDb.exec('BEGIN');
      try {
        for (const s of statements) {
          results.push(await s.run());
        }
        sqliteDb.exec('COMMIT');
      } catch (err) {
        sqliteDb.exec('ROLLBACK');
        throw err;
      }
      return results;
    },
  };
  return db;
}
