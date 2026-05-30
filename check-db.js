const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:123@localhost:5432/ql_boardgame' });

(async function() {
  try {
    const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log('TABLES', result.rows.map(r => r.table_name));
  } catch (err) {
    console.error('ERROR', err.message);
  } finally {
    await pool.end();
  }
})();
