-- PostgreSQL schema for QL_BoardGame
-- Run this after creating and connecting to the ql_boardgame database.

CREATE TABLE phanquyen (
    maquyen SERIAL PRIMARY KEY,
    tenquyen VARCHAR(50) NOT NULL
);

CREATE TABLE nhanvien (
    manv SERIAL PRIMARY KEY,
    tennv VARCHAR(100) NOT NULL,
    sodienthoai VARCHAR(15),
    taikhoan VARCHAR(50) UNIQUE NOT NULL,
    matkhau VARCHAR(50) NOT NULL,
    maquyen INT REFERENCES phanquyen(maquyen)
);

CREATE TABLE khachhang (
    makh SERIAL PRIMARY KEY,
    tenkh VARCHAR(100) NOT NULL,
    sodienthoai VARCHAR(15) UNIQUE,
    diemtichluy INT DEFAULT 0
);

CREATE TABLE ban (
    maban SERIAL PRIMARY KEY,
    tenban VARCHAR(50) NOT NULL,
    trangthai VARCHAR(50) DEFAULT 'Trống'
);

CREATE TABLE sanpham (
    masp SERIAL PRIMARY KEY,
    tensp VARCHAR(100) NOT NULL,
    dongia DECIMAL(18,0) CHECK (dongia >= 0),
    donvitinh VARCHAR(20)
);

CREATE TABLE boardgame (
    magame SERIAL PRIMARY KEY,
    tengame VARCHAR(100) NOT NULL,
    giathue DECIMAL(18,0) CHECK (giathue >= 0),
    tinhtrang VARCHAR(50) DEFAULT 'Sẵn sàng'
);

CREATE TABLE hoadon (
    mahd SERIAL PRIMARY KEY,
    manv INT REFERENCES nhanvien(manv),
    makh INT REFERENCES khachhang(makh),
    maban INT REFERENCES ban(maban),
    giovao TIMESTAMP DEFAULT NOW(),
    giora TIMESTAMP NULL,
    tongtien DECIMAL(18,0) DEFAULT 0,
    trangthaithanhtoan VARCHAR(50) DEFAULT 'Chưa thanh toán'
);

CREATE TABLE chitiet_sanpham (
    mahd INT REFERENCES hoadon(mahd) ON DELETE CASCADE,
    masp INT REFERENCES sanpham(masp),
    soluong INT DEFAULT 1 CHECK (soluong > 0),
    thanhtien DECIMAL(18,0),
    PRIMARY KEY (mahd, masp)
);

CREATE TABLE chitiet_thuegame (
    mahd INT REFERENCES hoadon(mahd) ON DELETE CASCADE,
    magame INT REFERENCES boardgame(magame),
    soluong INT DEFAULT 1 CHECK (soluong > 0),
    thanhtien DECIMAL(18,0),
    PRIMARY KEY (mahd, magame)
);

INSERT INTO phanquyen (tenquyen) VALUES ('Quản lý'), ('Thu ngân');

INSERT INTO nhanvien (tennv, sodienthoai, taikhoan, matkhau, maquyen)
VALUES
('Admin Chính', '0901234567', 'admin', '123456', 1),
('Nhân viên 1', '0987654321', 'staff1', '123456', 2),
('Nguyễn Văn Admin', '0901234567', 'phache', '123456', 1),
('Trần Minh Khang', '0912345678', 'khangnv', '123456', 2),
('Lê Hoài Nam', '0923456789', 'namnv', '123456', 2),
('Phạm Quốc Bảo', '0934567891', 'baonv', '123456', 2);

INSERT INTO ban (tenban, trangthai)
VALUES
('Bàn 1', 'Trống'),
('Bàn 2', 'Đang sử dụng'),
('Bàn 3', 'Trống'),
('Bàn 4', 'Đang sử dụng'),
('Bàn 5', 'Trống'),
('Bàn VIP', 'Trống');

INSERT INTO sanpham (tensp, dongia, donvitinh)
VALUES
('Trà sữa', 35000, 'Ly'),
('Cà phê sữa', 30000, 'Ly'),
('Nước suối', 10000, 'Chai'),
('Mì cay', 45000, 'Tô'),
('Khoai tây chiên', 40000, 'Phần'),
('Bánh ngọt', 25000, 'Cái');

INSERT INTO boardgame (tengame, giathue, tinhtrang)
VALUES
('Ma Sói', 50000, 'Sẵn sàng'),
('Cờ Tỷ Phú', 40000, 'Sẵn sàng'),
('Uno', 30000, 'Sẵn sàng'),
('Exploding Kittens', 45000, 'Đang cho thuê'),
('Catan', 60000, 'Sẵn sàng'),
('Dobble', 35000, 'Bảo trì');

INSERT INTO khachhang (tenkh, sodienthoai, diemtichluy)
VALUES
('Nguyễn Văn A', '0987654321', 2000),
('Lâm Chấn Đông', '0123456789', 3000),
('Trần Thị Mai', '0978123456', 1500),
('Hoàng Minh Đức', '0966111222', 500),
('Phạm Gia Huy', '0944332211', 1000);

INSERT INTO hoadon (manv, makh, maban, giovao, giora, tongtien, trangthaithanhtoan)
VALUES
(2, 1, 2, '2025-05-10 08:00:00', '2025-05-10 11:00:00', 165000, 'Đã thanh toán'),
(3, 2, 4, '2025-05-10 09:00:00', NULL, 120000, 'Chưa thanh toán'),
(2, 3, 1, '2025-05-09 18:00:00', '2025-05-09 21:00:00', 210000, 'Đã thanh toán'),
(4, NULL, 3, '2025-05-10 10:30:00', NULL, 70000, 'Chưa thanh toán');

INSERT INTO chitiet_sanpham (mahd, masp, soluong, thanhtien)
VALUES
(1, 1, 2, 70000),
(1, 5, 1, 40000),
(1, 2, 1, 30000),
(2, 4, 2, 90000),
(2, 3, 3, 30000),
(3, 1, 3, 105000),
(3, 6, 2, 50000),
(4, 2, 1, 30000);

INSERT INTO chitiet_thuegame (mahd, magame, soluong, thanhtien)
VALUES
(1, 1, 1, 50000),
(1, 3, 1, 30000),
(2, 4, 1, 45000),
(3, 5, 1, 60000),
(4, 2, 1, 40000);
