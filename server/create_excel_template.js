/**
 * Tạo file Excel template: database_offline.xlsx
 * Cấu trúc y hệt Google Sheets online
 * Chạy 1 lần: node create_excel_template.js
 */
const XLSX = require('xlsx');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'database_offline.xlsx');

const wb = XLSX.utils.book_new();

// ============================================================
// SHEET 1: Tài khoản
// ============================================================
const taiKhoanData = [
    ['MSNV', 'Mật Khẩu', 'Họ Tên', 'Vai Trò', 'Trạng Thái', 'Quyền Hạn', 'Số Lần Sai', 'Khóa Đến'],
    ['BOSS001', 'QNhi@6789!', 'Super Admin', 'admin', 'Đã duyệt',
     'overview,post-offices,trends,materials,forklifts,infra-health,purchases,transport-map,ccdc-device,ccdc-report,user-management',
     0, ''],
    ['NV001', '123456', 'Nhân Viên Test', 'user', 'Đã duyệt',
     'overview,ccdc-device,ccdc-report', 0, ''],
];
const wsTaiKhoan = XLSX.utils.aoa_to_sheet(taiKhoanData);
wsTaiKhoan['!cols'] = [
    {wch:12},{wch:15},{wch:25},{wch:10},{wch:12},{wch:80},{wch:10},{wch:20}
];
XLSX.utils.book_append_sheet(wb, wsTaiKhoan, 'Tài khoản');

// ============================================================
// SHEET 2: Nhân viên
// ============================================================
const nhanVienData = [
    ['MSNV', 'Họ Tên', 'Ca Làm Việc', 'Quản Lý', 'Trạng Thái', 'Bộ Phận', 'SĐT', 'Telegram ID'],
    ['3006216', 'Nguyễn Văn Bảo', 'Ca 1: 06h-14h', 'Ngô Ngọc Quân', 'Đang làm việc', 'CCDC', '', ''],
    ['3164559', 'Lê Văn Du',      'Ca 2: 14h-22h', 'Bùi Hoàng Anh', 'Đang làm việc', 'CCDC', '', ''],
    // Anh thêm nhân viên vào đây hoặc copy từ Google Sheets
];
const wsNhanVien = XLSX.utils.aoa_to_sheet(nhanVienData);
wsNhanVien['!cols'] = [
    {wch:12},{wch:25},{wch:18},{wch:20},{wch:16},{wch:12},{wch:12},{wch:15}
];
XLSX.utils.book_append_sheet(wb, wsNhanVien, 'Nhân viên');

// ============================================================
// SHEET 3: CCDC_Giao
// ============================================================
const ccdcGiaoData = [
    ['Thời Gian', 'MSNV', 'Họ Tên', 'Ca', 'Quản Lý', 'Mã Thiết Bị', 'Tên Thiết Bị',
     'Đã Thu Hồi', 'Thu Hồi Lúc', 'Tình Trạng', 'Ghi Chú', 'Người Thao Tác', 'Thời Gian Nhắc', 'Tắt Cảnh Báo'],
    // Dữ liệu sẽ được tự động thêm vào đây khi dùng hệ thống
];
const wsCcdcGiao = XLSX.utils.aoa_to_sheet(ccdcGiaoData);
wsCcdcGiao['!cols'] = [
    {wch:20},{wch:12},{wch:25},{wch:18},{wch:20},{wch:15},{wch:25},
    {wch:12},{wch:20},{wch:14},{wch:30},{wch:15},{wch:20},{wch:14}
];
XLSX.utils.book_append_sheet(wb, wsCcdcGiao, 'CCDC_Giao');

// ============================================================
// SHEET 4: CCDC_Nhan
// ============================================================
const ccdcNhanData = [
    ['Thời Gian', 'MSNV', 'Họ Tên', 'Mã Thiết Bị', 'Tình Trạng', 'Ghi Chú', 'Người Thao Tác'],
];
const wsCcdcNhan = XLSX.utils.aoa_to_sheet(ccdcNhanData);
wsCcdcNhan['!cols'] = [
    {wch:20},{wch:12},{wch:25},{wch:15},{wch:14},{wch:30},{wch:15}
];
XLSX.utils.book_append_sheet(wb, wsCcdcNhan, 'CCDC_Nhan');

// ============================================================
// GHI FILE
// ============================================================
XLSX.writeFile(wb, OUTPUT);
console.log('');
console.log('✅ Đã tạo file Excel template:');
console.log('   📁 ' + OUTPUT);
console.log('');
console.log('📋 Cấu trúc:');
console.log('   Sheet 1: Tài khoản    — Quản lý user đăng nhập');
console.log('   Sheet 2: Nhân viên    — Database nhân viên CCDC');
console.log('   Sheet 3: CCDC_Giao   — Lịch sử giao thiết bị');
console.log('   Sheet 4: CCDC_Nhan   — Lịch sử thu hồi thiết bị');
console.log('');
console.log('👉 Anh có thể mở file, thêm nhân viên vào Sheet "Nhân viên"');
console.log('   rồi lưu lại — server sẽ tự reload trong vòng 1 giây!');
console.log('');
