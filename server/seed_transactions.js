const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const employees = [
    'NV001', 'NV002', 'NV003', 'NV004', 'NV005',
    'NV006', 'NV007', 'NV008', 'NV009', 'NV010'
];

const assets = [
    'ASSET001', 'ASSET002', 'ASSET003', 'ASSET004', 'ASSET005',
    'ASSET006', 'ASSET007', 'ASSET008', 'ASSET009', 'ASSET010',
    'ASSET011', 'ASSET012', 'ASSET013', 'ASSET014', 'ASSET015',
    'ASSET016', 'ASSET017', 'ASSET018', 'ASSET019', 'ASSET020'
];

db.serialize(() => {
    const stmt = db.prepare(`INSERT INTO transactions (asset_qr, msnv, action, timestamp, returned, note, operator) VALUES (?, ?, ?, ?, ?, ?, ?)`);

    const now = new Date();
    
    // 10 Giao đã Nhận (Lịch sử hoàn tất)
    for (let i = 0; i < 10; i++) {
        let giaoTime = new Date(now.getTime() - (10 - i) * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
        let nhanTime = new Date(now.getTime() - (10 - i - 0.5) * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
        
        // Dòng GIAO
        stmt.run(assets[i], employees[i], 'GIAO', giaoTime, 1, 'Cấp phát đầu ca', 'THUKHO - Nguyễn Văn Admin');
        // Dòng NHẬN
        stmt.run(assets[i], employees[i], 'NHAN', nhanTime, 1, 'Trạng thái: Bình thường', 'THUKHO - Nguyễn Văn Admin');
    }

    // 10 Giao chưa Nhận (Để test thu hồi)
    for (let i = 10; i < 20; i++) {
        let giaoTime = new Date(now.getTime() - (20 - i) * 30 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
        
        // Dòng GIAO
        stmt.run(assets[i], employees[i % 10], 'GIAO', giaoTime, 0, 'Cấp phát bổ sung', 'THUKHO - Nguyễn Văn Admin');
    }

    stmt.finalize();
    console.log("Đã tạo 10 lịch sử hoàn tất (Giao+Nhận) và 10 lịch sử Đang mượn (Giao).");
});

db.close();
