/**
 * seed_real.js
 * Bơm dữ liệu THẬT từ Google Sheet vào Database V2 (SQLite)
 * Nguồn: Sheet CCDC_Giao
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// =========================================================
// DỮ LIỆU NHÂN VIÊN THẬT (lấy từ sheet CCDC_Giao)
// =========================================================
const realEmployees = [
    { msnv: '3006216', hoten: 'Nguyễn Văn Bảo',    ca: 'Ca 1: 08h - 18h', quanly: 'Nguyễn Văn Bảo' },
    { msnv: '3146126', hoten: 'Nguyễn Thị Trang',   ca: 'Ca 3: 21h - 07h', quanly: 'Thái Văn Cường'  },
    { msnv: '3157749', hoten: 'Bùi Cao Nghĩa',      ca: 'Ca 1: 08h - 18h', quanly: 'Bùi Hoàng Anh'  },
    { msnv: '3164559', hoten: 'Lê Văn Du',          ca: 'Ca 1: 08h - 18h', quanly: 'Bùi Hoàng Anh'  },
    { msnv: '3159370', hoten: 'Bùi Viết Hào',       ca: 'Ca 1: 08h - 18h', quanly: 'Bùi Hoàng Anh'  },
    { msnv: '3148017', hoten: 'Hàn Văn Tiến',       ca: 'Ca 1: 08h - 18h', quanly: 'Hứa Trần Tiến'  },
    { msnv: '3138231', hoten: 'Nhân Viên 3138231',  ca: 'Ca 2: 14h - 22h', quanly: 'N/A'             },
    { msnv: '3122297', hoten: 'Nhân Viên 3122297',  ca: 'Ca 2: 14h - 22h', quanly: 'N/A'             },
    // Giữ lại tài khoản admin/test
    { msnv: 'ADMIN001', hoten: 'Quản Trị Admin',   ca: 'Hành Chính',      quanly: 'System'           },
];

// =========================================================
// DỮ LIỆU THIẾT BỊ THẬT (lấy từ sheet CCDC_Giao)
// =========================================================
const realAssets = [
    { qr_code: '1',  type: 'BARCODE_GUN', name: 'Súng Barcode #1',    status: 'Normal' },
    { qr_code: '12', type: 'PDA',         name: 'PDA #12',            status: 'Normal' },
    { qr_code: '35', type: 'PDA',         name: 'PDA #35',            status: 'Normal' },
    { qr_code: '36', type: 'PDA',         name: 'PDA #36',            status: 'Normal' },
    { qr_code: '37', type: 'FORKLIFT',    name: 'Xe Nâng #37',        status: 'Normal' },
];

// =========================================================
// LỊCH SỬ GIAO NHẬN THẬT (từ sheet CCDC_Giao)
// =========================================================
const realTransactions = [
    { asset_qr: '36', msnv: '3146126', action: 'BORROW', timestamp: '2026-06-13 11:15:34', returned: 1, return_time: '2026-06-13 11:39:12', lifecycle_status: 'Cần sạc pin',  note: 'Ca này phát hiện gãy kính cường lực' },
    { asset_qr: '37', msnv: '3157749', action: 'BORROW', timestamp: '2026-06-13 11:24:11', returned: 0, return_time: null,                  lifecycle_status: null,          note: 'Pin dưới 30%' },
    { asset_qr: '37', msnv: '3164559', action: 'BORROW', timestamp: '2026-06-13 11:26:05', returned: 0, return_time: null,                  lifecycle_status: null,          note: 'Hỏng Kính' },
    { asset_qr: '35', msnv: '3159370', action: 'BORROW', timestamp: '2026-06-13 11:38:22', returned: 0, return_time: null,                  lifecycle_status: null,          note: 'Hỏng chân sạc' },
    { asset_qr: '1',  msnv: '3006216', action: 'BORROW', timestamp: '2026-06-14 11:02:51', returned: 1, return_time: '2026-06-15 08:37:03', lifecycle_status: 'Cần sạc pin',  note: 'Ca này phát hiện gãy kính cường lực' },
    { asset_qr: '12', msnv: '3006216', action: 'BORROW', timestamp: '2026-06-17 14:28:51', returned: 0, return_time: null,                  lifecycle_status: null,          note: '' },
];

console.log('🚀 Bắt đầu bơm dữ liệu THẬT vào Database V2...\n');

db.serialize(() => {
    // 1. Xóa dữ liệu giả lập cũ
    db.run("DELETE FROM transactions");
    db.run("DELETE FROM assets");
    db.run("DELETE FROM employees");
    console.log('🗑️  Đã xóa dữ liệu giả lập cũ.\n');

    // 2. Nhập nhân viên thật
    const empStmt = db.prepare("INSERT OR REPLACE INTO employees (msnv, hoten, ca, quanly) VALUES (?, ?, ?, ?)");
    realEmployees.forEach(e => empStmt.run(e.msnv, e.hoten, e.ca, e.quanly));
    empStmt.finalize();
    console.log(`✅ Đã nhập ${realEmployees.length} nhân viên thật.`);

    // 3. Nhập thiết bị thật
    const assetStmt = db.prepare("INSERT OR REPLACE INTO assets (qr_code, type, name, status) VALUES (?, ?, ?, ?)");
    realAssets.forEach(a => assetStmt.run(a.qr_code, a.type, a.name, a.status));
    assetStmt.finalize();
    console.log(`✅ Đã nhập ${realAssets.length} thiết bị thật.`);

    // 4. Nhập lịch sử giao nhận thật
    const txStmt = db.prepare(`
        INSERT INTO transactions (asset_qr, msnv, action, timestamp, returned, return_time, lifecycle_status, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    realTransactions.forEach(t => txStmt.run(t.asset_qr, t.msnv, t.action, t.timestamp, t.returned, t.return_time, t.lifecycle_status, t.note));
    txStmt.finalize();
    console.log(`✅ Đã nhập ${realTransactions.length} bản ghi giao/nhận thật.\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 HOÀN TẤT! Database V2 đã có dữ liệu thật.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Các mã NV có thể scan TEST ngay:');
    realEmployees.forEach(e => console.log(`   • ${e.msnv}  →  ${e.hoten}`));
    console.log('\n📦 Các mã Thiết Bị có thể scan TEST ngay:');
    realAssets.forEach(a => console.log(`   • ${a.qr_code}  →  ${a.name}`));
    console.log('\n👉 Chạy "node server.js" để khởi động lại Server và test thật!');
});

setTimeout(() => db.close(), 1500);
