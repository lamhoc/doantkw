const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  // Lấy chuỗi kết nối từ tham số truyền vào hoặc biến môi trường
  const conn = process.argv[2] || process.env.DB_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!conn) {
    console.error('Usage: node import-schema.js <connection_string>\nOr set DB_CONNECTION_STRING or DATABASE_URL environment variable');
    process.exit(1); // Dừng chương trình nếu thiếu chuỗi kết nối
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

  const pool = new Pool({ connectionString: conn, ssl }); // Tạo bộ kết nối database
  const filePath = path.join(__dirname, 'schema-postgres.sql');
  if (!fs.existsSync(filePath)) {
    console.error('schema-postgres.sql not found in project root');
    process.exit(1); // Dừng nếu không tìm thấy file SQL
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  // Xóa các dòng chú thích bắt đầu bằng dấu -- trong file SQL
  const cleaned = sql.split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join('\n');
  // Tách nội dung file thành từng câu lệnh SQL riêng biệt dựa vào dấu chấm phẩy (;)
  const statements = cleaned.split(/;\s*\r?\n/).map(s => s.trim()).filter(s => s.length);

  try {
    // Duyệt qua từng câu lệnh SQL và thực thi vào database
    for (const stmt of statements) {
      console.log('Executing statement...');
      await pool.query(stmt);
    }
    console.log('Schema import completed successfully.'); // Thông báo thành công
  } catch (err) {
    console.error('Error executing statements:', err.message || err); // In lỗi nếu thực thi thất bại
  } finally {
    await pool.end(); // Ngắt kết nối để giải phóng tài nguyên
  }
}

run();