const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  const conn = process.argv[2] || process.env.DB_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!conn) {
    console.error('Usage: node import-schema.js <connection_string>\nOr set DB_CONNECTION_STRING or DATABASE_URL environment variable');
    process.exit(1);
  }

  let ssl = false;
  try {
    const url = new URL(conn);
    const host = url.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
      ssl = { rejectUnauthorized: false };
    }
  } catch (err) {
    ssl = false;
  }

  const pool = new Pool({ connectionString: conn, ssl });
  const filePath = path.join(__dirname, 'schema-postgres.sql');
  if (!fs.existsSync(filePath)) {
    console.error('schema-postgres.sql not found in project root');
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  // remove SQL comments that start with -- on their own line
  const cleaned = sql.split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join('\n');
  // split statements by semicolon followed by newline (naive but works for typical schema)
  const statements = cleaned.split(/;\s*\r?\n/).map(s => s.trim()).filter(s => s.length);

  try {
    for (const stmt of statements) {
      console.log('Executing statement...');
      await pool.query(stmt);
    }
    console.log('Schema import completed successfully.');
  } catch (err) {
    console.error('Error executing statements:', err.message || err);
  } finally {
    await pool.end();
  }
}

run();
