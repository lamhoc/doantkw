# BG-System Board Game Management

## Mục tiêu
Ứng dụng quản lý Board Game được tái thiết kế để:
- Hỗ trợ quản lý kho game, đồ uống, hóa đơn và đặt bàn.
- Cung cấp UI hiện đại, responsive và dễ dùng.
- Cung cấp API chuẩn có tài liệu Swagger.
- Cải thiện UX với thông báo toast, tìm kiếm, lọc và báo cáo.

## Công nghệ
- Backend: Node.js + Express
- Database: Microsoft SQL Server (msnodesqlv8 / mssql)
- Frontend: HTML/CSS + Bootstrap 5 + Chart.js
- API Docs: Swagger UI

## Chạy ứng dụng
1. Cài dependencies:
   ```bash
   npm install
   ```
2. Chạy server:
   ```bash
   npm start
   ```
3. Mở trình duyệt vào:
   - `http://localhost:3000` để truy cập giao diện
   - `http://localhost:3000/api-docs` để xem tài liệu API Swagger

## Tính năng tiêu biểu
- Quản lý game: thêm, sửa, xóa và tìm kiếm theo tên/trạng thái.
- Quản lý đồ uống: thêm, sửa, xóa và lọc theo đơn vị.
- Quản lý hóa đơn: xem danh sách, chi tiết, cập nhật trạng thái thanh toán.
- Trang khách hàng: đặt bàn, xem bàn trống, đặt đồ uống/game cùng lúc.
- Dashboard thống kê doanh thu với biểu đồ bar.
- Thông báo UX bằng toast thay cho alert ở nhiều luồng chính.
- Responsive trên desktop và mobile.

## API Docs
- Swagger docs có sẵn tại: `http://localhost:3000/api-docs`
- Endpoint chính:
  - `POST /api/login`
  - `GET /api/profile`
  - `GET /api/boardgames`
  - `GET /api/drinks`
  - `GET /api/invoices`
  - `POST /api/book-table`

## Tổ chức source control
- Dự án nên dùng Git với các nhánh chuẩn:
  - `main` cho phiên bản ổn định
  - `develop` cho tích hợp các tính năng
  - `feature/*` cho từng tính năng riêng biệt
- Mỗi commit nên có thông điệp rõ ràng như `feat(ui): add drink search toolbar`.

## Kỹ thuật đội nhóm
- Phân chia công việc:
  1. Frontend: thiết kế dashboard, responsive layout, toast UX, thanh lọc.
  2. Backend: hoàn thiện API, Swagger docs, xử lý lỗi chuẩn.
  3. Database: tối ưu truy vấn và các stored procedure.
- Mỗi thành viên làm việc trên branch `feature/<task>` và tạo pull request khi hoàn thành.

## Ghi chú
- Nếu cần mở rộng, có thể thêm hệ thống xác thực JWT, phân quyền chi tiết và các báo cáo quản trị sâu hơn.
