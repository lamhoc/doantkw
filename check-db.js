const { Pool } = require('pg'); // Nhập thư viện kết nối PostgreSQL
// Cấu hình tài khoản, mật khẩu và database 'ql_boardgame'
const pool = new Pool({ connectionString: 'postgres://postgres:123@localhost:5432/ql_boardgame' });

(async function () {
  try {
    // Truy vấn lấy danh sách tất cả các bảng trong database
    const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    // Gom mảng và in danh sách tên bảng ra màn hình
    console.log('TABLES', result.rows.map(r => r.table_name));
  } catch (err) {
    console.error('ERROR', err.message); // In thông báo nếu bị lỗi
  } finally {
    await pool.end(); // Ngắt kết nối để giải phóng tài nguyên
  }
})();
