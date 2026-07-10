require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Serve static files từ thư mục gốc project (index.html, app.js, index.css)
app.use(express.static(path.join(__dirname, '..')));

// =============================================
// DATA STORAGE — JSON files (thay thế Google Sheets)
// =============================================
const DATA_DIR = path.join(__dirname, 'offline_data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function readJson(filename) {
    const file = path.join(DATA_DIR, filename);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJson(filename, data) {
    const file = path.join(DATA_DIR, filename);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// =============================================
// INIT DATA — Tạo dữ liệu mẫu nếu chưa có
// =============================================
function initData() {
    // Tài khoản mặc định
    if (!fs.existsSync(path.join(DATA_DIR, 'users.json'))) {
        writeJson('users.json', [
            {
                msnv: 'BOSS001', password: 'QNhi@6789!', role: 'admin',
                fullname: 'Super Admin', status: 'Đã duyệt',
                permissions: 'overview,post-offices,trends,materials,forklifts,infra-health,purchases,transport-map,ccdc-device,ccdc-report,user-management'
            },
            {
                msnv: 'NV001', password: '123456', role: 'user',
                fullname: 'Nhân Viên Test', status: 'Đã duyệt',
                permissions: 'overview,ccdc-device,ccdc-report'
            }
        ]);
        console.log('✅ Tạo users.json mẫu');
    }

    // Sessions
    if (!fs.existsSync(path.join(DATA_DIR, 'sessions.json'))) {
        writeJson('sessions.json', {});
        console.log('✅ Tạo sessions.json');
    }

    // CCDC logs
    if (!fs.existsSync(path.join(DATA_DIR, 'ccdc_giao.json'))) {
        writeJson('ccdc_giao.json', []);
        console.log('✅ Tạo ccdc_giao.json');
    }
    if (!fs.existsSync(path.join(DATA_DIR, 'ccdc_nhan.json'))) {
        writeJson('ccdc_nhan.json', []);
        console.log('✅ Tạo ccdc_nhan.json');
    }
}

// =============================================
// AUTH HELPERS
// =============================================
function generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({length: 32}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function validateSession(token) {
    if (!token || token.length < 10) return null;
    const sessions = readJson('sessions.json');
    const sess = sessions[token];
    if (!sess) return null;
    if (Date.now() > sess.expiry) {
        delete sessions[token];
        writeJson('sessions.json', sessions);
        return null;
    }
    return sess;
}

// =============================================
// API ROUTES — Giả lập Google Apps Script
// =============================================
app.get('/api', (req, res) => {
    const { action } = req.query;

    // --- LOGIN ---
    if (action === 'login') {
        const { msnv, password } = req.query;
        const users = readJson('users.json');
        const user = users.find(u => u.msnv === msnv && u.password === password);

        if (!user) return res.json({ status: 'error', message: 'Sai MSNV hoặc mật khẩu!' });
        if (user.status !== 'Đã duyệt') return res.json({ status: 'error', message: 'Tài khoản bị khóa!' });

        const token = generateToken();
        const sessions = readJson('sessions.json');
        sessions[token] = { msnv: user.msnv, role: user.role, fullname: user.fullname, expiry: Date.now() + 8 * 60 * 60 * 1000 };
        writeJson('sessions.json', sessions);

        return res.json({
            status: 'bypass_otp', msnv: user.msnv, role: user.role,
            fullname: user.fullname, session_token: token,
            permissions: user.permissions,
            message: 'Đăng nhập thành công!'
        });
    }

    // --- VERIFY SESSION ---
    if (action === 'verify_session') {
        const sess = validateSession(req.query.token);
        if (!sess) return res.json({ status: 'unauthorized', message: 'Phiên đăng nhập hết hạn.' });
        return res.json({ status: 'success', ...sess });
    }

    // --- LOGOUT ---
    if (action === 'logout') {
        const sessions = readJson('sessions.json');
        delete sessions[req.query.token];
        writeJson('sessions.json', sessions);
        return res.json({ status: 'success', message: 'Đã đăng xuất.' });
    }

    // --- GET USERS ---
    if (action === 'get_users') {
        const sess = validateSession(req.query.token);
        if (!sess || sess.role !== 'admin') return res.json({ status: 'unauthorized', message: 'Không có quyền.' });
        const users = readJson('users.json').map(u => ({ ...u, password: '***' }));
        return res.json({ status: 'success', users });
    }

    // --- GET EMPLOYEES ---
    if (action === 'get_employees') {
        const employees = readJson('employees.json');
        return res.json({ status: 'success', employees });
    }

    // --- LOOKUP EMPLOYEE ---
    if (action === 'lookup_employee') {
        const { msnv } = req.query;
        const employees = readJson('employees.json');
        const emp = employees.find(e => e.msnv === msnv);
        if (!emp) return res.json({ status: 'not_found', message: 'Không tìm thấy mã NV: ' + msnv });
        return res.json({ status: 'found', ...emp });
    }

    // --- CCDC GET ALL LOGS (Giao) ---
    if (action === 'ccdc_get_all_logs') {
        const logs = readJson('ccdc_giao.json');
        return res.json({ status: 'success', log: logs.slice().reverse() });
    }

    // --- CCDC SUBMIT GIAO ---
    if (action === 'ccdc_submit_giao') {
        const { msnv, hoten, ca, quanly, ma_thiet_bi, ten_thiet_bi, ghi_chu, nguoi_thao_tac } = req.query;
        if (!msnv || !ma_thiet_bi || !ten_thiet_bi) {
            return res.json({ status: 'error', message: 'Thiếu thông tin bắt buộc!' });
        }
        const logs = readJson('ccdc_giao.json');
        const now = new Date();
        const ts = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const newLog = {
            row_index: logs.length + 1,
            timestamp: ts, msnv, hoten, ca, quanly,
            ma_thiet_bi, ten_thiet_bi,
            da_thu_hoi: false, thu_hoi_luc: '',
            tinh_trang: '', ghi_chu: ghi_chu || '',
            nguoi_thao_tac: nguoi_thao_tac || '',
            tat_canh_bao: false
        };
        logs.push(newLog);
        writeJson('ccdc_giao.json', logs);
        return res.json({ status: 'success', message: 'Giao thiết bị thành công!' });
    }

    // --- CCDC GET ALL NHAN LOGS ---
    if (action === 'ccdc_get_all_logs_nhan') {
        const logs = readJson('ccdc_nhan.json');
        return res.json({ status: 'success', log: logs.slice().reverse() });
    }

    // --- MUTE ALERT ---
    if (action === 'mute_alert') {
        const rowIndex = parseInt(req.query.row_index || '0');
        const logs = readJson('ccdc_giao.json');
        if (rowIndex < 1 || rowIndex > logs.length) {
            return res.json({ status: 'error', message: 'Row index không hợp lệ!' });
        }
        logs[rowIndex - 1].tat_canh_bao = true;
        writeJson('ccdc_giao.json', logs);
        return res.json({ status: 'success', message: 'Đã tắt cảnh báo!' });
    }

    // --- AI CHAT (Offline mock) ---
    if (action === 'chat') {
        const message = req.query.message || '';
        return res.json({
            status: 'success',
            reply: `[OFFLINE MODE] Nhận được: "${message}". AI Chat cần kết nối Gemini API — tính năng này hoạt động đầy đủ khi online.`
        });
    }

    return res.json({ status: 'error', message: 'Invalid action: ' + action });
});

// =============================================
// START
// =============================================
initData();
app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║   GHN Dashboard — OFFLINE DEV SERVER   ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║   URL: http://localhost:${PORT}           ║`);
    console.log('║   Branch: dev (KHÔNG sync với main)    ║');
    console.log('║   Dữ liệu: server/offline_data/*.json  ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
});
