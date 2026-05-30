let currentEditGameId = null;
let currentEditDrinkId = null;
let currentBoardGames = [];
let currentDrinkItems = [];
let currentUser = null;
let sessionToken = null;
let allCustomerGames = [];
let allCustomerDrinks = [];
let dashboardRefreshInterval = null;
const API_URL = `${window.location.origin}/api`;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    document.getElementById('logoutButton').onclick = logout;
    document.querySelectorAll('input[name="loginType"]').forEach(radio => {
        radio.onchange = updateLoginFields;
    });
});

function initApp() {
    sessionToken = localStorage.getItem('sessionToken');
    if (!sessionToken) {
        showGuestDashboard();
        return;
    }
    loadProfile().then(success => {
        if (success) {
            showDashboard();
        } else {
            showGuestDashboard();
        }
    });
}

function showGuestDashboard() {
    stopDashboardPolling();
    currentUser = { name: 'Khách', role: 'guest' };
    document.getElementById('loginScreen').style.display = 'none';
    document.querySelector('.dashboard-container').style.display = 'grid';
    document.getElementById('bannerGameImage').src = 'images/banner.jpg';
    updateRoleUI();
    showPage('page-customer', document.querySelector('#navCustomerLink a'));
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.querySelector('.dashboard-container').style.display = 'none';
}

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.querySelector('.dashboard-container').style.display = 'grid';
    document.getElementById('bannerGameImage').src = 'images/banner.jpg';
    updateRoleUI();
    if (currentUser.role === 'customer') {
        showPage('page-customer', document.querySelector('#navCustomerLink a'));
    } else {
        showPage('page-games', document.querySelector('#navGamesLink a'));
    }
}

function updateLoginFields() {
    const type = document.querySelector('input[name="loginType"]:checked').value;
    document.getElementById('employeeLogin').style.display = type === 'employee' ? 'block' : 'none';
    document.getElementById('customerLogin').style.display = type === 'customer' ? 'block' : 'none';
}

async function login() {
    const roleType = document.querySelector('input[name="loginType"]:checked').value;
    const payload = { roleType };
    if (roleType === 'customer') {
        payload.phone = document.getElementById('loginPhone').value.trim();
        if (!payload.phone) return showToast('Vui lòng nhập số điện thoại.', 'warning');
    } else {
        payload.username = document.getElementById('loginUsername').value.trim();
        payload.password = document.getElementById('loginPassword').value.trim();
        if (!payload.username || !payload.password) return showToast('Vui lòng nhập tài khoản và mật khẩu.', 'warning');
    }

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const error = await res.text();
            showToast(error || 'Đăng nhập không thành công', 'danger');
            return;
        }
        const data = await res.json();
        sessionToken = data.token;
        localStorage.setItem('sessionToken', sessionToken);
        currentUser = { name: data.name, role: data.role, id: data.id };
        updateUserInfo();
        showDashboard();
    } catch (err) {
        showToast('Lỗi kết nối server!', 'danger');
        console.error(err);
    }
}

async function registerCustomer() {
    const name = document.getElementById('loginName').value.trim();
    const phone = document.getElementById('loginPhone').value.trim();
    if (!name || !phone) return showToast('Vui lòng nhập họ tên và số điện thoại để đăng ký.', 'warning');

    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone })
        });
        if (!res.ok) {
            const error = await res.text();
            showToast(error || 'Đăng ký không thành công.', 'danger');
            return;
        }

        const data = await res.json();
        sessionToken = data.token;
        localStorage.setItem('sessionToken', sessionToken);
        currentUser = { name: data.name, role: 'customer', id: data.id };
        updateUserInfo();
        showDashboard();
        showToast('Đăng ký thành công. Bạn đã được đăng nhập tự động.', 'success');
    } catch (err) {
        console.error('Lỗi đăng ký:', err);
        showToast('Đăng ký thất bại. Vui lòng thử lại.', 'danger');
    }
}

async function logout() {
    try {
        await fetchWithAuth(`${API_URL}/logout`, { method: 'POST' });
    } catch (err) {
        console.warn('Không thể đăng xuất an toàn:', err);
    }
    currentUser = null;
    sessionToken = null;
    localStorage.removeItem('sessionToken');
    showGuestDashboard();
}

async function loadProfile() {
    try {
        const res = await fetchWithAuth(`${API_URL}/profile`);
        if (!res.ok) return false;
        currentUser = await res.json();
        updateUserInfo();
        return true;
    } catch (err) {
        console.error('Lỗi load profile:', err);
        return false;
    }
}

function updateUserInfo() {
    if (!currentUser) return;
    const displayUser = document.getElementById('displayUser');
    if (currentUser.role === 'guest') {
        displayUser.innerHTML = `Xin chào, <b>Khách</b>`;
    } else {
        displayUser.innerHTML = `Xin chào, <b>${currentUser.name}</b> <span class="role-tag">[${currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'staff' ? 'Nhân viên' : 'Khách hàng'}]</span>`;
    }
}

async function fetchWithAuth(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['Content-Type'] = 'application/json';
    if (sessionToken) {
        options.headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return await fetch(url, options);
}

function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-bg-${type} border-0 mb-2 show`;
    toastEl.setAttribute('role', 'alert');
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Close"></button>
        </div>`;

    toastContainer.appendChild(toastEl);
    toastEl.querySelector('.btn-close').onclick = () => toastEl.remove();
    setTimeout(() => { toastEl.remove(); }, 4200);
}

function confirmAction(message) {
    return window.confirm(message);
}

function setTableLoading(containerId, columnCount = 5) {
    const tableBody = document.getElementById(containerId);
    if (!tableBody) return;
    tableBody.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const tr = document.createElement('tr');
        tr.className = 'skeleton-row';
        tr.innerHTML = Array.from({ length: columnCount }).map(() => `<td><div class="skeleton-cell"></div></td>`).join('');
        tableBody.appendChild(tr);
    }
}

function filterGames() {
    const query = document.getElementById('gameSearchInput')?.value.trim().toLowerCase() || '';
    const status = document.getElementById('gameStatusFilter')?.value || '';
    const filtered = currentBoardGames.filter(game => {
        const matchesName = game.TenGame.toLowerCase().includes(query);
        const matchesStatus = !status || game.TinhTrang === status;
        return matchesName && matchesStatus;
    });
    renderGameTable(filtered);
}

function filterDrinks() {
    const query = document.getElementById('drinkSearchInput')?.value.trim().toLowerCase() || '';
    const unit = document.getElementById('drinkUnitFilter')?.value || '';
    const filtered = currentDrinkItems.filter(drink => {
        const matchesName = drink.TenSP.toLowerCase().includes(query);
        const matchesUnit = !unit || (drink.DonViTinh || drink.Loai || '').toLowerCase() === unit.toLowerCase();
        return matchesName && matchesUnit;
    });
    renderDrinkTable(filtered);
}

function onGameSearch() {
    filterGames();
}

function onDrinkSearch() {
    filterDrinks();
}

function renderGameTable(data) {
    const tableBody = document.getElementById('gameTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (!data.length) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-text">Không tìm thấy game nào.</td></tr>';
        return;
    }
    data.forEach(game => {
        const tr = document.createElement('tr');
        const editButton = canManage() ? `<button class="btn-edit" onclick="openEditGame(${game.MaGame})">Sửa</button>` : '';
        const deleteButton = canDelete() ? `<button class="btn-delete" onclick="deleteGame(${game.MaGame})">Xóa</button>` : '';
        tr.innerHTML = `
            <td>${game.MaGame}</td>
            <td class="name-cell">${game.TenGame}</td>
            <td class="price-cell">${Number(game.GiaThue).toLocaleString()}</td>
            <td class="status-cell"><span class="status ready">${game.TinhTrang}</span></td>
            <td class="action-cell">${editButton}${deleteButton}</td>`;
        tableBody.appendChild(tr);
    });
}

function renderDrinkTable(data) {
    const tableBody = document.getElementById('drinkTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (!data.length) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-text">Không tìm thấy sản phẩm nào.</td></tr>';
        return;
    }
    data.forEach(d => {
        const tr = document.createElement('tr');
        const editButton = canManage() ? `<button class="btn-edit" onclick="openEditDrink(${d.MaSP})">Sửa</button>` : '';
        const deleteButton = canDelete() ? `<button class="btn-delete" onclick="deleteDrink(${d.MaSP})">Xóa</button>` : '';
        tr.innerHTML = `
            <td>${d.MaSP}</td>
            <td class="name-cell">${d.TenSP}</td>
            <td class="price-cell">${Number(d.DonGia).toLocaleString()}</td>
            <td class="status-cell">${d.DonViTinh || d.Loai || 'Ly'}</td>
            <td class="action-cell">${editButton}${deleteButton}</td>`;
        tableBody.appendChild(tr);
    });
}

async function loadCustomerOptions() {
    try {
        const [gameRes, drinkRes] = await Promise.all([
            fetchWithAuth(`${API_URL}/boardgames`),
            fetchWithAuth(`${API_URL}/drinks`)
        ]);
        if (gameRes.ok) allCustomerGames = await gameRes.json();
        if (drinkRes.ok) allCustomerDrinks = await drinkRes.json();
    } catch (err) {
        console.error('Lỗi tải tùy chọn game/drink:', err);
    }
}

async function loadCustomerHome() {
    await loadCustomerOptions();
    await Promise.all([loadCustomerGames(), loadCustomerDrinks(), loadCustomerTables()]);
}

async function loadCustomerGames() {
    try {
        if (!allCustomerGames.length) {
            const res = await fetchWithAuth(`${API_URL}/boardgames`);
            if (!res.ok) {
                console.error('Lỗi tải game:', await res.text());
                return;
            }
            allCustomerGames = await res.json();
        }
        const gallery = document.getElementById('customerGameGallery');
        gallery.innerHTML = '';
        allCustomerGames.slice(0, 4).forEach(game => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <img src="images/games/${game.MaGame}.jpg" alt="${game.TenGame}">
                <div class="product-card-body">
                    <h3>${game.TenGame}</h3>
                    <p>${game.TinhTrang}</p>
                    <span>${Number(game.GiaThue).toLocaleString()} VNĐ / giờ</span>
                </div>`;
            card.onclick = () => openCustomerDetail('game', game.MaGame);
            gallery.appendChild(card);
        });
    } catch (err) {
        console.error('Lỗi tải game cho khách hàng:', err);
    }
}

async function loadCustomerDrinks() {
    try {
        if (!allCustomerDrinks.length) {
            const res = await fetchWithAuth(`${API_URL}/drinks`);
            if (!res.ok) {
                console.error('Lỗi tải đồ uống:', await res.text());
                return;
            }
            allCustomerDrinks = await res.json();
        }
        const gallery = document.getElementById('customerDrinkGallery');
        gallery.innerHTML = '';
        allCustomerDrinks.slice(0, 4).forEach(drink => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <img src="images/drinks/${drink.MaSP}.jpg" alt="${drink.TenSP}">
                <div class="product-card-body">
                    <h3>${drink.TenSP}</h3>
                    <p>${drink.DonViTinh || 'Ly'}</p>
                    <span>${Number(drink.DonGia).toLocaleString()} VNĐ</span>
                </div>`;
            card.onclick = () => openCustomerDetail('drink', drink.MaSP);
            gallery.appendChild(card);
        });
    } catch (err) {
        console.error('Lỗi tải đồ uống cho khách hàng:', err);
    }
}

function openCustomerDetail(type, id) {
    const item = type === 'game'
        ? allCustomerGames.find(game => Number(game.MaGame) === Number(id))
        : allCustomerDrinks.find(drink => Number(drink.MaSP) === Number(id));
    if (!item) return;

    const image = document.getElementById('customerDetailImage');
    const title = document.getElementById('customerDetailTitle');
    const subTitle = document.getElementById('customerDetailSubtitle');
    const description = document.getElementById('customerDetailDescription');
    const metaList = document.getElementById('customerDetailMeta');

    title.innerText = type === 'game' ? item.TenGame : item.TenSP;
    subTitle.innerText = type === 'game' ? 'Chi tiết Board Game' : 'Chi tiết Đồ uống';
    if (type === 'game') {
        image.src = `images/games/${item.MaGame}.jpg`;
    } else {
        image.src = `images/drinks/${item.MaSP}.jpg`;
    }
    image.alt = type === 'game' ? item.TenGame : item.TenSP;

    if (type === 'game') {
        description.innerText = item.MoTa || 'Board game thú vị với luật chơi dễ tiếp cận, phù hợp cho nhóm bạn và gia đình.';
        metaList.innerHTML = `
            <li><strong>Giá thuê:</strong> ${Number(item.GiaThue).toLocaleString()} VNĐ / giờ</li>
            <li><strong>Tình trạng:</strong> ${item.TinhTrang || 'Chưa rõ'}</li>
            <li><strong>Loại:</strong> ${item.TheLoai || 'Thử thách & Giải trí'}</li>
        `;
    } else {
        description.innerText = item.MoTa || 'Đồ uống tươi mát, phù hợp khi thư giãn cùng bạn bè và tận hưởng thời gian chơi game.';
        metaList.innerHTML = `
            <li><strong>Đơn giá:</strong> ${Number(item.DonGia).toLocaleString()} VNĐ</li>
            <li><strong>Đơn vị:</strong> ${item.DonViTinh || 'Ly'}</li>
            <li><strong>Loại:</strong> ${item.Loai || 'Thức uống'}</li>
        `;
    }

    document.getElementById('customerDetailModal').style.display = 'flex';
}

function closeCustomerDetailModal() {
    document.getElementById('customerDetailModal').style.display = 'none';
}

async function loadCustomerTables() {
    try {
        const res = await fetchWithAuth(`${API_URL}/tables`);
        if (!res.ok) {
            const error = await res.text();
            console.error('Lỗi tải trạng thái bàn:', error);
            document.getElementById('customerTableStatus').innerHTML = '<p class="empty-text">Không thể tải trạng thái bàn.</p>';
            return;
        }
        const data = await res.json();
        const tableGrid = document.getElementById('customerTableStatus');
        let availableCount = 0;
        let busyCount = 0;
        tableGrid.innerHTML = '';
        data.forEach(table => {
            if (table.TrangThai === 'Trống') availableCount++;
            else busyCount++;
            const tableName = table.TenBan && !table.TenBan.toString().startsWith('Bàn') ? `Bàn ${table.TenBan}` : (table.TenBan || `Bàn ${table.MaBan}`);
            const gameOptions = allCustomerGames.length
                ? `<option value="">Bỏ qua trò chơi</option>${allCustomerGames.map(game => `<option value="${game.MaGame}">${game.TenGame}</option>`).join('')}`
                : '<option value="">Đang tải trò chơi...</option>';
            const drinkOptions = allCustomerDrinks.length
                ? `<option value="">Bỏ qua đồ uống</option>${allCustomerDrinks.map(drink => `<option value="${drink.MaSP}">${drink.TenSP}</option>`).join('')}`
                : '<option value="">Đang tải đồ uống...</option>';
            const tableCustomerId = table.MaKH != null ? Number(table.MaKH) : null;
            const currentUserId = currentUser && currentUser.id != null ? Number(currentUser.id) : null;
            const isCurrentUserBooking = table.TrangThai === 'Đã đặt' && tableCustomerId && currentUserId && tableCustomerId === currentUserId;
            const card = document.createElement('div');
            card.className = `product-card table-card ${table.TrangThai === 'Trống' ? 'available' : 'busy'}`;
            card.innerHTML = `
                <div class="table-card-header">
                    <h3>${tableName}</h3>
                    <span class="table-badge ${table.TrangThai === 'Trống' ? 'badge-green' : 'badge-red'}">
                        ${table.TrangThai === 'Trống' ? 'Trống' : 'Full'}
                    </span>
                </div>
                <div class="table-card-body">
                    <p class="table-status">${table.TrangThai === 'Trống' ? 'Bàn đang sẵn sàng' : isCurrentUserBooking ? 'Bàn đã có khách' : 'Bàn đã có người đặt trước'}</p>
                    ${table.TrangThai === 'Trống' ? `
                        <div class="booking-inputs">
                            <label for="timeInput-${table.MaBan}">Thời gian vào</label>
                            <input type="datetime-local" id="timeInput-${table.MaBan}" class="booking-select" required>
                            <label for="gameSelect-${table.MaBan}">Chọn trò chơi (tùy chọn)</label>
                            <select id="gameSelect-${table.MaBan}" class="booking-select">${gameOptions}</select>
                            <label for="drinkSelect-${table.MaBan}">Chọn đồ uống (tùy chọn)</label>
                            <select id="drinkSelect-${table.MaBan}" class="booking-select">${drinkOptions}</select>
                        </div>
                        <button onclick="bookTable(${table.MaBan})">Đặt trước</button>
                    ` : isCurrentUserBooking ? `
                        <div class="booking-info">
                            <p><strong>Khách:</strong> ${table.KhachHang || 'Khách lẻ'}</p>
                            <p><strong>Nhân viên:</strong> ${table.NhanVien || '---'}</p>
                            <p><strong>Thời gian vào:</strong> ${formatDateTime(table.GioVao)}</p>
                        </div>
                        <button onclick="cancelBooking(${table.MaBan})" class="btn-delete">Hủy đặt</button>
                    ` : `
                        <p style="margin: 12px 0 0; color: #475569;">Thông tin chi tiết chỉ hiển thị với khách hàng đã đặt bàn này.</p>
                        <button disabled style="margin-top: 18px; width: 100%; padding: 12px 16px; border-radius: 999px; border: none; background: #94a3b8; color: white; cursor: not-allowed;">Đã đặt</button>
                    `}`;
            tableGrid.appendChild(card);
        });
        document.getElementById('tableAvailableCount').innerText = availableCount;
        document.getElementById('tableBusyCount').innerText = busyCount;
        renderCustomerBookingList(data);
    } catch (err) {
        console.error('Lỗi tải trạng thái bàn:', err);
    }
}

function renderCustomerBookingList(tables) {
    const bookingList = document.getElementById('customerBookingList');
    bookingList.innerHTML = '';
    if (!currentUser || !tables || !tables.length) {
        bookingList.innerHTML = '<p class="empty-text">Không có đặt bàn nào.</p>';
        return;
    }
    const currentUserId = Number(currentUser.id);
    const bookings = tables.filter(table => table.TrangThai === 'Đã đặt' && table.MaKH != null && Number(table.MaKH) === currentUserId);
    if (!bookings.length) {
        bookingList.innerHTML = '<p class="empty-text">Bạn chưa có đặt bàn nào.</p>';
        return;
    }
    bookings.forEach(table => {
        const item = document.createElement('div');
        item.className = 'booking-card';
        item.innerHTML = `
            <div class="booking-card-header">
                <h3>${table.TenBan || `Bàn ${table.MaBan}`}</h3>
                <span class="badge-red">${table.TrangThai}</span>
            </div>
            <p><strong>Khách:</strong> ${table.KhachHang || 'Khách lẻ'}</p>
            <p><strong>Nhân viên:</strong> ${table.NhanVien || '---'}</p>
            <p><strong>Thời gian vào:</strong> ${formatDateTime(table.GioVao)}</p>
            <button class="btn-delete" onclick="cancelBooking(${table.MaBan})">Hủy đặt bàn</button>
        `;
        bookingList.appendChild(item);
    });
}

function formatSqlDateTime(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

async function bookTable(maBan) {
    if (!currentUser || currentUser.role === 'guest') {
        showToast('Vui lòng đăng nhập để đặt bàn.', 'warning');
        showLoginScreen();
        return;
    }
    try {
        const timeInput = document.getElementById(`timeInput-${maBan}`);
        const gameSelect = document.getElementById(`gameSelect-${maBan}`);
        const drinkSelect = document.getElementById(`drinkSelect-${maBan}`);

        if (!timeInput || !timeInput.value) {
            return showToast('Vui lòng chọn thời gian vào.', 'warning');
        }
        const formattedTime = formatSqlDateTime(timeInput.value);
        if (!formattedTime) {
            return showToast('Định dạng thời gian vào không hợp lệ.', 'warning');
        }

        const payload = { MaBan: maBan, GioVao: formattedTime };
        if (gameSelect && gameSelect.value) payload.MaGame = parseInt(gameSelect.value, 10);
        if (drinkSelect && drinkSelect.value) payload.MaSP = parseInt(drinkSelect.value, 10);

        const res = await fetchWithAuth(`${API_URL}/book-table`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const error = await res.text();
            return showToast(error || 'Không thể đặt trước bàn.', 'danger');
        }
        showToast('Đặt bàn thành công!', 'success');
        loadCustomerTables();
    } catch (err) {
        console.error('Lỗi đặt bàn:', err);
        showToast('Lỗi kết nối khi đặt bàn.', 'danger');
    }
}

async function cancelBooking(maBan) {
    if (!confirmAction('Bạn có chắc chắn muốn hủy đặt bàn này?')) return;
    try {
        const res = await fetchWithAuth(`${API_URL}/cancel-booking/${maBan}`, {
            method: 'DELETE'
        });
        if (!res.ok) {
            const error = await res.text();
            return showToast(error || 'Không thể hủy đặt bàn.', 'danger');
        }
        showToast('Hủy đặt bàn thành công!', 'success');
        loadCustomerTables();
    } catch (err) {
        console.error('Lỗi hủy đặt bàn:', err);
        showToast('Lỗi kết nối khi hủy đặt bàn.', 'danger');
    }
}

function canManage() {
    return currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff');
}

function canDelete() {
    return currentUser && currentUser.role === 'admin';
}

function canViewInvoices() {
    return currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff');
}

function updateRoleUI() {
    const customerLink = document.getElementById('navCustomerLink');
    const gamesLink = document.getElementById('navGamesLink');
    const drinksLink = document.getElementById('navDrinksLink');
    const invoicesLink = document.getElementById('navInvoicesLink');
    const customersLink = document.getElementById('navCustomersLink');
    const sidebarUserInfo = document.getElementById('sidebarUserInfo');
    const dashboardBanner = document.getElementById('dashboard-banner');
    const customerBanner = document.getElementById('customer-banner');
    const bannerAdd = document.querySelector('.dashboard-banner .btn-add');
    const addGameButton = document.querySelector('#page-games header .btn-add');
    const addDrinkButton = document.querySelector('#page-drinks header .btn-add');

    if (currentUser.role === 'guest') {
        customerLink.style.display = 'block';
        gamesLink.style.display = 'none';
        drinksLink.style.display = 'none';
        invoicesLink.style.display = 'none';
        customersLink.style.display = 'none';
        dashboardBanner.style.display = 'none';
        customerBanner.style.display = 'block';
        if (sidebarUserInfo) sidebarUserInfo.style.display = 'none';
    } else if (currentUser.role === 'customer') {
        customerLink.style.display = 'block';
        gamesLink.style.display = 'none';
        drinksLink.style.display = 'none';
        invoicesLink.style.display = 'none';
        customersLink.style.display = 'none';
        dashboardBanner.style.display = 'none';
        customerBanner.style.display = 'block';
        if (sidebarUserInfo) sidebarUserInfo.style.display = 'flex';
    } else {
        customerLink.style.display = 'none';
        gamesLink.style.display = 'block';
        drinksLink.style.display = 'block';
        invoicesLink.style.display = currentUser.role === 'admin' || currentUser.role === 'staff' ? 'block' : 'none';
        customersLink.style.display = currentUser.role === 'admin' ? 'block' : 'none';
        dashboardBanner.style.display = 'block';
        customerBanner.style.display = 'none';
        if (sidebarUserInfo) sidebarUserInfo.style.display = 'flex';
    }

    if (!canViewInvoices()) {
        if (invoicesLink) invoicesLink.style.display = 'none';
    }

    if (canManage()) {
        if (bannerAdd) bannerAdd.style.display = 'inline-flex';
        if (addGameButton) addGameButton.style.display = 'inline-flex';
        if (addDrinkButton) addDrinkButton.style.display = 'inline-flex';
    } else {
        if (bannerAdd) bannerAdd.style.display = 'none';
        if (addGameButton) addGameButton.style.display = 'none';
        if (addDrinkButton) addDrinkButton.style.display = 'none';
    }

    const loginNav = document.getElementById('loginNavButton');
    const logoutNav = document.getElementById('logoutButton');
    if (currentUser.role === 'guest') {
        if (loginNav) loginNav.style.display = 'inline-flex';
        if (logoutNav) logoutNav.style.display = 'none';
    } else {
        if (loginNav) loginNav.style.display = 'none';
        if (logoutNav) logoutNav.style.display = 'inline-flex';
    }
}

function showPage(pageId, element) {
    if (pageId === 'page-invoices' && !canViewInvoices()) {
        showToast('Bạn không có quyền xem hóa đơn.', 'warning');
        return;
    }
    if (pageId === 'page-customers' && currentUser.role !== 'admin') {
        showToast('Chỉ admin mới có quyền quản lý khách hàng.', 'warning');
        return;
    }
    document.querySelectorAll('.content-page').forEach(p => p.style.display = 'none');
    document.getElementById(pageId).style.display = 'block';
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    if (element) element.classList.add('active');

    if (pageId === 'page-games') loadBoardGames();
    if (pageId === 'page-drinks') loadDrinks();
    if (pageId === 'page-invoices') loadInvoices();
    if (pageId === 'page-customers') loadCustomers();
    if (pageId === 'page-customer') loadCustomerHome();
}

async function loadBoardGames() {
    try {
        setTableLoading('gameTableBody');
        const res = await fetchWithAuth(`${API_URL}/boardgames`);
        if (!res.ok) {
            const errorText = await res.text();
            console.error('Lỗi tải game:', errorText);
            showToast('Không thể tải danh sách game. Vui lòng thử lại.', 'danger');
            return;
        }
        const data = await res.json();
        currentBoardGames = data;
        filterGames();
    } catch (err) {
        console.error('Lỗi load game:', err);
        showToast('Lỗi kết nối khi tải game.', 'danger');
    }
}

function openGameModal() {
    currentEditGameId = null;
    document.getElementById('gameModalTitle').innerText = 'Thêm Game Mới';
    document.getElementById('gameName').value = '';
    document.getElementById('gamePrice').value = '';
    document.getElementById('gameStatus').value = 'Sẵn sàng';
    document.getElementById('gameModal').style.display = 'flex';
}

function openEditGame(id) {
    const game = currentBoardGames.find(item => Number(item.MaGame) === Number(id));
    if (!game) return showToast('Không tìm thấy game để sửa.', 'danger');
    currentEditGameId = game.MaGame;
    document.getElementById('gameModalTitle').innerText = 'Cập Nhật Game #' + game.MaGame;
    document.getElementById('gameName').value = game.TenGame;
    document.getElementById('gamePrice').value = game.GiaThue;
    document.getElementById('gameStatus').value = game.TinhTrang;
    document.getElementById('gameModal').style.display = 'flex';
}

async function saveGame() {
    const data = {
        TenGame: document.getElementById('gameName').value.trim(),
        GiaThue: parseInt(document.getElementById('gamePrice').value, 10),
        TinhTrang: document.getElementById('gameStatus').value
    };
    if (!data.TenGame || !data.GiaThue) return showToast('Vui lòng nhập đủ thông tin game.', 'warning');

    const method = currentEditGameId ? 'PUT' : 'POST';
    const url = currentEditGameId ? `${API_URL}/boardgames/${currentEditGameId}` : `${API_URL}/boardgames`;

    try {
        const res = await fetchWithAuth(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            closeModal('gameModal');
            await loadBoardGames();
            showToast(`Game đã được ${currentEditGameId ? 'cập nhật' : 'thêm'} thành công.`, 'success');
        } else {
            const errorText = await res.text();
            showToast(errorText || 'Lỗi khi lưu game.', 'danger');
        }
    } catch (err) {
        console.error('Lỗi saveGame:', err);
        showToast('Lỗi kết nối server khi lưu game.', 'danger');
    }
}

async function deleteGame(id) {
    if (!confirmAction('Bạn có chắc muốn xóa game này không?')) return;
    try {
        const res = await fetchWithAuth(`${API_URL}/boardgames/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await loadBoardGames();
            showToast('Game đã được xóa.', 'success');
        } else {
            const errorText = await res.text();
            showToast(errorText || 'Không thể xóa game này.', 'danger');
        }
    } catch (err) {
        console.error('Lỗi deleteGame:', err);
        showToast('Lỗi kết nối server khi xóa game.', 'danger');
    }
}

async function loadDrinks() {
    try {
        setTableLoading('drinkTableBody');
        const res = await fetchWithAuth(`${API_URL}/drinks`);
        if (!res.ok) {
            const errorText = await res.text();
            console.error('Lỗi tải đồ uống:', errorText);
            showToast('Không thể tải danh sách đồ uống. Vui lòng thử lại.', 'danger');
            return;
        }
        const data = await res.json();
        currentDrinkItems = data;
        filterDrinks();
    } catch (err) {
        console.error('Lỗi load sản phẩm:', err);
        showToast('Lỗi kết nối khi tải sản phẩm.', 'danger');
    }
}

async function loadInvoices() {
    try {
        const res = await fetchWithAuth(`${API_URL}/invoices`);
        if (!res.ok) {
            console.error('Lỗi tải hóa đơn:', await res.text());
            return;
        }
        const data = await res.json();
        const invoiceList = document.getElementById('invoiceList');
        invoiceList.innerHTML = '';

        if (!Array.isArray(data) || data.length === 0) {
            invoiceList.innerHTML = '<li class="empty-text">Hiện không có hóa đơn nào.</li>';
            return;
        }

        data.forEach(inv => {
            const item = document.createElement('li');
            item.className = 'invoice-item';
            item.dataset.invoiceId = inv.MaHD;
            item.innerHTML = `
                <div class="invoice-item-title">HD #${inv.MaHD} - ${inv.TenBan}</div>
                <div class="invoice-item-meta">${inv.TrangThaiThanhToan} • ${formatDateTime(inv.GioVao)}</div>
                <div class="invoice-item-total">${Number(inv.TongTien).toLocaleString()} VNĐ</div>`;
            item.onclick = () => selectInvoice(inv.MaHD, item);
            invoiceList.appendChild(item);
        });

        selectInvoice(data[0].MaHD, invoiceList.querySelector('.invoice-item'));
    } catch (err) {
        console.error('Lỗi load hóa đơn:', err);
        document.getElementById('invoiceList').innerHTML = '<li class="empty-text">Không thể tải hóa đơn.</li>';
    }
}

async function selectInvoice(id, element) {
    document.querySelectorAll('.invoice-item').forEach(item => item.classList.remove('active'));
    if (element) element.classList.add('active');

    try {
        const res = await fetchWithAuth(`${API_URL}/invoices/${id}`);
        if (!res.ok) {
            console.error('Lỗi tải chi tiết hóa đơn:', await res.text());
            return;
        }
        const data = await res.json();
        const invoice = data.invoice;
        const itemDetails = document.getElementById('itemDetails');
        const deleteInvoiceButton = document.getElementById('invoiceDeleteButton');

        document.getElementById('displayMaHD').innerText = invoice.MaHD;
        document.getElementById('displayBan').innerText = invoice.TenBan;
        document.getElementById('displayNV').innerText = invoice.NhanVien;
        document.getElementById('displayKH').innerText = invoice.KhachHang || 'Khách lẻ';
        document.getElementById('displayGioVao').innerText = formatDateTime(invoice.GioVao);
        document.getElementById('displayGioRa').innerText = invoice.GioRa ? formatDateTime(invoice.GioRa) : '---';
        document.getElementById('displayTongTien').innerText = Number(invoice.TongTien).toLocaleString();
        document.getElementById('invoicePaymentStatus').value = invoice.TrangThaiThanhToan || 'Chưa thanh toán';
        updateInvoiceActionButton(invoice.TrangThaiThanhToan || 'Chưa thanh toán');
        deleteInvoiceButton.style.display = canDelete() ? 'block' : 'none';

        itemDetails.innerHTML = '';
        if (Array.isArray(data.drinks) && data.drinks.length) {
            const drinksBlock = document.createElement('div');
            drinksBlock.innerHTML = '<h4>Đồ uống</h4>' + data.drinks.map(d => `<p>${d.TenSP} x${d.SoLuong} = ${Number(d.ThanhTien).toLocaleString()} VNĐ</p>`).join('');
            itemDetails.appendChild(drinksBlock);
        }
        if (Array.isArray(data.games) && data.games.length) {
            const gamesBlock = document.createElement('div');
            gamesBlock.innerHTML = '<h4>Thuê game</h4>' + data.games.map(g => `<p>${g.TenGame} x${g.SoLuong} = ${Number(g.ThanhTien).toLocaleString()} VNĐ</p>`).join('');
            itemDetails.appendChild(gamesBlock);
        }
        if ((!data.drinks || data.drinks.length === 0) && (!data.games || data.games.length === 0)) {
            itemDetails.innerHTML = '<p class="empty-text">Hóa đơn chưa có chi tiết.</p>';
        }
    } catch (err) {
        console.error('Lỗi load chi tiết hóa đơn:', err);
    }
}

function updateInvoiceActionButton(status) {
    const button = document.getElementById('invoiceStatusButton');
    if (!button) return;
    if (status === 'Đã thanh toán') {
        button.innerHTML = '<i class="fa-solid fa-print"></i> In hóa đơn';
    } else {
        button.innerHTML = '<i class="fa-solid fa-print"></i> Thanh toán & In';
    }
}

async function saveInvoiceStatusAndPrint() {
    const invoiceId = document.getElementById('displayMaHD').innerText;
    if (!invoiceId || invoiceId === '---') return;

    const newStatus = document.getElementById('invoicePaymentStatus').value;
    try {
        const res = await fetchWithAuth(`${API_URL}/invoices/${invoiceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ TrangThaiThanhToan: newStatus })
        });

        if (!res.ok) {
            showToast('Cập nhật trạng thái hóa đơn thất bại.', 'danger');
            return;
        }

        await loadInvoices();
        const selectedElement = document.querySelector(`#invoiceList [data-invoice-id="${invoiceId}"]`);
        await selectInvoice(invoiceId, selectedElement);
        window.print();
    } catch (err) {
        console.error('Lỗi cập nhật trạng thái hóa đơn:', err);
        showToast('Lỗi khi cập nhật trạng thái hóa đơn. Vui lòng thử lại.', 'danger');
    }
}

async function deleteSelectedInvoice() {
    const invoiceId = document.getElementById('displayMaHD').innerText;
    if (!invoiceId || invoiceId === '---') return;
    if (!confirmAction('Bạn có chắc chắn muốn xóa hóa đơn này?')) return;

    try {
        const res = await fetchWithAuth(`${API_URL}/invoices/${invoiceId}`, { method: 'DELETE' });
        if (!res.ok) {
            const errorText = await res.text();
            showToast(errorText || 'Không thể xóa hóa đơn.', 'danger');
            return;
        }

        await loadInvoices();
        const invoiceList = document.getElementById('invoiceList');
        if (!invoiceList.querySelector('.invoice-item')) {
            document.getElementById('displayMaHD').innerText = '---';
            document.getElementById('displayBan').innerText = '---';
            document.getElementById('displayNV').innerText = '---';
            document.getElementById('displayKH').innerText = '---';
            document.getElementById('displayGioVao').innerText = '---';
            document.getElementById('displayGioRa').innerText = '---';
            document.getElementById('displayTongTien').innerText = '0';
            document.getElementById('itemDetails').innerHTML = '<p class="empty-text">Chọn một hóa đơn để xem...</p>';
            document.getElementById('invoiceDeleteButton').style.display = 'none';
        }
    } catch (err) {
        console.error('Lỗi xóa hóa đơn:', err);
        showToast('Lỗi khi xóa hóa đơn. Vui lòng thử lại.', 'danger');
    }
}

function formatDateTime(value) {
    if (!value) return '---';
    const date = new Date(value);
    return date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function openDrinkModal() {
    currentEditDrinkId = null;
    document.getElementById('drinkModalTitle').innerText = 'Thêm Sản Phẩm Mới';
    document.getElementById('drinkName').value = '';
    document.getElementById('drinkPrice').value = '';
    document.getElementById('drinkUnit').value = '';
    document.getElementById('drinkModal').style.display = 'flex';
}

function openEditDrink(id) {
    const drink = currentDrinkItems.find(item => Number(item.MaSP) === Number(id));
    if (!drink) return showToast('Không tìm thấy sản phẩm để sửa.', 'danger');
    currentEditDrinkId = drink.MaSP;
    document.getElementById('drinkModalTitle').innerText = 'Sửa Sản Phẩm #' + drink.MaSP;
    document.getElementById('drinkName').value = drink.TenSP;
    document.getElementById('drinkPrice').value = drink.DonGia;
    document.getElementById('drinkUnit').value = drink.DonViTinh || drink.Loai;
    document.getElementById('drinkModal').style.display = 'flex';
}

async function saveDrink() {
    const data = {
        TenSP: document.getElementById('drinkName').value.trim(),
        DonGia: parseInt(document.getElementById('drinkPrice').value, 10),
        DonViTinh: document.getElementById('drinkUnit').value.trim()
    };
    if (!data.TenSP || !data.DonGia) return showToast('Vui lòng nhập đầy đủ thông tin đồ uống.', 'warning');

    const method = currentEditDrinkId ? 'PUT' : 'POST';
    const url = currentEditDrinkId ? `${API_URL}/drinks/${currentEditDrinkId}` : `${API_URL}/drinks`;

    try {
        const res = await fetchWithAuth(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            closeModal('drinkModal');
            await loadDrinks();
            showToast(`Sản phẩm đã được ${currentEditDrinkId ? 'cập nhật' : 'thêm'} thành công.`, 'success');
        } else {
            const errorText = await res.text();
            showToast(errorText || 'Lỗi khi lưu sản phẩm.', 'danger');
        }
    } catch (err) {
        console.error('Lỗi saveDrink:', err);
        showToast('Lỗi kết nối server khi lưu sản phẩm.', 'danger');
    }
}

async function deleteDrink(id) {
    if (!confirmAction('Bạn có chắc chắn muốn xóa sản phẩm này?')) return;
    try {
        const res = await fetchWithAuth(`${API_URL}/drinks/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await loadDrinks();
            showToast('Sản phẩm đã được xóa.', 'success');
        } else {
            const errorText = await res.text();
            showToast(errorText || 'Không thể xóa sản phẩm.', 'danger');
        }
    } catch (err) {
        console.error('Lỗi deleteDrink:', err);
        showToast('Lỗi kết nối server khi xóa sản phẩm.', 'danger');
    }
}

async function loadCustomers() {
    try {
        const res = await fetchWithAuth(`${API_URL}/customers`);
        if (!res.ok) {
            const errorText = await res.text();
            console.error('Lỗi tải khách hàng:', errorText);
            showToast('Không thể tải danh sách khách hàng.', 'danger');
            return;
        }
        const data = await res.json();
        const tableBody = document.getElementById('customerTableBody');
        tableBody.innerHTML = '';

        data.forEach(customer => {
            const tr = document.createElement('tr');
            const deleteButton = canDelete() ? `<button class="btn-delete" onclick="deleteCustomer(${customer.MaKH})">Xóa</button>` : '';
            tr.innerHTML = `
                <td>${customer.MaKH}</td>
                <td>${customer.TenKH}</td>
                <td>${customer.SoDienThoai}</td>
                <td>${Number(customer.DiemTichLuy).toLocaleString()}</td>
                <td class="action-cell">${deleteButton}</td>`;
            tableBody.appendChild(tr);
        });
    } catch (err) {
        console.error('Lỗi tải khách hàng:', err);
    }
}

async function deleteCustomer(id) {
    if (!confirmAction('Bạn có chắc chắn muốn xóa khách hàng này?')) return;
    try {
        const res = await fetchWithAuth(`${API_URL}/customers/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await loadCustomers();
            showToast('Khách hàng đã được xóa.', 'success');
        } else {
            const errorText = await res.text();
            showToast(errorText || 'Không thể xóa khách hàng.', 'danger');
        }
    } catch (err) {
        console.error('Lỗi deleteCustomer:', err);
        showToast('Lỗi kết nối khi xóa khách hàng.', 'danger');
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

let revenueChartInstance = null;
function normalizeRevenueLabel(label) {
    if (typeof label !== 'string') return null;
    const isoMatch = label.match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoMatch) return label;
    const parsed = new Date(label);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }
    return null;
}

async function loadRevenueChart() {
    try {
        const res = await fetchWithAuth(`${API_URL}/stats/revenue`);
        if (!res.ok) {
            const message = await res.text();
            console.error('Lỗi tải doanh thu:', message);
            const trendNote = document.getElementById('revenueTrendNote');
            if (trendNote) trendNote.innerText = 'Không thể tải dữ liệu doanh thu.';
            return;
        }
        const data = await res.json();
        const rawLabels = Array.isArray(data.labels) ? data.labels : [];
        const values = Array.isArray(data.values) ? data.values.map(v => Number(v) || 0) : [];

        const today = new Date();
        const last7days = Array.from({ length: 7 }, (_, idx) => {
            const date = new Date(today);
            date.setDate(today.getDate() - (6 - idx));
            return date.toISOString().slice(0, 10);
        });

        const normalizedLabels = rawLabels.map(normalizeRevenueLabel);
        const labelMap = new Map();
        normalizedLabels.forEach((lbl, idx) => {
            if (lbl) labelMap.set(lbl, values[idx] || 0);
        });

        const filledValues = last7days.map(day => labelMap.has(day) ? labelMap.get(day) : 0);
        if (!filledValues.some(v => v !== 0) && values.length > 0) {
            // Fallback nếu server trả nhãn không chuẩn hoặc tuần khác
            const fallback = new Array(7).fill(0);
            for (let i = 0; i < Math.min(values.length, 7); i += 1) {
                fallback[7 - values.length + i] = values[i] || 0;
            }
            filledValues.splice(0, filledValues.length, ...fallback);
            console.warn('Dữ liệu doanh thu không khớp nhãn ngày, dùng fallback:', rawLabels, values);
        }

        const ctx = document.getElementById('revenueChart').getContext('2d');
        if (revenueChartInstance) {
            revenueChartInstance.destroy();
        }
        revenueChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7days,
                datasets: [{
                    label: 'Doanh thu theo ngày (VNĐ)',
                    data: filledValues,
                    backgroundColor: 'rgba(79, 70, 229, 0.18)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { ticks: { maxRotation: 0, minRotation: 0 } },
                    y: { beginAtZero: true }
                }
            }
        });

        const trendNote = document.getElementById('revenueTrendNote');
        if (trendNote) {
            const len = filledValues.length;
            const latest = filledValues[len - 1] || 0;
            const previous = filledValues[len - 2] || 0;
            const diff = latest - previous;
            const direction = diff > 0 ? 'tăng' : diff < 0 ? 'giảm' : 'ổn định';
            const arrow = diff > 0 ? '📈' : diff < 0 ? '📉' : '➖';
            trendNote.innerText = `${arrow} Doanh thu ${direction} ${Math.abs(diff).toLocaleString()} VNĐ so với ngày trước đó.`;
        }
    } catch (err) {
        console.error('Lỗi tải chart:', err);
        const trendNote = document.getElementById('revenueTrendNote');
        if (trendNote) trendNote.innerText = 'Không thể tải dữ liệu doanh thu.';
    }
}

async function loadDashboardMetrics() {
    try {
        const res = await fetchWithAuth(`${API_URL}/stats/summary`);
        if (!res.ok) {
            const error = await res.text();
            console.error('Lỗi tải chỉ số dashboard:', error);
            return;
        }
        const data = await res.json();
        const stats = data.stats || {};

        document.getElementById('statGamesCount').innerText = stats.TotalGames ?? 0;
        document.getElementById('statDrinksCount').innerText = stats.TotalDrinks ?? 0;
        document.getElementById('statCustomersCount').innerText = stats.TotalCustomers ?? 0;
        document.getElementById('statInvoicesCount').innerText = stats.TotalInvoices ?? 0;
        document.getElementById('dashboardUpdatedAt').innerText = new Date().toLocaleTimeString('vi-VN');

        // Chỉ cập nhật số liệu tổng quan ở đây. Các trạng thái bàn realtime sẽ cập nhật riêng.
    } catch (err) {
        console.error('Lỗi tải chỉ số dashboard:', err);
    }
}

async function loadRealtimeTableStatus() {
    try {
        const res = await fetchWithAuth(`${API_URL}/tables`);
        if (!res.ok) {
            console.error('Lỗi tải trạng thái bàn admin:', await res.text());
            return;
        }
        const tables = await res.json();
        const container = document.getElementById('dashboardTableStatus');
        container.innerHTML = '';
        if (!Array.isArray(tables) || !tables.length) {
            container.innerHTML = '<div class="status-pill">Không có dữ liệu bàn.</div>';
            return;
        }

        tables.slice(0, 6).forEach(table => {
            const status = table.TrangThai === 'Trống' ? 'Sẵn sàng' : 'Đang phục vụ';
            const pill = document.createElement('div');
            pill.className = 'status-pill';
            pill.innerHTML = `<span>${table.TenBan || `Bàn ${table.MaBan}`}</span><span>${status}</span>`;
            container.appendChild(pill);
        });

        document.getElementById('dashboardUpdatedAt').innerText = `Cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}`;
    } catch (err) {
        console.error('Lỗi tải trạng thái bàn admin:', err);
    }
}

function startDashboardPolling() {
    stopDashboardPolling();
    dashboardRefreshInterval = setInterval(() => {
        loadDashboardMetrics();
        loadRealtimeTableStatus();
        loadRevenueChart();
    }, 15000);
}

function stopDashboardPolling() {
    if (dashboardRefreshInterval) {
        clearInterval(dashboardRefreshInterval);
        dashboardRefreshInterval = null;
    }
}

const originalFetch = window.fetch;
let activeRequests = 0;
window.fetch = async function(...args) {
    activeRequests++;
    document.getElementById('globalSpinner').style.display = 'flex';
    try {
        const response = await originalFetch.apply(this, args);
        return response;
    } finally {
        activeRequests--;
        if (activeRequests === 0) {
            document.getElementById('globalSpinner').style.display = 'none';
        }
    }
};
