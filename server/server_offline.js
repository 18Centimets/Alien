/**
 * GHN Dashboard — Offline Dev Server
 * Database: file Excel (database_offline.xlsx) — đọc/ghi trực tiếp
 * Auto-reload khi Excel thay đổi (chokidar watch)
 */
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const XLSX     = require('xlsx');
const chokidar = require('chokidar');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app  = express();
const PORT = 3000;
const EXCEL_FILE = path.join(__dirname, '..', 'database_offline.xlsx');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ============================================================
// EXCEL CACHE — đọc 1 lần, tự reload khi file thay đổi
// ============================================================
let DB = {};

function loadExcel() {
    if (!fs.existsSync(EXCEL_FILE)) {
        console.warn('⚠️  Chưa có file database_offline.xlsx. Chạy: node server/create_excel_template.js');
        DB = { users: [], employees: [], ccdcGiao: [], ccdcNhan: [] };
        return;
    }
    try {
        const wb = XLSX.readFile(EXCEL_FILE);

        const sheetToJson = (name, headerRow = 1) => {
            const ws = wb.Sheets[name];
            if (!ws) return [];
            return XLSX.utils.sheet_to_json(ws, { defval: '' });
        };

        // --- Tài khoản ---
        DB.users = sheetToJson('Tài khoản').map(r => ({
            msnv:        String(r['MSNV']        || '').trim(),
            password:    String(r['Mật Khẩu']    || '').trim(),
            fullname:    String(r['Họ Tên']       || '').trim(),
            role:        String(r['Vai Trò']      || 'user').trim(),
            status:      String(r['Trạng Thái']   || '').trim(),
            permissions: String(r['Quyền Hạn']    || '').trim(),
            failCount:   Number(r['Số Lần Sai']   || 0),
            lockUntil:   String(r['Khóa Đến']     || '').trim(),
        })).filter(u => u.msnv);

        // --- Nhân viên ---
        DB.employees = sheetToJson('Nhân viên').map(r => ({
            msnv:    String(r['MSNV']          || '').trim(),
            hoten:   String(r['Họ Tên']        || '').trim(),
            ca:      String(r['Ca Làm Việc']   || '').trim(),
            quanly:  String(r['Quản Lý']       || '').trim(),
            status:  String(r['Trạng Thái']    || '').trim(),
            bophan:  String(r['Bộ Phận']       || '').trim(),
            sdt:     String(r['SĐT']           || '').trim(),
            tgid:    String(r['Telegram ID']   || '').trim(),
        })).filter(e => e.msnv);

        // --- CCDC_Giao ---
        DB.ccdcGiao = sheetToJson('CCDC_Giao').map((r, i) => ({
            row_index:      i + 2, // bắt đầu từ dòng 2 (dòng 1 là header)
            timestamp:      String(r['Thời Gian']      || '').trim(),
            msnv:           String(r['MSNV']           || '').trim(),
            hoten:          String(r['Họ Tên']         || '').trim(),
            ca:             String(r['Ca']             || '').trim(),
            quanly:         String(r['Quản Lý']        || '').trim(),
            ma_thiet_bi:    String(r['Mã Thiết Bị']    || '').trim(),
            ten_thiet_bi:   String(r['Tên Thiết Bị']   || '').trim(),
            da_thu_hoi:     String(r['Đã Thu Hồi']     || 'false').toLowerCase() === 'true',
            thu_hoi_luc:    String(r['Thu Hồi Lúc']    || '').trim(),
            tinh_trang:     String(r['Tình Trạng']     || '').trim(),
            ghi_chu:        String(r['Ghi Chú']        || '').trim(),
            nguoi_thao_tac: String(r['Người Thao Tác'] || '').trim(),
            tat_canh_bao:   String(r['Tắt Cảnh Báo']  || 'false').toLowerCase() === 'true',
        })).filter(r => r.msnv);

        // --- CCDC_Nhan ---
        DB.ccdcNhan = sheetToJson('CCDC_Nhan').map((r, i) => ({
            row_index:      i + 2,
            timestamp:      String(r['Thời Gian']      || '').trim(),
            msnv:           String(r['MSNV']           || '').trim(),
            hoten:          String(r['Họ Tên']         || '').trim(),
            ma_thiet_bi:    String(r['Mã Thiết Bị']    || '').trim(),
            tinh_trang:     String(r['Tình Trạng']     || '').trim(),
            ghi_chu:        String(r['Ghi Chú']        || '').trim(),
            nguoi_thao_tac: String(r['Người Thao Tác'] || '').trim(),
        })).filter(r => r.msnv);

        console.log(`📊 Excel reloaded: ${DB.users.length} users | ${DB.employees.length} nhân viên | ${DB.ccdcGiao.length} giao | ${DB.ccdcNhan.length} thu hồi`);
    } catch (e) {
        console.error('❌ Lỗi đọc Excel:', e.message);
    }
}

function saveToExcel() {
    if (!fs.existsSync(EXCEL_FILE)) return;
    try {
        const wb = XLSX.readFile(EXCEL_FILE);

        // Ghi lại CCDC_Giao
        const giaoRows = [
            ['Thời Gian','MSNV','Họ Tên','Ca','Quản Lý','Mã Thiết Bị','Tên Thiết Bị',
             'Đã Thu Hồi','Thu Hồi Lúc','Tình Trạng','Ghi Chú','Người Thao Tác','Thời Gian Nhắc','Tắt Cảnh Báo'],
            ...DB.ccdcGiao.map(r => [
                r.timestamp, r.msnv, r.hoten, r.ca, r.quanly,
                r.ma_thiet_bi, r.ten_thiet_bi, r.da_thu_hoi ? 'true' : 'false',
                r.thu_hoi_luc, r.tinh_trang, r.ghi_chu, r.nguoi_thao_tac, '', r.tat_canh_bao ? 'true' : 'false'
            ])
        ];
        wb.Sheets['CCDC_Giao'] = XLSX.utils.aoa_to_sheet(giaoRows);

        // Ghi lại CCDC_Nhan
        const nhanRows = [
            ['Thời Gian','MSNV','Họ Tên','Mã Thiết Bị','Tình Trạng','Ghi Chú','Người Thao Tác'],
            ...DB.ccdcNhan.map(r => [
                r.timestamp, r.msnv, r.hoten, r.ma_thiet_bi,
                r.tinh_trang, r.ghi_chu, r.nguoi_thao_tac
            ])
        ];
        wb.Sheets['CCDC_Nhan'] = XLSX.utils.aoa_to_sheet(nhanRows);

        // Ghi lại Tài khoản (để sync fail count, lock)
        const userRows = [
            ['MSNV','Mật Khẩu','Họ Tên','Vai Trò','Trạng Thái','Quyền Hạn','Số Lần Sai','Khóa Đến'],
            ...DB.users.map(u => [u.msnv, u.password, u.fullname, u.role, u.status, u.permissions, u.failCount, u.lockUntil])
        ];
        wb.Sheets['Tài khoản'] = XLSX.utils.aoa_to_sheet(userRows);

        XLSX.writeFile(wb, EXCEL_FILE);
    } catch (e) {
        console.error('❌ Lỗi ghi Excel:', e.message);
    }
}

// ============================================================
// AUTO RELOAD khi file Excel thay đổi bên ngoài
// ============================================================
loadExcel();
let reloadTimer = null;
chokidar.watch(EXCEL_FILE, { ignoreInitial: true }).on('change', () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
        console.log('🔄 Phát hiện Excel thay đổi — reloading...');
        loadExcel();
    }, 500);
});

// ============================================================
// AUTH HELPERS
// ============================================================
const sessions = {};

function generateToken() {
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({length: 32}, () => c[Math.floor(Math.random() * c.length)]).join('');
}

function validateSession(token) {
    if (!token || token.length < 10) return null;
    const sess = sessions[token];
    if (!sess) return null;
    if (Date.now() > sess.expiry) { delete sessions[token]; return null; }
    return sess;
}

function nowVN() {
    return new Date().toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
}

// ============================================================
// API ROUTES
// ============================================================
app.get('/api', (req, res) => {
    const { action } = req.query;

    // --- LOGIN ---
    if (action === 'login') {
        const { msnv, password } = req.query;
        const user = DB.users.find(u => u.msnv === msnv);
        if (!user) return res.json({ status: 'error', message: 'Sai MSNV hoặc mật khẩu!' });

        // Kiểm tra lock
        if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
            return res.json({ status: 'error', message: `Tài khoản đang bị khóa đến ${user.lockUntil}` });
        }

        if (user.password !== password) {
            user.failCount = (user.failCount || 0) + 1;
            if (user.failCount >= 5) {
                const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                user.lockUntil = lockUntil.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                user.failCount = 0;
                saveToExcel();
                return res.json({ status: 'error', message: 'Sai quá 5 lần — tài khoản bị khóa 15 phút!' });
            }
            saveToExcel();
            return res.json({ status: 'error', message: `Sai mật khẩu! (Lần ${user.failCount}/5)` });
        }

        if (user.status !== 'Đã duyệt') return res.json({ status: 'error', message: 'Tài khoản bị khóa!' });

        user.failCount = 0;
        user.lockUntil = '';
        saveToExcel();

        const token = generateToken();
        sessions[token] = {
            msnv: user.msnv, role: user.role, fullname: user.fullname,
            expiry: Date.now() + 8 * 60 * 60 * 1000 // 8 giờ
        };
        return res.json({
            status: 'bypass_otp', msnv: user.msnv, role: user.role,
            fullname: user.fullname, session_token: token,
            permissions: user.permissions, message: 'Đăng nhập thành công!'
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
        delete sessions[req.query.token];
        return res.json({ status: 'success' });
    }

    // --- GET USERS (admin) ---
    if (action === 'get_users') {
        const sess = validateSession(req.query.token);
        if (!sess || sess.role !== 'admin') return res.json({ status: 'unauthorized' });
        return res.json({ status: 'success', users: DB.users.map(u => ({ ...u, password: '***' })) });
    }

    // --- GET EMPLOYEES ---
    if (action === 'get_employees') {
        return res.json({ status: 'success', employees: DB.employees });
    }

    // --- LOOKUP EMPLOYEE ---
    if (action === 'lookup_employee') {
        const emp = DB.employees.find(e => e.msnv === req.query.msnv);
        if (!emp) return res.json({ status: 'not_found', message: 'Không tìm thấy mã NV: ' + req.query.msnv });
        return res.json({ status: 'found', ...emp });
    }

    // --- CCDC GET ALL LOGS ---
    if (action === 'ccdc_get_all_logs') {
        return res.json({ status: 'success', log: [...DB.ccdcGiao].reverse() });
    }

    // --- CCDC GET ALL NHAN LOGS ---
    if (action === 'ccdc_get_all_logs_nhan') {
        return res.json({ status: 'success', log: [...DB.ccdcNhan].reverse() });
    }

    // --- CCDC SUBMIT GIAO ---
    if (action === 'ccdc_submit_giao') {
        const { msnv, hoten, ca, quanly, ma_thiet_bi, ten_thiet_bi, ghi_chu, nguoi_thao_tac } = req.query;
        if (!msnv || !ma_thiet_bi || !ten_thiet_bi)
            return res.json({ status: 'error', message: 'Thiếu thông tin bắt buộc!' });

        const newRow = {
            row_index: DB.ccdcGiao.length + 2,
            timestamp: nowVN(), msnv, hoten: hoten || '', ca: ca || '',
            quanly: quanly || '', ma_thiet_bi, ten_thiet_bi,
            da_thu_hoi: false, thu_hoi_luc: '', tinh_trang: '',
            ghi_chu: ghi_chu || '', nguoi_thao_tac: nguoi_thao_tac || '',
            tat_canh_bao: false
        };
        DB.ccdcGiao.push(newRow);
        saveToExcel();
        return res.json({ status: 'success', message: 'Giao thiết bị thành công!' });
    }

    // --- CCDC SUBMIT NHAN (thu hồi) ---
    if (action === 'ccdc_submit_nhan') {
        const { msnv, ma_thiet_bi, tinh_trang, ghi_chu, nguoi_thao_tac, row_index } = req.query;
        if (!msnv || !ma_thiet_bi)
            return res.json({ status: 'error', message: 'Thiếu Mã NV hoặc Mã Thiết Bị!' });

        const now = nowVN();
        const rowIdx = parseInt(row_index || '0') - 2;
        if (rowIdx >= 0 && rowIdx < DB.ccdcGiao.length) {
            DB.ccdcGiao[rowIdx].da_thu_hoi = true;
            DB.ccdcGiao[rowIdx].thu_hoi_luc = now;
            DB.ccdcGiao[rowIdx].tinh_trang = tinh_trang || '';
        }

        const emp = DB.employees.find(e => e.msnv === msnv);
        DB.ccdcNhan.push({
            row_index: DB.ccdcNhan.length + 2,
            timestamp: now, msnv,
            hoten: emp ? emp.hoten : '',
            ma_thiet_bi, tinh_trang: tinh_trang || '',
            ghi_chu: ghi_chu || '', nguoi_thao_tac: nguoi_thao_tac || ''
        });
        saveToExcel();
        return res.json({ status: 'success', message: 'Thu hồi thiết bị thành công!' });
    }

    // --- MUTE ALERT ---
    if (action === 'mute_alert') {
        const rowIdx = parseInt(req.query.row_index || '0') - 2;
        if (rowIdx >= 0 && rowIdx < DB.ccdcGiao.length) {
            DB.ccdcGiao[rowIdx].tat_canh_bao = true;
            saveToExcel();
            return res.json({ status: 'success', message: 'Đã tắt cảnh báo!' });
        }
        return res.json({ status: 'error', message: 'Không tìm thấy bản ghi!' });
    }

    // --- AI CHAT (AI-Driven Reasoning) ---
    if (action === 'chat') {
        const msg = req.query.message || '';
        const msgLower = msg.toLowerCase();
        
        // Luồng 1: Yêu cầu phân tích/báo cáo dữ liệu kho
        if (msgLower.includes('báo cáo') || msgLower.includes('phân tích')) {
            try {
                if (!process.env.GEMINI_API_KEY) {
                    return res.json({ status: 'error', reply: 'Thiếu cấu hình GEMINI_API_KEY trong file .env' });
                }
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                
                // Trích xuất dữ liệu CCDC chưa thu hồi
                const chuaThuHoi = DB.ccdcGiao.filter(r => !r.da_thu_hoi);
                let dataToAnalyze = chuaThuHoi.map(r => `NV: ${r.hoten} (${r.msnv}), Ca: ${r.ca}, Quản lý: ${r.quanly}, Mượn: ${r.ten_thiet_bi}, Thời gian: ${r.timestamp}`).join('\n');
                
                if (chuaThuHoi.length === 0) {
                    return res.json({ status: 'success', reply: '🎉 Tuyệt vời! Hiện tại không có thiết bị nào đang bị giữ/chưa thu hồi.' });
                }

                const prompt = `Bạn là Trợ lý Phân Tích Dữ Liệu Kho của GHN. Dưới đây là danh sách các thiết bị CCDC ĐANG ĐƯỢC MƯỢN và CHƯA TRẢ:
${dataToAnalyze}

Hãy phân tích dữ liệu trên và đưa ra báo cáo cảnh báo rủi ro thất thoát.
Yêu cầu định dạng báo cáo (dùng Markdown):
1. **Tổng quan**: Số lượng thiết bị chưa trả.
2. **Cảnh báo rủi ro cao**: Lọc ra những nhân viên/thiết bị mượn từ các ca làm việc trước đó (hiện tại là ${nowVN()}) mà chưa trả. (Giả định mỗi ca làm việc dài 8-10 tiếng).
3. **Thống kê theo Quản lý**: Quản lý nào đang có nhiều nhân viên chưa trả đồ nhất?
4. **Đề xuất hành động**: Đưa ra 1-2 hành động cho thủ kho.
Trình bày ngắn gọn, chuyên nghiệp, dùng icon phù hợp.`;

                // Phải chạy async ngay trong đây vì hàm gốc không async, hoặc dùng Promise
                model.generateContent(prompt).then(result => {
                    const response = result.response.text();
                    res.json({ status: 'success', reply: response });
                }).catch(error => {
                    console.error("Lỗi AI:", error);
                    res.json({ status: 'error', reply: 'Lỗi khi gọi AI phân tích: ' + error.message });
                });
                return; // Trả về luôn, response sẽ được gởi trong Promise callback
            } catch (error) {
                console.error("Lỗi AI Setup:", error);
                return res.json({ status: 'error', reply: 'Lỗi khi cài đặt AI: ' + error.message });
            }
        }
        
        // Luồng 2: Lookup thông tin nhân viên theo mã (Fallback)
        const msnvMatch = msg.match(/\b(\d{7})\b/);
        if (msnvMatch) {
            const emp = DB.employees.find(e => e.msnv === msnvMatch[1]);
            if (emp) return res.json({ status: 'success', reply: `👤 **${emp.hoten}** | Ca: ${emp.ca} | Quản lý: ${emp.quanly}` });
            return res.json({ status: 'success', reply: `Không tìm thấy mã NV: ${msnvMatch[1]}` });
        }
        
        // Luồng 3: Chat thông thường (Fallback)
        return res.json({ status: 'success', reply: `🤖 Chào anh, em là AI Trợ lý phân tích kho. Anh có thể yêu cầu em "phân tích dữ liệu" hoặc "báo cáo CCDC", hoặc tra cứu thông tin nhân viên bằng cách gõ mã NV (VD: 3164559).` });
    }

    return res.json({ status: 'error', message: 'Invalid action: ' + action });
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   GHN Dashboard — OFFLINE SERVER (Excel DB)  ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║   🌐 http://localhost:${PORT}                    ║`);
    console.log('║   📊 Database: database_offline.xlsx          ║');
    console.log('║   🔄 Auto-reload khi Excel thay đổi           ║');
    console.log('║   🔒 Branch: dev — KHÔNG sync với main        ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
    console.log('💡 Mở Excel, sửa data, lưu lại → server tự reload ngay!');
    console.log('');
});
