require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();

const connectionString = process.env.DB_CONNECTION_STRING || process.env.DATABASE_URL || 'postgresql://localhost/ql_boardgame';
const poolConfig = { connectionString };

if (connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1') && !connectionString.includes('::1')) {
    poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);
pool.on('error', err => console.error('[PG POOL ERROR]', err));

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'BG-System API',
            version: '1.0.0',
            description: 'API quản lý board game với xác thực, báo cáo và dashboard cơ bản.',
        },
        servers: [{ url: 'http://localhost:3000' }],
    },
    apis: ['./server-pg.js'],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const sessions = new Map();

function createToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function sendError(res, status, message) {
    return res.status(status).json({ success: false, message });
}

function authenticate(req, res, next) {
    if (req.path === '/login' || req.path === '/register') return next();
    if (req.method === 'GET' && ['/boardgames', '/drinks', '/tables', '/stats/revenue'].includes(req.path)) return next();

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return sendError(res, 401, 'Unauthorized');
    }

    const token = authHeader.replace('Bearer ', '');
    const session = sessions.get(token);
    if (!session) {
        return sendError(res, 401, 'Invalid session');
    }

    req.user = session;
    next();
}

function authorize(allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return sendError(res, 403, 'Forbidden');
        }
        next();
    };
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Đăng nhập cho nhân viên hoặc khách hàng
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               roleType:
 *                 type: string
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thông tin phiên đăng nhập
 */
app.post('/api/login', async (req, res) => {
    try {
        const { roleType, username, password, phone } = req.body;

        if (roleType === 'customer') {
            if (!phone) return sendError(res, 400, 'Vui lòng nhập số điện thoại');
            const result = await pool.query('SELECT makh, tenkh, sodienthoai FROM khachhang WHERE sodienthoai = $1', [phone]);
            if (!result.rows.length) return sendError(res, 401, 'Số điện thoại không tồn tại');

            const user = result.rows[0];
            const token = createToken();
            sessions.set(token, { role: 'customer', name: user.tenkh, type: 'customer', id: user.makh });
            return res.json({ success: true, token, role: 'customer', name: user.tenkh, id: user.makh });
        }

        if (!username || !password) {
            return sendError(res, 400, 'Vui lòng nhập tài khoản và mật khẩu');
        }

        const result = await pool.query(
            `SELECT nv.manv, nv.tennv, pq.tenquyen
             FROM nhanvien nv
             JOIN phanquyen pq ON nv.maquyen = pq.maquyen
             WHERE nv.taikhoan = $1 AND nv.matkhau = $2`,
            [username, password]
        );
        if (!result.rows.length) return sendError(res, 401, 'Tài khoản hoặc mật khẩu không đúng');

        const user = result.rows[0];
        const role = user.tenquyen.includes('Quản lý') ? 'admin' : 'staff';
        const token = createToken();
        sessions.set(token, { role, name: user.tennv, type: 'employee', id: user.manv });
        return res.json({ success: true, token, role, name: user.tennv, id: user.manv });
    } catch (err) {
        console.error('[LOGIN ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, phone } = req.body;
        if (!name || !phone) return sendError(res, 400, 'Vui lòng nhập họ tên và số điện thoại.');

        const check = await pool.query('SELECT makh FROM khachhang WHERE sodienthoai = $1', [phone]);
        if (check.rows.length) return sendError(res, 400, 'Số điện thoại đã được đăng ký.');

        const result = await pool.query(
            'INSERT INTO khachhang (tenkh, sodienthoai) VALUES ($1, $2) RETURNING makh',
            [name, phone]
        );
        const insertedId = result.rows[0]?.makh;
        if (!insertedId) return sendError(res, 500, 'Không thể tạo tài khoản khách hàng.');

        const token = createToken();
        sessions.set(token, { role: 'customer', name, type: 'customer', id: insertedId });
        return res.json({ success: true, token, role: 'customer', name, id: insertedId });
    } catch (err) {
        console.error('[REGISTER ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.use('/api', authenticate);

app.post('/api/logout', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        sessions.delete(token);
    }
    res.json({ success: true, message: 'Đã đăng xuất' });
});

app.get('/api/profile', (req, res) => {
    return res.json({ success: true, name: req.user.name, role: req.user.role, type: req.user.type, id: req.user.id });
});

/**
 * @swagger
 * /api/tables:
 *   get:
 *     summary: Lấy trạng thái danh sách bàn hiện tại
 *     responses:
 *       200:
 *         description: Danh sách bàn và trạng thái
 */
app.get('/api/tables', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT b.maban AS "MaBan",
                    b.tenban AS "TenBan",
                    CASE WHEN hd.mahd IS NOT NULL THEN 'Đã đặt' ELSE 'Trống' END AS "TrangThai",
                    hd.mahd AS "MaHD",
                    hd.giovao AS "GioVao",
                    hd.tongtien AS "TongTien",
                    hd.trangthaithanhtoan AS "TrangThaiThanhToan",
                    hd.makh AS "MaKH",
                    COALESCE(kh.tenkh, 'Khách lẻ') AS "KhachHang",
                    nv.tennv AS "NhanVien"
             FROM ban b
             LEFT JOIN (SELECT * FROM hoadon WHERE giora IS NULL) hd ON b.maban = hd.maban
             LEFT JOIN khachhang kh ON hd.makh = kh.makh
             LEFT JOIN nhanvien nv ON hd.manv = nv.manv
             ORDER BY b.maban`
        );
        return res.json(result.rows);
    } catch (err) {
        console.error('[TABLES ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

/**
 * @swagger
 * /api/book-table:
 *   post:
 *     summary: Khách hàng đặt bàn trước với tùy chọn game và đồ uống
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               MaBan:
 *                 type: integer
 *               GioVao:
 *                 type: string
 *               MaSP:
 *                 type: integer
 *               MaGame:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Đặt bàn thành công
 */
app.post('/api/book-table', async (req, res) => {
    try {
        const { MaBan, MaSP, MaGame, GioVao } = req.body;
        const banId = parseInt(MaBan, 10);
        if (!banId) return sendError(res, 400, 'Thiếu thông tin bàn');
        if (!GioVao) return sendError(res, 400, 'Vui lòng chọn thời gian vào');
        if (!req.user || req.user.role !== 'customer') {
            return sendError(res, 403, 'Chỉ khách hàng mới được đặt trước');
        }

        const checkResult = await pool.query('SELECT mahd FROM hoadon WHERE maban = $1 AND giora IS NULL', [banId]);
        if (checkResult.rows.length) {
            return sendError(res, 409, 'Bàn này đã có người đặt');
        }

        const staffResult = await pool.query('SELECT manv FROM nhanvien WHERE maquyen = 1 ORDER BY manv LIMIT 1');
        const staffId = staffResult.rows.length ? staffResult.rows[0].manv : 1;

        const startTime = new Date(GioVao);
        if (Number.isNaN(startTime.getTime())) return sendError(res, 400, 'Thời gian vào không hợp lệ');

        const insertResult = await pool.query(
            `INSERT INTO hoadon (manv, makh, maban, giovao, tongtien, trangthaithanhtoan)
             VALUES ($1, $2, $3, $4, 0, 'Chưa thanh toán') RETURNING mahd`,
            [staffId, req.user.id, banId, startTime.toISOString()]
        );

        const newInvoiceId = insertResult.rows[0]?.mahd;
        let totalAmount = 0;

        if (MaSP) {
            const priceResult = await pool.query('SELECT dongia FROM sanpham WHERE masp = $1', [parseInt(MaSP, 10)]);
            if (priceResult.rows.length) {
                const price = Number(priceResult.rows[0].dongia || 0);
                await pool.query(
                    'INSERT INTO chitiet_sanpham (mahd, masp, soluong, thanhtien) VALUES ($1, $2, 1, $3)',
                    [newInvoiceId, parseInt(MaSP, 10), price]
                );
                totalAmount += price;
            }
        }

        if (MaGame) {
            const priceResult = await pool.query('SELECT giathue FROM boardgame WHERE magame = $1', [parseInt(MaGame, 10)]);
            if (priceResult.rows.length) {
                const price = Number(priceResult.rows[0].giathue || 0);
                await pool.query(
                    'INSERT INTO chitiet_thuegame (mahd, magame, soluong, thanhtien) VALUES ($1, $2, 1, $3)',
                    [newInvoiceId, parseInt(MaGame, 10), price]
                );
                totalAmount += price;
            }
        }

        if (totalAmount > 0) {
            await pool.query('UPDATE hoadon SET tongtien = $1 WHERE mahd = $2', [totalAmount, newInvoiceId]);
        }

        return res.json({ success: true, message: 'Đặt bàn thành công' });
    } catch (err) {
        console.error('[BOOK TABLE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});
/*lấy*/
app.get('/api/boardgames', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT magame AS "MaGame", tengame AS "TenGame", giathue AS "GiaThue", tinhtrang AS "TinhTrang" FROM boardgame`
        );
        return res.json(result.rows);
    } catch (err) {
        console.error('[BOARDGAME LIST ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.post('/api/boardgames', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { TenGame, GiaThue, TinhTrang } = req.body;
        if (!TenGame || !GiaThue || !TinhTrang) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin game');
        await pool.query(
            'INSERT INTO boardgame (tengame, giathue, tinhtrang) VALUES ($1, $2, $3)',
            [TenGame, GiaThue, TinhTrang]
        );
        return res.json({ success: true, message: 'Thêm game thành công!' });
    } catch (err) {
        console.error('[BOARDGAME CREATE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.put('/api/boardgames/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { id } = req.params;
        const { TenGame, GiaThue, TinhTrang } = req.body;
        if (!TenGame || !GiaThue || !TinhTrang) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin cập nhật');
        await pool.query(
            'UPDATE boardgame SET tengame = $1, giathue = $2, tinhtrang = $3 WHERE magame = $4',
            [TenGame, GiaThue, TinhTrang, parseInt(id, 10)]
        );
        return res.json({ success: true, message: 'Cập nhật game thành công!' });
    } catch (err) {
        console.error('[BOARDGAME UPDATE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.delete('/api/boardgames/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM boardgame WHERE magame = $1', [parseInt(id, 10)]);
        if (!result.rowCount) return sendError(res, 404, 'Không tìm thấy game');
        return res.json({ success: true, message: 'Xóa thành công!' });
    } catch (err) {
        console.error('[BOARDGAME DELETE ERROR]', err);
        return sendError(res, 500, 'Lỗi: Game đang nằm trong hóa đơn!');
    }
});

app.get('/api/drinks', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT masp AS "MaSP", tensp AS "TenSP", dongia AS "DonGia", donvitinh AS "DonViTinh" FROM sanpham`
        );
        return res.json(result.rows);
    } catch (err) {
        console.error('[DRINKS LIST ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.post('/api/drinks', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { TenSP, DonGia, DonViTinh } = req.body;
        if (!TenSP || !DonGia || !DonViTinh) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin sản phẩm');
        await pool.query(
            'INSERT INTO sanpham (tensp, dongia, donvitinh) VALUES ($1, $2, $3)',
            [TenSP, DonGia, DonViTinh]
        );
        return res.json({ success: true, message: 'Thêm sản phẩm thành công!' });
    } catch (err) {
        console.error('[DRINK CREATE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.put('/api/drinks/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { id } = req.params;
        const { TenSP, DonGia, DonViTinh } = req.body;
        if (!TenSP || !DonGia || !DonViTinh) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin cập nhật');
        await pool.query(
            'UPDATE sanpham SET tensp = $1, dongia = $2, donvitinh = $3 WHERE masp = $4',
            [TenSP, DonGia, DonViTinh, parseInt(id, 10)]
        );
        return res.json({ success: true, message: 'Cập nhật thành công!' });
    } catch (err) {
        console.error('[DRINK UPDATE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.delete('/api/drinks/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM sanpham WHERE masp = $1', [parseInt(id, 10)]);
        if (!result.rowCount) return sendError(res, 404, 'Không tìm thấy sản phẩm');
        return res.json({ success: true, message: 'Xóa sản phẩm thành công!' });
    } catch (err) {
        console.error('[DRINK DELETE ERROR]', err);
        return sendError(res, 500, 'Lỗi: Sản phẩm đang có trong hóa đơn!');
    }
});

app.get('/api/invoices', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT hd.mahd AS "MaHD", b.tenban AS "TenBan", hd.tongtien AS "TongTien", hd.trangthaithanhtoan AS "TrangThaiThanhToan", hd.giovao AS "GioVao"
             FROM hoadon hd
             JOIN ban b ON hd.maban = b.maban
             ORDER BY hd.giovao DESC`
        );
        return res.json(result.rows);
    } catch (err) {
        console.error('[INVOICE LIST ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.get('/api/invoices/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { id } = req.params;
        const invoiceResult = await pool.query(
            `SELECT hd.mahd AS "MaHD", b.tenban AS "TenBan", nv.tennv AS "NhanVien",
                    COALESCE(kh.tenkh, 'Khách lẻ') AS "KhachHang",
                    hd.giovao AS "GioVao", hd.giora AS "GioRa", hd.tongtien AS "TongTien", hd.trangthaithanhtoan AS "TrangThaiThanhToan"
             FROM hoadon hd
             JOIN ban b ON hd.maban = b.maban
             JOIN nhanvien nv ON hd.manv = nv.manv
             LEFT JOIN khachhang kh ON hd.makh = kh.makh
             WHERE hd.mahd = $1`,
            [parseInt(id, 10)]
        );
        if (!invoiceResult.rows.length) return sendError(res, 404, 'Không tìm thấy hóa đơn');

        const drinksResult = await pool.query(
            `SELECT sp.tensp AS "TenSP", ctsp.soluong AS "SoLuong", ctsp.thanhtien AS "ThanhTien"
             FROM chitiet_sanpham ctsp
             JOIN sanpham sp ON ctsp.masp = sp.masp
             WHERE ctsp.mahd = $1`,
            [parseInt(id, 10)]
        );

        const gamesResult = await pool.query(
            `SELECT bg.tengame AS "TenGame", ctg.soluong AS "SoLuong", ctg.thanhtien AS "ThanhTien"
             FROM chitiet_thuegame ctg
             JOIN boardgame bg ON ctg.magame = bg.magame
             WHERE ctg.mahd = $1`,
            [parseInt(id, 10)]
        );

        return res.json({ success: true, invoice: invoiceResult.rows[0], drinks: drinksResult.rows, games: gamesResult.rows });
    } catch (err) {
        console.error('[INVOICE DETAIL ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.delete('/api/invoices/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM hoadon WHERE mahd = $1', [parseInt(id, 10)]);
        if (!result.rowCount) return sendError(res, 404, 'Không tìm thấy hóa đơn');
        return res.json({ success: true, message: 'Xóa hóa đơn thành công!' });
    } catch (err) {
        console.error('[INVOICE DELETE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.put('/api/invoices/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        const { id } = req.params;
        const { TrangThaiThanhToan } = req.body;
        const allowedStatuses = ['Chưa thanh toán', 'Đã thanh toán'];
        if (!allowedStatuses.includes(TrangThaiThanhToan)) {
            return sendError(res, 400, 'Trạng thái thanh toán không hợp lệ');
        }

        const setPaid = TrangThaiThanhToan === 'Đã thanh toán';
        await pool.query(
            `UPDATE hoadon SET trangthaithanhtoan = $1, giora = CASE WHEN $2 THEN NOW() ELSE NULL END WHERE mahd = $3`,
            [TrangThaiThanhToan, setPaid, parseInt(id, 10)]
        );

        return res.json({ success: true, message: 'Cập nhật trạng thái hóa đơn thành công' });
    } catch (err) {
        console.error('[INVOICE UPDATE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.get('/api/customers', authorize(['admin']), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT makh AS "MaKH", tenkh AS "TenKH", sodienthoai AS "SoDienThoai", diemtichluy AS "DiemTichLuy"
             FROM khachhang
             ORDER BY makh`
        );
        return res.json(result.rows);
    } catch (err) {
        console.error('[CUSTOMER LIST ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.delete('/api/customers/:id', authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const checkResult = await pool.query('SELECT COUNT(*) AS count FROM hoadon WHERE makh = $1 AND giora IS NULL', [parseInt(id, 10)]);
        if (Number(checkResult.rows[0].count) > 0) {
            return sendError(res, 400, 'Không thể xóa khách hàng đang có đặt bàn chưa hoàn thành');
        }
        const result = await pool.query('DELETE FROM khachhang WHERE makh = $1', [parseInt(id, 10)]);
        if (!result.rowCount) return sendError(res, 404, 'Không tìm thấy khách hàng');
        return res.json({ success: true, message: 'Xóa khách hàng thành công!' });
    } catch (err) {
        console.error('[CUSTOMER DELETE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.get('/api/stats/summary', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM boardgame) AS "TotalGames",
                (SELECT COUNT(*) FROM sanpham) AS "TotalDrinks",
                (SELECT COUNT(*) FROM hoadon) AS "TotalInvoices",
                (SELECT COUNT(*) FROM khachhang) AS "TotalCustomers",
                SUM(CASE WHEN hd.mahd IS NULL THEN 1 ELSE 0 END) AS "AvailableTables",
                SUM(CASE WHEN hd.mahd IS NOT NULL THEN 1 ELSE 0 END) AS "BookedTables"
             FROM ban b
             LEFT JOIN (SELECT maban FROM hoadon WHERE giora IS NULL) hd ON b.maban = hd.maban`
        );
        const stats = result.rows[0] || {};
        return res.json({ success: true, stats });
    } catch (err) {
        console.error('[STATS SUMMARY ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.delete('/api/cancel-booking/:tableId', async (req, res) => {
    try {
        const { tableId } = req.params;
        if (!req.user || req.user.role !== 'customer') {
            return sendError(res, 403, 'Chỉ khách hàng mới được hủy đặt bàn');
        }

        const invoiceResult = await pool.query(
            `SELECT mahd FROM hoadon
             WHERE maban = $1
               AND makh = $2
               AND giora IS NULL`,
            [parseInt(tableId, 10), req.user.id]
        );
        if (!invoiceResult.rows.length) return sendError(res, 404, 'Không tìm thấy đặt bàn để hủy');

        const maHD = invoiceResult.rows[0].mahd;
        await pool.query('DELETE FROM hoadon WHERE mahd = $1', [maHD]);
        return res.json({ success: true, message: 'Hủy đặt bàn thành công' });
    } catch (err) {
        console.error('[CANCEL BOOKING ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.get('/api/stats/revenue', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT TO_CHAR(giovao, 'YYYY-MM-DD') AS label,
                    SUM(tongtien) AS value
             FROM hoadon
             WHERE giovao >= CURRENT_DATE - INTERVAL '6 days'
             GROUP BY TO_CHAR(giovao, 'YYYY-MM-DD')
             ORDER BY label`
        );
        const labels = result.rows.map(item => item.label);
        const values = result.rows.map(item => Number(item.value));
        return res.json({ success: true, labels, values });
    } catch (err) {
        console.error('[STATS ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]', err);
    res.status(500).json({ success: false, message: 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
