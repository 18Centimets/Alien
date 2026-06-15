require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

app.get('/', (req, res) => {
    res.send('<h1>🚀 Máy chủ Backend (Node.js) của GHN Dashboard V2 đang hoạt động ổn định!</h1><p>Vui lòng gọi các đường dẫn API hợp lệ như /api/employees</p>');
});

// ==========================================
// TELEGRAM ALERT (CRON JOB)
// ==========================================
// Tạm thời log ra console nếu chưa có Token
const botToken = process.env.TELEGRAM_BOT_TOKEN || 'MOCK_TOKEN';
const chatId = process.env.TELEGRAM_CHAT_ID || 'MOCK_CHAT_ID';

async function sendTelegramAlert(message) {
    if (botToken === 'MOCK_TOKEN') {
        console.log("🔔 [TELEGRAM MOCK ALERT]:\n" + message);
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message })
        });
    } catch (e) {
        console.error("Lỗi gửi Telegram:", e);
    }
}

// Chạy cron 10 phút một lần
cron.schedule('*/10 * * * *', () => {
    console.log("Trình quét tự động: Đang kiểm tra thiết bị quá hạn...");
    const query = `
        SELECT t.id, t.msnv, e.hoten, t.asset_qr, a.name, t.timestamp
        FROM transactions t
        JOIN employees e ON t.msnv = e.msnv
        JOIN assets a ON t.asset_qr = a.qr_code
        WHERE t.action = 'BORROW' 
        AND t.returned = 0 
        AND t.timestamp < datetime('now', '-12 hours')
    `;
    db.all(query, [], (err, rows) => {
        if (err) return console.error(err);
        if (rows.length > 0) {
            let msg = `🚨 CẢNH BÁO TÀI SẢN QUÁ HẠN CA LÀM VIỆC (>12h) 🚨\n\n`;
            rows.forEach(r => {
                msg += `- NV: ${r.msnv} (${r.hoten})\n  TB: ${r.name} (${r.asset_qr})\n  Mượn lúc: ${r.timestamp}\n\n`;
            });
            sendTelegramAlert(msg);
        }
    });
});


// ==========================================
// IAM & AUTH MIDDLEWARE MOCK
// ==========================================
// Trong thực tế sẽ verify JWT Token. Ở đây dùng mock qua Header.
function requireAuth(req, res, next) {
    const role = req.headers['x-user-role'] || 'TRUONGCA'; // Mock default
    if (role === 'THUKHO' || role === 'TRUONGCA') {
        next();
    } else {
        res.status(403).json({ status: 'error', message: 'Bạn không có quyền truy cập module CCDC. Yêu cầu quyền Thủ Kho hoặc Trưởng Ca.' });
    }
}


// ==========================================
// API ENDPOINTS
// ==========================================

// 1. Lấy danh sách NV để lưu Cache
app.get('/api/employees', (req, res) => {
    db.all("SELECT msnv, hoten, ca, quanly FROM employees", [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error' });
        res.json({ status: 'success', employees: rows });
    });
});

// 2. Tra cứu 1 nhân viên
app.get('/api/employee/:msnv', (req, res) => {
    const msnv = req.params.msnv;
    db.get("SELECT msnv, hoten, ca, quanly FROM employees WHERE msnv = ?", [msnv], (err, row) => {
        if (err || !row) return res.json({ status: 'not_found' });
        res.json({ status: 'found', msnv: row.msnv, hoten: row.hoten, ca: row.ca, quanly: row.quanly });
    });
});

// 3. Tra cứu tài sản đang mượn của 1 NV
app.get('/api/borrowed/:msnv', (req, res) => {
    const msnv = req.params.msnv;
    db.get("SELECT msnv, hoten, ca, quanly FROM employees WHERE msnv = ?", [msnv], (err, emp) => {
        if (err || !emp) return res.json({ status: 'not_found' });

        const q = `
            SELECT t.id as row_index, t.asset_qr as ma_thiet_bi, a.name as ten_thiet_bi, t.timestamp as thoi_gian_giao
            FROM transactions t
            JOIN assets a ON t.asset_qr = a.qr_code
            WHERE t.msnv = ? AND t.action = 'BORROW' AND t.returned = 0
        `;
        db.all(q, [msnv], (err, rows) => {
            if (err) return res.status(500).json({ status: 'error' });
            if (rows.length > 0) {
                res.json({ status: 'has_borrow', borrowed: rows });
            } else {
                res.json({ status: 'no_borrow', emp: emp });
            }
        });
    });
});

// 4. Submit Giao (Dual QR Scan)
app.post('/api/giao', requireAuth, (req, res) => {
    const { msnv, asset_qr, note, operator } = req.body;
    
    // Kiểm tra thiết bị
    db.get("SELECT status, name FROM assets WHERE qr_code = ?", [asset_qr], (err, asset) => {
        if (!asset) return res.json({ status: 'error', message: 'Không tìm thấy thiết bị này trong hệ thống.' });
        if (asset.status === 'BROKEN' || asset.status === 'WARRANTY') {
            return res.json({ status: 'error', message: `Thiết bị đang ở trạng thái ${asset.status}. Không thể giao!` });
        }

        db.get("SELECT id FROM transactions WHERE asset_qr = ? AND action = 'BORROW' AND returned = 0", [asset_qr], (err, tx) => {
            if (tx) return res.json({ status: 'error', message: 'Thiết bị này đang được người khác mượn chưa trả.' });

            db.run("INSERT INTO transactions (asset_qr, msnv, action, returned, note, operator) VALUES (?, ?, 'BORROW', 0, ?, ?)",
                [asset_qr, msnv, note || '', operator || 'Unknown'], function(err) {
                    if (err) return res.status(500).json({ status: 'error' });
                    res.json({ status: 'success', message: 'Giao thiết bị thành công' });
            });
        });
    });
});

// 5. Submit Nhận (Thu hồi)
app.post('/api/nhan', requireAuth, (req, res) => {
    const { msnv, asset_qr, status, note, row_index, operator } = req.body;
    
    db.run("UPDATE transactions SET returned = 1 WHERE id = ?", [row_index], (err) => {
        if (err) return res.status(500).json({ status: 'error' });

        let assetStatus = 'NORMAL';
        if (status === 'Lỗi/Hư hỏng') assetStatus = 'BROKEN';
        if (status === 'Báo Mất') assetStatus = 'LOST';

        db.run("UPDATE assets SET status = ? WHERE qr_code = ?", [assetStatus, asset_qr], (err) => {
            db.run("INSERT INTO transactions (asset_qr, msnv, action, returned, note, operator) VALUES (?, ?, 'RETURN', 1, ?, ?)",
                [asset_qr, msnv, note || '', operator || 'Unknown'], function(err) {
                    res.json({ status: 'success' });
            });
        });
    });
});

// 6. Lấy lịch sử giao dịch gần đây
app.get('/api/recent', (req, res) => {
    const q = `
        SELECT 
            t.timestamp, t.msnv, e.hoten, 
            t.asset_qr as ma_thiet_bi, a.name as ten_thiet_bi, 
            t.returned as da_thu_hoi, t.operator as nguoi_thao_tac
        FROM transactions t
        LEFT JOIN employees e ON t.msnv = e.msnv
        LEFT JOIN assets a ON t.asset_qr = a.qr_code
        WHERE t.action = 'BORROW'
        ORDER BY t.timestamp DESC 
        LIMIT 50
    `;
    db.all(q, [], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error' });
        res.json({ status: 'success', log: rows });
    });
});

const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
    console.log(`🚀 Server V2 running on port ${PORT}`);
    console.log(`Database: SQLite (database.sqlite)`);
});
