const express = require('express');
const sql = process.env.DB_CONNECTION_STRING ? require('mssql') : require('mssql/msnodesqlv8');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
const config = {
    connectionString: process.env.DB_CONNECTION_STRING || 'Driver={SQL Server Native Client 11.0};Server=DESKTOP-DKDCA09\\SQLEXPRESS;Database=QL_BoardGame;Trusted_Connection=yes;'
};

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
    apis: ['./server.js'],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();
pool.on('error', err => console.error('[SQL POOL ERROR]', err));

const sessions = new Map();

function createToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function sendError(res, status, message) {
    return res.status(status).json({ success: false, message });
}

function authenticate(req, res, next) {
    if (req.path === '/login') return next();
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
        await poolConnect;
        const { roleType, username, password, phone } = req.body;

        if (roleType === 'customer') {
            if (!phone) return sendError(res, 400, 'Vui lòng nhập số điện thoại');
            const request = pool.request();
            request.input('phone', sql.NVarChar(50), phone);
            const result = await request.query('SELECT MaKH, TenKH, SoDienThoai FROM KhachHang WHERE SoDienThoai = @phone');
            if (!result.recordset.length) return sendError(res, 401, 'Số điện thoại không tồn tại');

            const user = result.recordset[0];
            const token = createToken();
            sessions.set(token, { role: 'customer', name: user.TenKH, type: 'customer', id: user.MaKH });
            return res.json({ success: true, token, role: 'customer', name: user.TenKH, id: user.MaKH });
        }

        if (!username || !password) {
            return sendError(res, 400, 'Vui lòng nhập tài khoản và mật khẩu');
        }

        const request = pool.request();
        request.input('username', sql.NVarChar(50), username);
        request.input('password', sql.NVarChar(50), password);
        const result = await request.query(
            `SELECT nv.MaNV, nv.TenNV, pq.TenQuyen
             FROM NhanVien nv
             JOIN PhanQuyen pq ON nv.MaQuyen = pq.MaQuyen
             WHERE nv.TaiKhoan = @username AND nv.MatKhau = @password`
        );
        if (!result.recordset.length) return sendError(res, 401, 'Tài khoản hoặc mật khẩu không đúng');

        const user = result.recordset[0];
        const role = user.TenQuyen.includes('Quản lý') ? 'admin' : 'staff';
        const token = createToken();
        sessions.set(token, { role, name: user.TenNV, type: 'employee', id: user.MaNV });
        return res.json({ success: true, token, role, name: user.TenNV, id: user.MaNV });
    } catch (err) {
        console.error('[LOGIN ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.post('/api/register', async (req, res) => {
    try {
        await poolConnect;
        const { name, phone } = req.body;
        if (!name || !phone) return sendError(res, 400, 'Vui lòng nhập họ tên và số điện thoại.');

        const check = await pool.request()
            .input('phone', sql.NVarChar(50), phone)
            .query('SELECT MaKH FROM KhachHang WHERE SoDienThoai = @phone');
        if (check.recordset.length) return sendError(res, 400, 'Số điện thoại đã được đăng ký.');

        const result = await pool.request()
            .input('name', sql.NVarChar(200), name)
            .input('phone', sql.NVarChar(50), phone)
            .query('INSERT INTO KhachHang (TenKH, SoDienThoai) OUTPUT INSERTED.MaKH VALUES (@name, @phone)');

        const insertedId = result.recordset[0]?.MaKH;
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
        await poolConnect;
        const result = await pool.request().query(
            `SELECT b.MaBan,
                    b.TenBan,
                    CASE WHEN hd.MaHD IS NOT NULL THEN N'Đã đặt' ELSE N'Trống' END AS TrangThai,
                    hd.MaHD,
                    hd.GioVao,
                    hd.TongTien,
                    hd.TrangThaiThanhToan,
                    hd.MaKH,
                    ISNULL(kh.TenKH, N'Khách lẻ') AS KhachHang,
                    nv.TenNV AS NhanVien
             FROM Ban b
             LEFT JOIN (SELECT * FROM HoaDon WHERE GioRa IS NULL) hd ON b.MaBan = hd.MaBan
             LEFT JOIN KhachHang kh ON hd.MaKH = kh.MaKH
             LEFT JOIN NhanVien nv ON hd.MaNV = nv.MaNV
             ORDER BY b.MaBan`
        );
        return res.json(result.recordset);
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
        await poolConnect;
        const { MaBan, MaSP, MaGame, GioVao } = req.body;
        const banId = parseInt(MaBan, 10);
        if (!banId) return sendError(res, 400, 'Thiếu thông tin bàn');
        if (!GioVao) return sendError(res, 400, 'Vui lòng chọn thời gian vào');
        if (!req.user || req.user.role !== 'customer') {
            return sendError(res, 403, 'Chỉ khách hàng mới được đặt trước');
        }

        const checkResult = await pool.request()
            .input('banId', sql.Int, banId)
            .query('SELECT MaHD FROM HoaDon WHERE MaBan = @banId AND GioRa IS NULL');
        if (checkResult.recordset.length) {
            return sendError(res, 409, 'Bàn này đã có người đặt');
        }

        const staffResult = await pool.request().query('SELECT TOP 1 MaNV FROM NhanVien WHERE MaQuyen = 1 ORDER BY MaNV');
        const staffId = staffResult.recordset.length ? staffResult.recordset[0].MaNV : 1;

        const insertResult = await pool.request()
            .input('staffId', sql.Int, staffId)
            .input('customerId', sql.Int, req.user.id)
            .input('banId', sql.Int, banId)
            .input('startTime', sql.NVarChar(30), GioVao)
            .query(
                `INSERT INTO HoaDon (MaNV, MaKH, MaBan, GioVao, TongTien, TrangThaiThanhToan)
                 OUTPUT INSERTED.MaHD
                 VALUES (@staffId, @customerId, @banId, TRY_CONVERT(datetime, @startTime, 120), 0, N'Chưa thanh toán')`
            );

        const newInvoiceId = insertResult.recordset?.[0]?.MaHD;
        let totalAmount = 0;

        if (MaSP) {
            const priceResult = await pool.request()
                .input('drinkId', sql.Int, parseInt(MaSP, 10))
                .query('SELECT DonGia FROM SanPham WHERE MaSP = @drinkId');
            if (priceResult.recordset.length) {
                const price = priceResult.recordset[0].DonGia;
                await pool.request()
                    .input('invoiceId', sql.Int, newInvoiceId)
                    .input('drinkId', sql.Int, parseInt(MaSP, 10))
                    .input('price', sql.Money, price)
                    .query('INSERT INTO ChiTiet_SanPham (MaHD, MaSP, SoLuong, ThanhTien) VALUES (@invoiceId, @drinkId, 1, @price)');
                totalAmount += Number(price);
            }
        }

        if (MaGame) {
            const priceResult = await pool.request()
                .input('gameId', sql.Int, parseInt(MaGame, 10))
                .query('SELECT GiaThue FROM BoardGame WHERE MaGame = @gameId');
            if (priceResult.recordset.length) {
                const price = priceResult.recordset[0].GiaThue;
                await pool.request()
                    .input('invoiceId', sql.Int, newInvoiceId)
                    .input('gameId', sql.Int, parseInt(MaGame, 10))
                    .input('price', sql.Money, price)
                    .query('INSERT INTO ChiTiet_ThueGame (MaHD, MaGame, SoLuong, ThanhTien) VALUES (@invoiceId, @gameId, 1, @price)');
                totalAmount += Number(price);
            }
        }

        if (totalAmount > 0) {
            await pool.request()
                .input('invoiceId', sql.Int, newInvoiceId)
                .input('total', sql.Money, totalAmount)
                .query('UPDATE HoaDon SET TongTien = @total WHERE MaHD = @invoiceId');
        }

        return res.json({ success: true, message: 'Đặt bàn thành công' });
    } catch (err) {
        console.error('[BOOK TABLE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.get('/api/boardgames', async (req, res) => {
    try {
        await poolConnect;
        const result = await pool.request().query('SELECT * FROM BoardGame');
        return res.json(result.recordset);
    } catch (err) {
        console.error('[BOARDGAME LIST ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.post('/api/boardgames', authorize(['admin', 'staff']), async (req, res) => {
    try {
        await poolConnect;
        const { TenGame, GiaThue, TinhTrang } = req.body;
        if (!TenGame || !GiaThue || !TinhTrang) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin game');
        await pool.request()
            .input('name', sql.NVarChar(200), TenGame)
            .input('price', sql.Money, GiaThue)
            .input('status', sql.NVarChar(50), TinhTrang)
            .query('INSERT INTO BoardGame (TenGame, GiaThue, TinhTrang) VALUES (@name, @price, @status)');
        return res.json({ success: true, message: 'Thêm game thành công!' });
    } catch (err) {
        console.error('[BOARDGAME CREATE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.put('/api/boardgames/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        await poolConnect;
        const { id } = req.params;
        const { TenGame, GiaThue, TinhTrang } = req.body;
        if (!TenGame || !GiaThue || !TinhTrang) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin cập nhật');
        await pool.request()
            .input('id', sql.Int, parseInt(id, 10))
            .input('name', sql.NVarChar(200), TenGame)
            .input('price', sql.Money, GiaThue)
            .input('status', sql.NVarChar(50), TinhTrang)
            .query('UPDATE BoardGame SET TenGame = @name, GiaThue = @price, TinhTrang = @status WHERE MaGame = @id');
        return res.json({ success: true, message: 'Cập nhật game thành công!' });
    } catch (err) {
        console.error('[BOARDGAME UPDATE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.delete('/api/boardgames/:id', authorize(['admin']), async (req, res) => {
    try {
        await poolConnect;
        const { id } = req.params;
        const result = await pool.request().input('id', sql.Int, parseInt(id, 10)).query('DELETE FROM BoardGame WHERE MaGame = @id');
        if (!result.rowsAffected[0]) return sendError(res, 404, 'Không tìm thấy game');
        return res.json({ success: true, message: 'Xóa thành công!' });
    } catch (err) {
        console.error('[BOARDGAME DELETE ERROR]', err);
        return sendError(res, 500, 'Lỗi: Game đang nằm trong hóa đơn!');
    }
});

app.get('/api/drinks', async (req, res) => {
    try {
        await poolConnect;
        const result = await pool.request().query('SELECT * FROM SanPham');
        return res.json(result.recordset);
    } catch (err) {
        console.error('[DRINKS LIST ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.post('/api/drinks', authorize(['admin', 'staff']), async (req, res) => {
    try {
        await poolConnect;
        const { TenSP, DonGia, DonViTinh } = req.body;
        if (!TenSP || !DonGia || !DonViTinh) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin sản phẩm');
        await pool.request()
            .input('name', sql.NVarChar(200), TenSP)
            .input('price', sql.Money, DonGia)
            .input('unit', sql.NVarChar(50), DonViTinh)
            .query('INSERT INTO SanPham (TenSP, DonGia, DonViTinh) VALUES (@name, @price, @unit)');
        return res.json({ success: true, message: 'Thêm sản phẩm thành công!' });
    } catch (err) {
        console.error('[DRINK CREATE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.put('/api/drinks/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        await poolConnect;
        const { id } = req.params;
        const { TenSP, DonGia, DonViTinh } = req.body;
        if (!TenSP || !DonGia || !DonViTinh) return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin cập nhật');
        await pool.request()
            .input('id', sql.Int, parseInt(id, 10))
            .input('name', sql.NVarChar(200), TenSP)
            .input('price', sql.Money, DonGia)
            .input('unit', sql.NVarChar(50), DonViTinh)
            .query('UPDATE SanPham SET TenSP = @name, DonGia = @price, DonViTinh = @unit WHERE MaSP = @id');
        return res.json({ success: true, message: 'Cập nhật thành công!' });
    } catch (err) {
        console.error('[DRINK UPDATE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.delete('/api/drinks/:id', authorize(['admin']), async (req, res) => {
    try {
        await poolConnect;
        const { id } = req.params;
        const result = await pool.request().input('id', sql.Int, parseInt(id, 10)).query('DELETE FROM SanPham WHERE MaSP = @id');
        if (!result.rowsAffected[0]) return sendError(res, 404, 'Không tìm thấy sản phẩm');
        return res.json({ success: true, message: 'Xóa sản phẩm thành công!' });
    } catch (err) {
        console.error('[DRINK DELETE ERROR]', err);
        return sendError(res, 500, 'Lỗi: Sản phẩm đang có trong hóa đơn!');
    }
});

app.get('/api/invoices', authorize(['admin', 'staff']), async (req, res) => {
    try {
        await poolConnect;
        const result = await pool.request().query(
            `SELECT hd.MaHD, b.TenBan, hd.TongTien, hd.TrangThaiThanhToan, hd.GioVao
             FROM HoaDon hd
             JOIN Ban b ON hd.MaBan = b.MaBan
             ORDER BY hd.GioVao DESC`
        );
        return res.json(result.recordset);
    } catch (err) {
        console.error('[INVOICE LIST ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.get('/api/invoices/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        await poolConnect;
        const { id } = req.params;
        const invoiceResult = await pool.request()
            .input('id', sql.Int, parseInt(id, 10))
            .query(
                `SELECT hd.MaHD, b.TenBan, nv.TenNV AS NhanVien,
                        ISNULL(kh.TenKH, N'Khách lẻ') AS KhachHang,
                        hd.GioVao, hd.GioRa, hd.TongTien, hd.TrangThaiThanhToan
                 FROM HoaDon hd
                 JOIN Ban b ON hd.MaBan = b.MaBan
                 JOIN NhanVien nv ON hd.MaNV = nv.MaNV
                 LEFT JOIN KhachHang kh ON hd.MaKH = kh.MaKH
                 WHERE hd.MaHD = @id`
            );

        if (!invoiceResult.recordset.length) return sendError(res, 404, 'Không tìm thấy hóa đơn');

        const drinksResult = await pool.request()
            .input('id', sql.Int, parseInt(id, 10))
            .query(
                `SELECT sp.TenSP, ctsp.SoLuong, ctsp.ThanhTien
                 FROM ChiTiet_SanPham ctsp
                 JOIN SanPham sp ON ctsp.MaSP = sp.MaSP
                 WHERE ctsp.MaHD = @id`
            );

        const gamesResult = await pool.request()
            .input('id', sql.Int, parseInt(id, 10))
            .query(
                `SELECT bg.TenGame, ctg.SoLuong, ctg.ThanhTien
                 FROM ChiTiet_ThueGame ctg
                 JOIN BoardGame bg ON ctg.MaGame = bg.MaGame
                 WHERE ctg.MaHD = @id`
            );

        return res.json({ success: true, invoice: invoiceResult.recordset[0], drinks: drinksResult.recordset, games: gamesResult.recordset });
    } catch (err) {
        console.error('[INVOICE DETAIL ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.delete('/api/invoices/:id', authorize(['admin']), async (req, res) => {
    try {
        await poolConnect;
        const { id } = req.params;
        const result = await pool.request().input('id', sql.Int, parseInt(id, 10)).query('DELETE FROM HoaDon WHERE MaHD = @id');
        if (!result.rowsAffected[0]) return sendError(res, 404, 'Không tìm thấy hóa đơn');
        return res.json({ success: true, message: 'Xóa hóa đơn thành công!' });
    } catch (err) {
        console.error('[INVOICE DELETE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.put('/api/invoices/:id', authorize(['admin', 'staff']), async (req, res) => {
    try {
        await poolConnect;
        const { id } = req.params;
        const { TrangThaiThanhToan } = req.body;
        const allowedStatuses = ['Chưa thanh toán', 'Đã thanh toán'];
        if (!allowedStatuses.includes(TrangThaiThanhToan)) {
            return sendError(res, 400, 'Trạng thái thanh toán không hợp lệ');
        }

        const setGioRa = TrangThaiThanhToan === 'Đã thanh toán' ? 'GioRa = GETDATE()' : 'GioRa = NULL';
        await pool.request()
            .input('id', sql.Int, parseInt(id, 10))
            .input('status', sql.NVarChar(50), TrangThaiThanhToan)
            .query(`UPDATE HoaDon SET TrangThaiThanhToan = @status, ${setGioRa} WHERE MaHD = @id`);

        return res.json({ success: true, message: 'Cập nhật trạng thái hóa đơn thành công' });
    } catch (err) {
        console.error('[INVOICE UPDATE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.get('/api/customers', authorize(['admin']), async (req, res) => {
    try {
        await poolConnect;
        const result = await pool.request().query('SELECT MaKH, TenKH, SoDienThoai, DiemTichLuy FROM KhachHang ORDER BY MaKH');
        return res.json(result.recordset);
    } catch (err) {
        console.error('[CUSTOMER LIST ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

app.delete('/api/customers/:id', authorize(['admin']), async (req, res) => {
    try {
        await poolConnect;
        const { id } = req.params;
        const checkResult = await pool.request()
            .input('id', sql.Int, parseInt(id, 10))
            .query('SELECT COUNT(*) as Count FROM HoaDon WHERE MaKH = @id AND GioRa IS NULL');
        if (checkResult.recordset[0].Count > 0) {
            return sendError(res, 400, 'Không thể xóa khách hàng đang có đặt bàn chưa hoàn thành');
        }
        const result = await pool.request().input('id', sql.Int, parseInt(id, 10)).query('DELETE FROM KhachHang WHERE MaKH = @id');
        if (!result.rowsAffected[0]) return sendError(res, 404, 'Không tìm thấy khách hàng');
        return res.json({ success: true, message: 'Xóa khách hàng thành công!' });
    } catch (err) {
        console.error('[CUSTOMER DELETE ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

/**
 * @swagger
 * /api/stats/summary:
 *   get:
 *     summary: Lấy tổng hợp chỉ số dashboard quản trị
 *     responses:
 *       200:
 *         description: Tổng số game, đồ uống, khách hàng, hóa đơn và trạng thái bàn
 */
app.get('/api/stats/summary', async (req, res) => {
    try {
        await poolConnect;
        const result = await pool.request().query(
            `SELECT
                (SELECT COUNT(*) FROM BoardGame) AS TotalGames,
                (SELECT COUNT(*) FROM SanPham) AS TotalDrinks,
                (SELECT COUNT(*) FROM HoaDon) AS TotalInvoices,
                (SELECT COUNT(*) FROM KhachHang) AS TotalCustomers,
                SUM(CASE WHEN hd.MaHD IS NULL THEN 1 ELSE 0 END) AS AvailableTables,
                SUM(CASE WHEN hd.MaHD IS NOT NULL THEN 1 ELSE 0 END) AS BookedTables
             FROM Ban b
             LEFT JOIN (SELECT MaBan FROM HoaDon WHERE GioRa IS NULL) hd ON b.MaBan = hd.MaBan`
        );
        const stats = result.recordset[0] || {};
        return res.json({ success: true, stats });
    } catch (err) {
        console.error('[STATS SUMMARY ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

/**
 * @swagger
 * /api/cancel-booking/{tableId}:
 *   delete:
 *     summary: Khách hàng hủy đặt bàn hiện tại
 *     parameters:
 *       - in: path
 *         name: tableId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID bàn cần hủy
 *     responses:
 *       200:
 *         description: Hủy đặt bàn thành công
 */
app.delete('/api/cancel-booking/:tableId', async (req, res) => {
    try {
        await poolConnect;
        const { tableId } = req.params;
        if (!req.user || req.user.role !== 'customer') {
            return sendError(res, 403, 'Chỉ khách hàng mới được hủy đặt bàn');
        }

        const invoiceResult = await pool.request()
            .input('tableId', sql.Int, parseInt(tableId, 10))
            .input('customerId', sql.Int, req.user.id)
            .query(
                `SELECT MaHD FROM HoaDon
                 WHERE MaBan = @tableId
                   AND MaKH = @customerId
                   AND GioRa IS NULL`
            );
        if (!invoiceResult.recordset.length) return sendError(res, 404, 'Không tìm thấy đặt bàn để hủy');

        const maHD = invoiceResult.recordset[0].MaHD;
        await pool.request().input('invoiceId', sql.Int, maHD).query('DELETE FROM HoaDon WHERE MaHD = @invoiceId');
        return res.json({ success: true, message: 'Hủy đặt bàn thành công' });
    } catch (err) {
        console.error('[CANCEL BOOKING ERROR]', err);
        return sendError(res, 500, 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.');
    }
});

/**
 * @swagger
 * /api/stats/revenue:
 *   get:
 *     summary: Lấy dữ liệu doanh thu tuần để vẽ biểu đồ
 *     responses:
 *       200:
 *         description: Dữ liệu biểu đồ doanh thu
 */
app.get('/api/stats/revenue', async (req, res) => {
    try {
        await poolConnect;
        const result = await pool.request().query(
            `SELECT CONVERT(VARCHAR(10), GioVao, 23) AS Label,
                    SUM(TongTien) AS Value
             FROM HoaDon
             WHERE GioVao >= DATEADD(day, -6, CAST(GETDATE() AS date))
             GROUP BY CONVERT(VARCHAR(10), GioVao, 23)
             ORDER BY CONVERT(VARCHAR(10), GioVao, 23)`
        );
        const labels = result.recordset.map(item => item.Label);
        const values = result.recordset.map(item => Number(item.Value));
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

