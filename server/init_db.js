const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');

// Xóa DB cũ nếu có để khởi tạo lại từ đầu
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
}

const db = new sqlite3.Database(dbPath);

const allocRaw = fs.readFileSync(path.join(__dirname, 'allocations_raw.txt'), 'utf8');
const infraRaw = fs.readFileSync(path.join(__dirname, 'infra_health_raw.txt'), 'utf8');

// Hàm xử lý CSV text (bỏ qua Header của tool nội bộ)
function parseCSV(rawText) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
    // Tìm dòng header thực sự của CSV
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('---')) {
            startIndex = i + 1;
            break;
        }
    }
    const csvLines = lines.slice(startIndex).filter(l => l.length > 5);
    return csvLines;
}

db.serialize(() => {
    // 1. Create Tables
    db.run(`CREATE TABLE allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        postOffice TEXT,
        item TEXT,
        quantity INTEGER,
        unit TEXT,
        location TEXT,
        issuer TEXT
    )`);

    db.run(`CREATE TABLE infra_health (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        group_name TEXT,
        item TEXT,
        status TEXT,
        description TEXT,
        action TEXT,
        inspector TEXT
    )`);

    db.run(`CREATE TABLE employees (
        msnv TEXT PRIMARY KEY,
        hoten TEXT,
        ca TEXT,
        quanly TEXT,
        role TEXT
    )`);

    db.run(`CREATE TABLE assets (
        qr_code TEXT PRIMARY KEY,
        type TEXT,
        name TEXT,
        status TEXT
    )`);

    db.run(`CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_qr TEXT,
        msnv TEXT,
        action TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        returned BOOLEAN DEFAULT 0,
        note TEXT,
        operator TEXT,
        FOREIGN KEY(asset_qr) REFERENCES assets(qr_code),
        FOREIGN KEY(msnv) REFERENCES employees(msnv)
    )`);

    console.log("Tables created successfully.");

    // 2. Seed Allocations
    const allocLines = parseCSV(allocRaw).slice(1); // Bỏ qua header
    const stmtAlloc = db.prepare("INSERT INTO allocations (date, postOffice, item, quantity, unit, location, issuer) VALUES (?, ?, ?, ?, ?, ?, ?)");
    allocLines.forEach(line => {
        // Simple CSV split (not handling quotes perfectly, but sufficient for this specific data)
        const parts = line.split(',');
        if (parts.length >= 7) {
            stmtAlloc.run(parts[0], parts[1], parts[2], parseInt(parts[3]) || 0, parts[4], parts[5], parts[6]);
        }
    });
    stmtAlloc.finalize();
    console.log(`Seeded ${allocLines.length} allocations.`);

    // 3. Seed Infra Health
    const infraLines = parseCSV(infraRaw).slice(1); // Bỏ qua header
    const stmtInfra = db.prepare("INSERT INTO infra_health (date, group_name, item, status, description, action, inspector) VALUES (?, ?, ?, ?, ?, ?, ?)");
    infraLines.forEach(line => {
        const parts = line.split(',');
        if (parts.length >= 7) {
            stmtInfra.run(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6]);
        }
    });
    stmtInfra.finalize();
    console.log(`Seeded ${infraLines.length} infra health records.`);

    // 4. Seed Employees
    const stmtEmp = db.prepare("INSERT INTO employees (msnv, hoten, ca, quanly, role) VALUES (?, ?, ?, ?, ?)");
    const mockEmps = [
        ['BOSS001', 'Quản Trị Viên', 'Hành chính', 'BOD', 'TRUONGCA'],
        ['NV001', 'Nguyễn Văn Bảo', 'Ca 1', 'Lê Trưởng Ca', 'NHANVIEN'],
        ['NV002', 'Trần Thị Trang', 'Ca 1', 'Lê Trưởng Ca', 'NHANVIEN'],
        ['NV003', 'Lê Văn Lương', 'Ca 2', 'Phạm Trưởng Ca', 'THUKHO'],
        ['NV004', 'Hoàng Minh Tuấn', 'Ca 2', 'Phạm Trưởng Ca', 'NHANVIEN'],
        ['NV005', 'Phạm Trưởng Ca', 'Ca 2', 'BOD', 'TRUONGCA']
    ];
    mockEmps.forEach(emp => stmtEmp.run(emp[0], emp[1], emp[2], emp[3], emp[4]));
    stmtEmp.finalize();
    console.log("Seeded mock employees.");

    // 5. Seed Assets
    const stmtAsset = db.prepare("INSERT INTO assets (qr_code, type, name, status) VALUES (?, ?, ?, ?)");
    const mockAssets = [
        ['ASSET001', 'Máy quét', 'Zebra TC21 - 01', 'NORMAL'],
        ['ASSET002', 'Máy quét', 'Zebra TC21 - 02', 'NORMAL'],
        ['ASSET003', 'Máy quét', 'Zebra TC21 - 03', 'WARRANTY'],
        ['ASSET004', 'Xe nâng', 'Xe nâng tay Toyota - 01', 'NORMAL'],
        ['ASSET005', 'Xe nâng', 'Xe nâng điện Komatsu', 'BROKEN']
    ];
    mockAssets.forEach(asset => stmtAsset.run(asset[0], asset[1], asset[2], asset[3]));
    stmtAsset.finalize();
    console.log("Seeded mock assets.");

    // 6. Seed active transactions (Unreturned)
    db.run(`INSERT INTO transactions (asset_qr, msnv, action, returned, note, operator, timestamp) 
            VALUES ('ASSET001', 'NV001', 'BORROW', 0, 'Giao đầu ca', 'NV003', datetime('now', '-2 hours'))`);
    
    // Quá 12 tiếng để test Alert
    db.run(`INSERT INTO transactions (asset_qr, msnv, action, returned, note, operator, timestamp) 
            VALUES ('ASSET002', 'NV002', 'BORROW', 0, 'Quên trả hôm qua', 'NV003', datetime('now', '-15 hours'))`);

    console.log("Seeded mock transactions.");

});

db.close(() => {
    console.log("Database initialized successfully at database.sqlite");
});
