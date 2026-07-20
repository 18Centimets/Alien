const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("🚀 Bắt đầu quá trình Import Dữ Liệu Thật vào V2...");

function parseCSV(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    if(lines.length === 0) return [];
    // Bỏ qua dòng tiêu đề
    return lines.slice(1).map(line => line.split(',').map(item => item.trim()));
}

// 1. Nhập Nhân Viên
const empFile = path.join(__dirname, 'real_employees.csv');
if (fs.existsSync(empFile)) {
    const data = fs.readFileSync(empFile, 'utf8');
    const rows = parseCSV(data);
    let count = 0;
    
    db.serialize(() => {
        const stmt = db.prepare("INSERT OR REPLACE INTO employees (msnv, hoten, ca, quanly) VALUES (?, ?, ?, ?)");
        rows.forEach(row => {
            if(row.length >= 4) {
                stmt.run(row[0], row[1], row[2], row[3]);
                count++;
            }
        });
        stmt.finalize();
        console.log(`✅ Đã import thành công ${count} Nhân Viên vào Database.`);
    });
} else {
    console.log("⚠️ Không tìm thấy file real_employees.csv. Bỏ qua import Nhân Viên.");
    // Tạo file mẫu
    fs.writeFileSync(empFile, "Mã NV,Họ Tên,Ca,Quản Lý\nNV123,Nguyễn Văn Thật,CA1,QL_Test");
    console.log("👉 Đã tạo file mẫu real_employees.csv. Hãy dán dữ liệu thật của bạn vào file này.");
}

// 2. Nhập Thiết Bị (Assets)
const assetFile = path.join(__dirname, 'real_assets.csv');
if (fs.existsSync(assetFile)) {
    const data = fs.readFileSync(assetFile, 'utf8');
    const rows = parseCSV(data);
    let count = 0;
    
    db.serialize(() => {
        const stmt = db.prepare("INSERT OR REPLACE INTO assets (qr_code, type, name, status) VALUES (?, ?, ?, ?)");
        rows.forEach(row => {
            if(row.length >= 3) {
                // Mặc định type='PDA', status='Normal' nếu file CSV chỉ có 2 cột (Mã QR, Tên)
                stmt.run(row[0], 'PDA', row[1], 'Normal');
                count++;
            }
        });
        stmt.finalize();
        console.log(`✅ Đã import thành công ${count} Thiết Bị vào Database.`);
    });
} else {
    console.log("⚠️ Không tìm thấy file real_assets.csv. Bỏ qua import Thiết Bị.");
    // Tạo file mẫu
    fs.writeFileSync(assetFile, "Mã QR,Tên Thiết Bị\nQR999,Máy PDA Thật 01");
    console.log("👉 Đã tạo file mẫu real_assets.csv. Hãy dán dữ liệu thật của bạn vào file này.");
}

setTimeout(() => {
    console.log("🎉 Hoàn tất! Bạn có thể khởi động lại Server và test thật.");
    db.close();
}, 2000);
