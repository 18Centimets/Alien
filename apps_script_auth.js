/**
 * ĐOẠN CODE NÀY DÙNG ĐỂ DÁN VÀO GOOGLE APPS SCRIPT
 * Hãy chép đè vào file Apps Script hiện tại của bạn và Deploy lại (New Deployment).
 * 
 * SAU KHI DÁN, VÀO: Project Settings → Script Properties → Thêm 2 key:
 *   TELEGRAM_BOT_TOKEN = [token Telegram của anh]
 *   GEMINI_API_KEY     = [API key Gemini của anh]
 */

// ===========================================================
// CẤU HÌNH CHÍNH — ID file Google Sheet chứa toàn bộ data
// ===========================================================
var SPREADSHEET_ID = '1RFcbHT5HYnghUIkYkBmDJn1ZVvcFN7seZ4HFoIbO9nY';

// Hàm helper: luôn mở đúng file Sheet của anh Bảo (standalone script)
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

var scriptProperties = PropertiesService.getScriptProperties();
// Token Telegram chỉ đọc từ Script Properties — KHÔNG hardcode trong code
var TELEGRAM_BOT_TOKEN = scriptProperties.getProperty('TELEGRAM_BOT_TOKEN') || '';

// GEMINI KEY — đọc từ Script Properties, KHÔNG hardcode trong code
var GEMINI_API_KEY = scriptProperties.getProperty('GEMINI_API_KEY') || '';

// ============================================================
// BẢO MẬT: SESSION TOKEN + RATE LIMITING
// ============================================================
var SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000;    // Token hết hạn sau 8 giờ (1 ca làm việc)
var RATE_MAX_FAIL     = 5;                       // Số lần login fail tối đa
var RATE_WINDOW_MS    = 10 * 60 * 1000;          // Trong vòng 10 phút
var RATE_LOCK_MS      = 15 * 60 * 1000;          // Khóa tài khoản 15 phút

// Tạo token ngẫu nhiên 32 ký tự
function generateSessionToken() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var token = '';
  for (var i = 0; i < 32; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

// Kiểm tra rate limit — { blocked: false } hoặc { blocked: true, minutes: N }
function checkRateLimit(msnv) {
  var raw = scriptProperties.getProperty('rate_' + msnv);
  if (!raw) return { blocked: false };
  var d = JSON.parse(raw);
  var now = Date.now();
  // Quá window + lock time → tự reset
  if (now - d.firstFail > RATE_WINDOW_MS + RATE_LOCK_MS) {
    scriptProperties.deleteProperty('rate_' + msnv);
    return { blocked: false };
  }
  if (d.count >= RATE_MAX_FAIL) {
    var lockEnd = d.lastFail + RATE_LOCK_MS;
    if (now < lockEnd) return { blocked: true, minutes: Math.ceil((lockEnd - now) / 60000) };
    scriptProperties.deleteProperty('rate_' + msnv);
    return { blocked: false };
  }
  return { blocked: false };
}

// Ghi nhận 1 lần login thất bại
function recordFailedAttempt(msnv) {
  var now = Date.now();
  var raw = scriptProperties.getProperty('rate_' + msnv);
  var d = raw ? JSON.parse(raw) : { count: 0, firstFail: now };
  if (now - d.firstFail > RATE_WINDOW_MS) d = { count: 0, firstFail: now };
  d.count += 1;
  d.lastFail = now;
  scriptProperties.setProperty('rate_' + msnv, JSON.stringify(d));
}

// Xóa rate limit sau khi login thành công
function clearRateLimit(msnv) {
  scriptProperties.deleteProperty('rate_' + msnv);
}

// Validate session token — { valid: true, msnv, role, permissions } hoặc { valid: false }
function validateSession(token) {
  if (!token || token.length < 10) return { valid: false };
  var now = Date.now();
  // BOSS001 token lưu trong ScriptProperties (không có trong Sheet)
  var bossToken  = scriptProperties.getProperty('boss_token');
  var bossExpiry = parseInt(scriptProperties.getProperty('boss_expiry') || '0');
  if (bossToken && token === bossToken && now < bossExpiry) {
    return { valid: true, msnv: 'BOSS001', role: 'admin',
      permissions: 'overview,post-offices,trends,materials,forklifts,infra-health,purchases,transport-map,ccdc-device,ccdc-report,user-management' };
  }
  // Tìm token trong Sheet cột K (index 10), expiry cột L (index 11)
  var sheet = getAuthSheet();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var stored = data[i][10] ? data[i][10].toString().trim() : '';
    if (!stored || stored !== token) continue;
    var expiry = data[i][11] ? parseInt(data[i][11].toString()) : 0;
    if (now < expiry) {
      return { valid: true, msnv: data[i][0].toString(),
        role: data[i][5].toString(),
        permissions: data[i][9] ? data[i][9].toString() : 'overview' };
    }
    // Token hết hạn → dọn sạch
    sheet.getRange(i + 1, 11).clearContent();
    sheet.getRange(i + 1, 12).clearContent();
    return { valid: false };
  }
  return { valid: false };
}

// Cấu hình sheet nhân viên
var EMP_SHEET_NAME = 'DS nhân sự';
var EMP_COL_MSNV   = 'ID';
var EMP_COL_HOTEN  = 'Họ và tên';
var EMP_COL_CA     = 'Trạng thái';         // Cột C — Đang làm việc / Đã nghỉ
var EMP_COL_QUANLY = 'Sup/lead';             // Tìm cột chứa 'Sup/lead' — không hardcode tháng

// Xử lý CORS và preflight request
function doOptions(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  var action = e.parameter.action;
  
  if (action === 'login') return handleLogin(e.parameter.msnv, e.parameter.password);
  if (action === 'chat') return handleAIChat(e.parameter.message);
  if (action === 'google_login') return handleGoogleAuth(e.parameter.email);
  if (action === 'request_otp') return handleRequestOTP(e.parameter.msnv);
  if (action === 'verify_otp') return handleVerifyOTP(e.parameter.msnv, e.parameter.otp);
  if (action === 'verify_session') return handleVerifySession(e.parameter.token);          // ← dùng token thay vì msnv
  if (action === 'logout')         return handleLogout(e.parameter.token);
  if (action === 'submit_chatid') return handleSubmitChatID(e.parameter.msnv, e.parameter.chatid);
  if (action === 'register') return handleRegister(e.parameter.fullname, e.parameter.msnv, e.parameter.password, e.parameter.phone, e.parameter.chatid);

  // APIs quản lý nhân sự — yêu cầu admin session token
  if (action === 'get_users')    return handleGetUsers(e.parameter.token);
  if (action === 'create_user')  return handleCreateUser(e.parameter.token, e.parameter.msnv, e.parameter.password, e.parameter.fullname, e.parameter.role, e.parameter.chatid, e.parameter.permissions);
  if (action === 'update_user')  return handleUpdateUser(e.parameter.token, e.parameter.msnv, e.parameter.password, e.parameter.fullname, e.parameter.role, e.parameter.chatid, e.parameter.permissions, e.parameter.status);
  if (action === 'delete_user')  return handleDeleteUser(e.parameter.token, e.parameter.msnv);

  // APIs cho CCDC Quản Lý Thiết Bị
  if (action === 'get_employees')    return ccdcGetEmployees();
  if (action === 'lookup_employee')  return ccdcLookupEmployee(e.parameter.msnv);
  if (action === 'lookup_borrowed')  return ccdcLookupBorrowed(e.parameter.msnv);
  if (action === 'submit_giao')      return ccdcSubmitGiao(e.parameter);
  if (action === 'submit_nhan')      return ccdcSubmitNhan(e.parameter);
  if (action === 'get_today_log')    return ccdcGetTodayLog();
  if (action === 'ccdc_get_all_logs')      return ccdcGetAllLogs();
  if (action === 'ccdc_get_all_logs_nhan') return ccdcGetAllNhanLogs();
  if (action === 'mute_alert')             return handleMuteAlert(parseInt(e.parameter.row_index || '0'));
  if (action === 'debug_headers')          return ccdcDebugHeaders();
  if (action === 'tts')                    return handleTts(e.parameter.text);
  if (action === 'setup_system')           return handleSetupSystem(e.parameter.secret);

  return createJsonResponse({ status: "error", message: "Invalid action" });
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getAuthSheet() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName("Tài khoản");
  
  // Tự động tạo Tab nếu chưa có
  if (!sheet) {
    sheet = ss.insertSheet("Tài khoản");
    sheet.appendRow(["MSNV", "Mật khẩu", "Họ Tên", "Email", "Trạng thái", "Phân quyền", "Chat ID", "OTP", "OTP Expiry", "Quyền Menu"]);
    
    // Tạo sẵn 2 tài khoản mẫu (Admin và User)
    var defaultAdminPerms = "overview,post-offices,trends,materials,forklifts,infra-health,purchases,transport-map,ccdc-device,ccdc-report";
    sheet.appendRow(["ADMIN001", "admin123", "Quản Trị Viên", "admin@ghn.vn", "Đã duyệt", "admin", "1014440614", "", "", defaultAdminPerms]);
    sheet.appendRow(["USER001", "user123", "Nhân Viên Kho", "user@ghn.vn", "Đã duyệt", "user", "", "", "", "overview,trends,ccdc-device,ccdc-report"]);
  }
  return sheet;
}

// =====================================
// API: AUTHENTICATION
// =====================================

function handleLogin(msnv, password) {
  if (!msnv || !password) return createJsonResponse({ status: 'error', message: 'Thiếu MSNV hoặc mật khẩu!' });

  // *** BOSS001 kiểm tra TRƯỚC rate limit — tránh bị DoS khoá Super Admin ***
  if (msnv === 'BOSS001') {
    // Đọc password từ Script Properties (không hardcode trong source)
    var bossPass = scriptProperties.getProperty('boss_password') || 'boss123';
    if (password === bossPass) {
      clearRateLimit('BOSS001');
      var bossToken  = generateSessionToken();
      var bossExpiry = Date.now() + SESSION_EXPIRY_MS;
      scriptProperties.setProperty('boss_token',  bossToken);
      scriptProperties.setProperty('boss_expiry', bossExpiry.toString());
      return createJsonResponse({
        status: 'bypass_otp', msnv: 'BOSS001', role: 'admin', fullname: 'Super Admin',
        session_token: bossToken,
        permissions: 'overview,post-offices,trends,materials,forklifts,infra-health,purchases,transport-map,ccdc-device,ccdc-report,user-management',
        message: 'Đăng nhập Super Admin thành công!'
      });
    }
    // Sai password BOSS001 — không ghi rate limit, không tiết lộ thêm thông tin
    return createJsonResponse({ status: 'error', message: 'Sai MSNV hoặc mật khẩu!' });
  }

  // === RATE LIMITING (chỉ áp dụng cho user thường) ===
  var rateCheck = checkRateLimit(msnv);
  if (rateCheck.blocked) {
    return createJsonResponse({ status: 'error', message: 'Tài khoản tạm khóa ' + rateCheck.minutes + ' phút do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau!' });
  }

  var sheet = getAuthSheet();
  var data  = sheet.getDataRange().getValues();
  var headers   = data[0].map(function(h) { return h.toString().trim(); });
  var statusCol = headers.indexOf('Trạng thái');  if (statusCol < 0) statusCol = 4;
  var permCol   = headers.indexOf('Quyền Menu');  if (permCol   < 0) permCol   = 9;
  var fnCol     = headers.indexOf('Họ Tên');       if (fnCol     < 0) fnCol     = 2;

  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== msnv || data[i][1].toString() !== password) continue;
    var status = data[i][statusCol] ? data[i][statusCol].toString() : '';
    if (status !== 'Đã duyệt') {
      return createJsonResponse({ status: 'error', message: 'Tài khoản đang bị khóa!' });
    }
    clearRateLimit(msnv);
    return createJsonResponse({ status: 'success', msnv: data[i][0].toString(),
      message: 'Xác thực thành công. Vui lòng xác thực OTP.' });
  }

  // Login sai → ghi nhận và kiểm tra lại
  recordFailedAttempt(msnv);
  var newCheck = checkRateLimit(msnv);
  if (newCheck.blocked) {
    return createJsonResponse({ status: 'error', message: 'Đăng nhập sai 5 lần! Tài khoản bị khóa ' + newCheck.minutes + ' phút.' });
  }
  return createJsonResponse({ status: 'error', message: 'Sai MSNV hoặc mật khẩu!' });
}


function handleGoogleAuth(email) {
  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return h.toString().trim(); });
  var statusCol = headers.indexOf('Trạng thái');
  if (statusCol < 0) statusCol = 4;
  var emailCol = headers.indexOf('Email');
  if (emailCol < 0) emailCol = 3;

  for (var i = 1; i < data.length; i++) {
    var sheetEmail = data[i][emailCol] ? data[i][emailCol].toString() : '';
    if (sheetEmail.toLowerCase() === email.toLowerCase()) {
      var status = data[i][statusCol] ? data[i][statusCol].toString() : '';
      if (status === 'Đã duyệt') {
        return createJsonResponse({ status: 'success', msnv: data[i][0].toString(), message: 'Xác thực Google thành công. Vui lòng xác thực OTP.' });
      } else {
        return createJsonResponse({ status: 'error', message: 'Tài khoản đang bị khóa!' });
      }
    }
  }
  return createJsonResponse({ status: 'error', message: 'Email này chưa liên kết với MSNV nào!' });
}

function handleRequestOTP(msnv) {
  if (msnv === 'BOSS001') {
    return createJsonResponse({ status: 'bypass_otp', message: 'Tài khoản này không cần OTP.' });
  }

  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === msnv) {
      var chatID = data[i][6].toString();
      if (!chatID) return createJsonResponse({ status: 'missing_chatid', message: 'Tài khoản chưa có Telegram Chat ID.' });
      
      var otp = Math.floor(100000 + Math.random() * 900000).toString();
      var expiry = new Date(new Date().getTime() + 5 * 60000).getTime(); 
      sheet.getRange(i + 1, 8).setValue(otp);
      sheet.getRange(i + 1, 9).setValue(expiry);
      
      var message = "🔐 GHN Command Center\nMã xác thực OTP của bạn là: *" + otp + "*\nMã có hiệu lực trong 5 phút.";
      sendTelegramMessage(chatID, message);
      return createJsonResponse({ status: 'success', message: 'Mã OTP đã được gửi.' });
    }
  }
  return createJsonResponse({ status: 'error', message: 'Không tìm thấy MSNV.' });
}

function handleVerifyOTP(msnv, otp) {
  if (msnv === 'BOSS001') {
    return createJsonResponse({ status: 'success', role: 'admin',
      permissions: 'overview,post-offices,trends,materials,forklifts,infra-health,purchases,transport-map,ccdc-device,ccdc-report,user-management',
      message: 'Đăng nhập thành công!' });
  }

  var sheet = getAuthSheet();
  var data  = sheet.getDataRange().getValues();
  var now   = Date.now();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== msnv) continue;
    if (data[i][7].toString() !== otp) {
      recordFailedAttempt(msnv + '_otp'); // Rate limit riêng cho OTP
      return createJsonResponse({ status: 'error', message: 'Mã OTP không chính xác!' });
    }
    if (now > parseInt(data[i][8])) return createJsonResponse({ status: 'error', message: 'Mã OTP đã hết hạn!' });

    // OTP đúng → tạo session token và lưu vào cột K (index 10) + L (index 11)
    var token  = generateSessionToken();
    var expiry = now + SESSION_EXPIRY_MS;
    sheet.getRange(i + 1, 8).clearContent();   // Xóa OTP
    sheet.getRange(i + 1, 9).clearContent();   // Xóa OTP Expiry
    sheet.getRange(i + 1, 11).setValue(token); // Session Token (cột K)
    sheet.getRange(i + 1, 12).setValue(expiry);// Session Expiry (cột L)
    clearRateLimit(msnv);
    clearRateLimit(msnv + '_otp');
    return createJsonResponse({
      status: 'success', role: data[i][5].toString(),
      permissions: data[i][9] ? data[i][9].toString() : 'overview',
      session_token: token,
      message: 'Đăng nhập thành công!'
    });
  }
  return createJsonResponse({ status: 'error', message: 'Xác thực thất bại.' });
}

function handleVerifySession(token) {
  var result = validateSession(token);
  if (!result.valid) return createJsonResponse({ status: 'unauthorized', message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.' });
  return createJsonResponse({ status: 'success', msnv: result.msnv, role: result.role, permissions: result.permissions });
}

function handleLogout(token) {
  if (!token) return createJsonResponse({ status: 'success', message: 'Đã đăng xuất.' });
  // Xóa BOSS001 token
  if (scriptProperties.getProperty('boss_token') === token) {
    scriptProperties.deleteProperty('boss_token');
    scriptProperties.deleteProperty('boss_expiry');
    return createJsonResponse({ status: 'success', message: 'Đã đăng xuất.' });
  }
  // Xóa token trong Sheet
  var sheet = getAuthSheet();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][10] || '').toString().trim() === token) {
      sheet.getRange(i + 1, 11).clearContent();
      sheet.getRange(i + 1, 12).clearContent();
      break;
    }
  }
  return createJsonResponse({ status: 'success', message: 'Đã đăng xuất.' });
}

function handleSubmitChatID(msnv, chatid) {
  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === msnv) {
      // Lưu Chat ID
      sheet.getRange(i + 1, 7).setValue(chatid);
      // Chuyển trạng thái sang Chờ duyệt
      sheet.getRange(i + 1, 5).setValue("Chờ duyệt");
      return createJsonResponse({ status: 'success', message: 'Đã gửi yêu cầu đăng ký Chat ID thành công!' });
    }
  }
  return createJsonResponse({ status: 'error', message: 'Không tìm thấy MSNV!' });
}

function sendTelegramMessage(chatId, text) {
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
  try {
    UrlFetchApp.fetch(url, {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify({ "chat_id": chatId, "text": text, "parse_mode": "Markdown" })
    });
  } catch(e) {}
}

// =====================================
// API: QUẢN LÝ NHÂN SỰ (USER MANAGEMENT)
// =====================================

function handleGetUsers(token) {
  // Yêu cầu admin session token hợp lệ
  var sess = validateSession(token);
  if (!sess.valid || sess.role !== 'admin') {
    return createJsonResponse({ status: 'unauthorized', message: 'Không có quyền truy cập. Vui lòng đăng nhập lại.' });
  }
  var sheet = getAuthSheet();
  var data  = sheet.getDataRange().getValues();
  var users = [];
  for (var i = 1; i < data.length; i++) {
    var msnvVal = data[i][0].toString();
    if (msnvVal === 'BOSS001') continue;
    users.push({
      msnv: msnvVal,
      fullname: data[i][2].toString(),
      status: data[i][4].toString() === 'Đã duyệt' ? 'active' : data[i][4].toString() === 'Chờ duyệt' ? 'pending' : 'locked',
      role: data[i][5].toString(),
      chatid: data[i][6].toString(),
      permissions: data[i][9] ? data[i][9].toString().split(',') : ['overview']
    });
  }
  return createJsonResponse({ status: 'success', data: users });
}

function handleCreateUser(token, msnv, password, fullname, role, chatid, permissions) {
  var sess = validateSession(token);
  if (!sess.valid || sess.role !== 'admin') return createJsonResponse({ status: 'unauthorized', message: 'Không có quyền.' });
  if (msnv === 'BOSS001') return createJsonResponse({ status: 'error', message: 'MSNV đã tồn tại!' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = getAuthSheet();
    var data  = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === msnv) return createJsonResponse({ status: 'error', message: 'MSNV đã tồn tại!' });
    }
    sheet.appendRow([msnv, password || '123456', fullname, '', 'Đã duyệt', role, chatid, '', '', permissions || 'overview', '', '']);
    return createJsonResponse({ status: 'success', message: 'Tạo tài khoản thành công!' });
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Hệ thống bận, vui lòng thử lại sau.' });
  } finally { lock.releaseLock(); }
}

function handleUpdateUser(token, msnv, password, fullname, role, chatid, permissions, status) {
  var sess = validateSession(token);
  if (!sess.valid || sess.role !== 'admin') return createJsonResponse({ status: 'unauthorized', message: 'Không có quyền.' });
  if (msnv === 'BOSS001') return createJsonResponse({ status: 'error', message: 'Không tìm thấy MSNV!' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = getAuthSheet();
    var data  = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === msnv) {
        var row = i + 1;
        if (password   && password   !== 'null' && password   !== 'undefined') sheet.getRange(row, 2).setValue(password);
        if (fullname   && fullname   !== 'null') sheet.getRange(row, 3).setValue(fullname);
        if (status     && status     !== 'null') sheet.getRange(row, 5).setValue(status === 'active' ? 'Đã duyệt' : 'Khóa');
        if (role       && role       !== 'null') sheet.getRange(row, 6).setValue(role);
        if (chatid     && chatid     !== 'null') sheet.getRange(row, 7).setValue(chatid);
        if (permissions && permissions !== 'null') sheet.getRange(row, 10).setValue(permissions);
        return createJsonResponse({ status: 'success', message: 'Cập nhật thành công!' });
      }
    }
    return createJsonResponse({ status: 'error', message: 'Không tìm thấy MSNV!' });
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Hệ thống bận, vui lòng thử lại sau.' });
  } finally { lock.releaseLock(); }
}

function handleDeleteUser(token, msnv) {
  var sess = validateSession(token);
  if (!sess.valid || sess.role !== 'admin') return createJsonResponse({ status: 'unauthorized', message: 'Không có quyền.' });
  if (msnv === 'BOSS001') return createJsonResponse({ status: 'error', message: 'Không thể xóa tài khoản này!' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = getAuthSheet();
    var data  = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === msnv) {
        sheet.deleteRow(i + 1);
        return createJsonResponse({ status: 'success', message: 'Xóa tài khoản thành công!' });
      }
    }
    return createJsonResponse({ status: 'error', message: 'Không tìm thấy MSNV!' });
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Hệ thống bận, vui lòng thử lại sau.' });
  } finally { lock.releaseLock(); }
}

// =====================================
// API: TỰ ĐĂNG KÝ TÀI KHOẢN MỚI
// =====================================
function handleRegister(fullname, msnv, password, phone, chatid) {
  // --- 1. Kiểm tra đầu vào cơ bản ---
  if (!fullname || !msnv || !password || !phone) {
    return createJsonResponse({ status: 'error', message: 'Vui lòng điền đầy đủ các trường bắt buộc!' });
  }

  // --- 2. Validate mật khẩu phía Server ---
  if (password.length < 8) {
    return createJsonResponse({ status: 'error', message: 'Mật khẩu phải có ít nhất 8 ký tự!' });
  }
  if (!/[A-Z]/.test(password)) {
    return createJsonResponse({ status: 'error', message: 'Mật khẩu phải có ít nhất 1 chữ in hoa!' });
  }
  if (!/[a-z]/.test(password)) {
    return createJsonResponse({ status: 'error', message: 'Mật khẩu phải có ít nhất 1 chữ in thường!' });
  }
  if (!/[0-9]/.test(password)) {
    return createJsonResponse({ status: 'error', message: 'Mật khẩu phải có ít nhất 1 chữ số!' });
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return createJsonResponse({ status: 'error', message: 'Mật khẩu phải có ít nhất 1 ký tự đặc biệt (!@#$...)!' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    // --- 3. Kiểm tra trùng lặp trong Sheet ---
    var sheet = getAuthSheet();
    var data = sheet.getDataRange().getValues();
    var normalizedMsnv  = msnv.trim().toUpperCase();
    var normalizedPhone = phone.trim();

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var existingMsnv  = (row[0] || '').toString().trim().toUpperCase();
      var existingPhone = (row[10] || '').toString().trim();

      if (existingMsnv === normalizedMsnv) {
        return createJsonResponse({ status: 'error', message: 'Mã số nhân viên "' + msnv + '" đã tồn tại trong hệ thống!' });
      }
      if (existingPhone && existingPhone === normalizedPhone) {
        return createJsonResponse({ status: 'error', message: 'Số điện thoại "' + phone + '" đã được đăng ký với tài khoản khác!' });
      }
    }

    // --- 4. Ghi vào Sheet (status = Chờ duyệt) ---
    sheet.appendRow([
      normalizedMsnv,
      password,
      fullname.trim(),
      '',             // Email (để trống, admin sẽ bổ sung)
      'Chờ duyệt',   // Trạng thái
      'user',         // Phân quyền mặc định
      chatid || '',   // Chat ID Telegram
      '',             // OTP
      '',             // OTP Expiry
      'overview',     // Quyền Menu mặc định
      normalizedPhone // SĐT
    ]);

    // --- 5. Notify Admin qua Telegram ---
    try {
      var adminChatId = '';
      var adminData = sheet.getDataRange().getValues();
      for (var j = 1; j < adminData.length; j++) {
        if ((adminData[j][5] || '').toString().toLowerCase() === 'admin') {
          adminChatId = adminData[j][6].toString();
          break;
        }
      }

      if (adminChatId) {
        var msg = '🔔 *YÊU CẦU ĐĂNG KÝ TÀI KHOẢN MỚI*\n\n'
                + '👤 *Họ tên:* ' + fullname + '\n'
                + '🪪 *Mã NV:* ' + normalizedMsnv + '\n'
                + '📱 *SĐT:* ' + normalizedPhone + '\n'
                + '💬 *Chat ID TG:* ' + (chatid || 'Chưa cung cấp') + '\n\n'
                + '➡️ Vào mục _Quản Lý Nhân Sự_ để duyệt hoặc từ chối yêu cầu này.';

        var url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
        UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({ chat_id: adminChatId, text: msg, parse_mode: 'Markdown' })
        });
      }
    } catch(err) {
      Logger.log('Telegram notify error: ' + err.toString());
    }

    return createJsonResponse({ status: 'success', message: 'Đăng ký thành công! Vui lòng chờ Admin duyệt.' });
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Hệ thống bận, vui lòng đăng ký lại sau.' });
  } finally {
    lock.releaseLock();
  }
}
// [ĐÃ XÓA] Định nghĩa handleDeleteUser thứ 2 (không có token) đã bị loại bỏ.
// Dùng handleDeleteUser(token, msnv) tại dòng ~458 — có validateSession đầy đủ.



// =================================================================
// CCDC MODULE — QUẢN LÝ THIẾT BỊ BẰNG SÚNG SCAN QR
// =================================================================

// Cấu hình tên cột trong sheet "DS nhân sự" — đã đọc từ sheet thực tế
// Header thật ở dòng 2 (dòng 1 là tiêu đề merge "Cập nhật...")
// Cột: ID(0/A), Họ và tên(1/B), Trạng thái(2/C), Ca làm việc đăng ký(3/D), Sup/lead(4/E)
var CCDC_EMP_SHEET   = 'DS nhân sự';
var CCDC_HEADER_ROW  = 1;   // 0-indexed: dòng 2 trong Sheet = header thật
var CCDC_COL_MSNV    = 'ID';
var CCDC_COL_HOTEN   = 'Họ và tên';
var CCDC_COL_CA      = 'Trạng thái';          // Cột C — Đang làm việc / Đã nghỉ
var CCDC_COL_QUANLY  = 'Sup/lead';           // Tìm cột chứa 'Sup/lead' — không hardcode tháng


// Đọc sheet nhân viên và tạo bản đồ index cột theo tên header
function ccdcGetEmpMap() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(CCDC_EMP_SHEET);
  if (!sheet) return { error: 'Không tìm thấy sheet "' + CCDC_EMP_SHEET + '"' };
  var data = sheet.getDataRange().getValues();
  if (data.length < CCDC_HEADER_ROW + 2) return { error: 'Sheet nhân viên không đủ dữ liệu' };
  // Header thật nằm ở dòng CCDC_HEADER_ROW (0-indexed)
  var headers = data[CCDC_HEADER_ROW].map(function(h) { return h.toString().trim(); });
  var idx = {
    msnv:   headers.indexOf(CCDC_COL_MSNV),
    hoten:  headers.indexOf(CCDC_COL_HOTEN),
    ca:     headers.indexOf(CCDC_COL_CA),
    // Tìm cột quản lý theo pattern 'Sup/lead' — tự động thích nghi khi đổi tên tháng
    quanly: headers.findIndex(function(h) { return h.indexOf('Sup/lead') >= 0 || h.indexOf('Quản lý') >= 0; })
  };
  // Fallback hardcode theo vị trí thực tế đã xác nhận
  if (idx.msnv   < 0) idx.msnv   = 0;  // ID
  if (idx.hoten  < 0) idx.hoten  = 1;  // Họ và tên
  if (idx.ca     < 0) idx.ca     = 2;  // Trạng thái (Đang làm việc/Đã nghỉ)
  if (idx.quanly < 0) idx.quanly = 4;  // Sup/lead Tháng 5 (cột E)
  // Data bắt đầu từ dòng sau header (dòng 3 trong Sheet = index 2)
  return { data: data, idx: idx, headers: headers, dataStart: CCDC_HEADER_ROW + 1 };
}


// API: Tìm nhân viên theo mã QR (Mã NV = ID)
function ccdcLookupEmployee(msnv) {
  if (!msnv) return createJsonResponse({ status: 'error', message: 'Thiếu mã NV' });
  var map = ccdcGetEmpMap();
  if (map.error) return createJsonResponse({ status: 'error', message: map.error });
  var q = msnv.toString().trim().toLowerCase();
  for (var i = map.dataStart; i < map.data.length; i++) {
    var row = map.data[i];
    var empId = (row[map.idx.msnv] || '').toString().trim().toLowerCase();
    if (empId === q) {
      // Quản lý thường dạng "MSNV-Tên" → chỉ lấy phần tên
      var rawQuanly = row[map.idx.quanly] ? row[map.idx.quanly].toString().trim() : '';
      var quanlyName = rawQuanly.indexOf('-') > 0
        ? rawQuanly.substring(rawQuanly.indexOf('-') + 1).trim()
        : rawQuanly;


      return createJsonResponse({
        status:   'found',
        msnv:     row[map.idx.msnv].toString().trim(),
        hoten:    row[map.idx.hoten]  ? row[map.idx.hoten].toString().trim() : '',
        ca:       row[map.idx.ca]     ? row[map.idx.ca].toString().trim()    : '',
        quanly:   quanlyName
      });

    }
  }
  return createJsonResponse({ status: 'not_found', message: 'Không tìm thấy mã NV: ' + msnv });
}


// API: Tìm thiết bị đang mượn của 1 nhân viên
function ccdcLookupBorrowed(msnv) {
  if (!msnv) return createJsonResponse({ status: 'error', message: 'Thiếu mã NV' });
  var ss = getSpreadsheet();
  var sheet = ccdcGetOrCreateGiaoSheet(ss);
  var data = sheet.getDataRange().getValues();
  var q = msnv.toString().trim().toLowerCase();
  var borrowed = [];
  for (var i = 1; i < data.length; i++) {
    var rowMsnv  = (data[i][1] || '').toString().trim().toLowerCase();
    var daThuHoi = (data[i][7] || '').toString().trim();
    if (rowMsnv === q && daThuHoi !== 'true') {
      borrowed.push({
        timestamp:    data[i][0] ? data[i][0].toString() : '',
        msnv:         data[i][1] ? data[i][1].toString() : '',
        hoten:        data[i][2] ? data[i][2].toString() : '',
        ca:           data[i][3] ? data[i][3].toString() : '',
        quanly:       data[i][4] ? data[i][4].toString() : '',
        ma_thiet_bi:  data[i][5] ? data[i][5].toString() : '',
        ten_thiet_bi: data[i][6] ? data[i][6].toString() : '',
        row_index:    i + 1
      });
    }
  }
  if (borrowed.length === 0) {
    var empRes = JSON.parse(ccdcLookupEmployee(msnv).getContent());
    return createJsonResponse({ status: 'no_borrow', emp: empRes });
  }
  return createJsonResponse({ status: 'has_borrow', borrowed: borrowed });
}

// API: Lưu giao dịch GIAO thiết bị
function ccdcSubmitGiao(params) {
  var msnv = params.msnv || '', hoten = params.hoten || '';
  var ca = params.ca || '', quanly = params.quanly || '';
  var ma = params.ma_thiet_bi || '', ten = params.ten_thiet_bi || '';
  var ghi = params.ghi_chu || '';
  var nguoi_thao_tac = params.nguoi_thao_tac || '';
  if (!msnv || !ma || !ten)
    return createJsonResponse({ status: 'error', message: 'Thiếu: Mã NV, Mã Thiết Bị, Tên Thiết Bị' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = ccdcGetOrCreateGiaoSheet(ss);
    var ts = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
    sheet.appendRow([ts, msnv, hoten, ca, quanly, ma, ten, 'false', '', '', ghi, nguoi_thao_tac, '', '']);
    return createJsonResponse({ status: 'success', message: 'Giao thiết bị thành công!' });
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Hệ thống bận, vui lòng thử lại sau.' });
  } finally {
    lock.releaseLock();
  }
}


// API: Lưu giao dịch NHẬN (thu hồi) thiết bị
function ccdcSubmitNhan(params) {
  var msnv = params.msnv || '', ma = params.ma_thiet_bi || '';
  var tinh = params.tinh_trang || '', ghi = params.ghi_chu || '';
  var nguoi_thao_tac = params.nguoi_thao_tac || '';
  var rowIdx = parseInt(params.row_index || '0');
  if (!msnv || !ma)
    return createJsonResponse({ status: 'error', message: 'Thiếu Mã NV hoặc Mã Thiết Bị' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var giaoSheet = ccdcGetOrCreateGiaoSheet(ss);
    var ts = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
    
    var hoten='', ca='', quanly='', ten='';
    var targetRowIdx = -1;
    
    var data = giaoSheet.getDataRange().getValues();
    if (rowIdx > 1 && rowIdx <= data.length) {
      var r = data[rowIdx - 1];
      if ((r[1]||'').toString().trim().toLowerCase() === msnv.toLowerCase() &&
          (r[5]||'').toString().trim().toLowerCase() === ma.toLowerCase()) {
        hoten = r[2] || '';
        ca = r[3] || '';
        quanly = r[4] || '';
        ten = r[6] || '';
        targetRowIdx = rowIdx;
      }
    }
    
    // Nếu không tìm được theo rowIdx, tìm dòng mới nhất chưa thu hồi của nhân viên với thiết bị này
    if (targetRowIdx === -1) {
      for (var i = data.length - 1; i >= 1; i--) {
        if ((data[i][1]||'').toString().trim().toLowerCase() === msnv.toLowerCase() &&
            (data[i][5]||'').toString().trim().toLowerCase() === ma.toLowerCase() &&
            (data[i][7]||'').toString().trim() !== 'true') {
          hoten = data[i][2] || '';
          ca = data[i][3] || '';
          quanly = data[i][4] || '';
          ten = data[i][6] || '';
          targetRowIdx = i + 1;
          break;
        }
      }
    }
    
    // Nếu vẫn không thấy, tìm dòng đã thu hồi gần nhất để điền thông tin thay thế
    if (targetRowIdx === -1) {
      for (var i = data.length - 1; i >= 1; i--) {
        if ((data[i][1]||'').toString().trim().toLowerCase() === msnv.toLowerCase() &&
            (data[i][5]||'').toString().trim().toLowerCase() === ma.toLowerCase()) {
          hoten = data[i][2] || '';
          ca = data[i][3] || '';
          quanly = data[i][4] || '';
          ten = data[i][6] || '';
          targetRowIdx = i + 1;
          break;
        }
      }
    }
    
    if (targetRowIdx > 1) {
      giaoSheet.getRange(targetRowIdx, 8).setValue('true');
      giaoSheet.getRange(targetRowIdx, 9).setValue(ts);
      giaoSheet.getRange(targetRowIdx, 10).setValue(tinh);
      if (ghi) giaoSheet.getRange(targetRowIdx, 11).setValue(ghi);
      if (nguoi_thao_tac) giaoSheet.getRange(targetRowIdx, 12).setValue(nguoi_thao_tac);
    }
    
    // Ghi log vào CCDC_Nhan
    var nhanSheet = ccdcGetOrCreateNhanSheet(ss);
    nhanSheet.appendRow([ts, msnv, hoten, ca, quanly, ma, ten, tinh, ghi, nguoi_thao_tac]);
    return createJsonResponse({ status: 'success', message: 'Thu hồi thiết bị thành công!' });
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Hệ thống bận, vui lòng thử lại sau.' });
  } finally {
    lock.releaseLock();
  }
}


// Helper parse Date từ sheet
function formatCellDate(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
  return val.toString();
}

// API: Log giao dịch hôm nay
function ccdcGetTodayLog() {
  var ss = getSpreadsheet();
  var sheet = ccdcGetOrCreateGiaoSheet(ss);
  var data = sheet.getDataRange().getValues();
  
  // So sánh bằng Date object — không phụ thuộc locale/format string
  var now = new Date();
  var todayYear  = now.getFullYear();
  var todayMonth = now.getMonth();
  var todayDate  = now.getDate();
  
  var log = [];
  for (var i = data.length - 1; i >= 1; i--) {
    var cellVal = data[i][0];
    if (!cellVal) continue;
    
    // Parse ngày: nếu là Date object thì dùng trực tiếp, nếu là string thì parse
    var cellDate;
    if (cellVal instanceof Date) {
      cellDate = cellVal;
    } else {
      // Thử parse string dd/MM/yyyy hoặc MM/dd/yyyy
      cellDate = new Date(cellVal.toString());
      if (isNaN(cellDate.getTime())) continue;
    }
    
    if (cellDate.getFullYear() === todayYear && 
        cellDate.getMonth() === todayMonth && 
        cellDate.getDate() === todayDate) {
      log.push({
        timestamp:       formatCellDate(cellVal),
        msnv:            data[i][1].toString(),
        hoten:           data[i][2].toString(),
        ca:              data[i][3].toString(),
        ma_thiet_bi:     data[i][5].toString(),
        ten_thiet_bi:    data[i][6].toString(),
        da_thu_hoi:      data[i][7].toString() === 'true',
        thu_hoi_luc:     formatCellDate(data[i][8]),
        tinh_trang:      data[i][9].toString(),
        nguoi_thao_tac:  data[i][11] ? data[i][11].toString() : ''
      });
    }
    if (log.length >= 50) break;
  }
  return createJsonResponse({ status: 'success', log: log });
}


function ccdcGetAllLogs() {
  var ss = getSpreadsheet();
  var sheet = ccdcGetOrCreateGiaoSheet(ss);
  var data = sheet.getDataRange().getValues();
  var log = [];
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    if (row[1]) {
      log.push({
        row_index:      i,
        timestamp:      formatCellDate(row[0]),
        msnv:           row[1] ? row[1].toString() : '',
        hoten:          row[2] ? row[2].toString() : '',
        ca:             row[3] ? row[3].toString() : '',
        quanly:         row[4] ? row[4].toString() : '',
        ma_thiet_bi:    row[5] ? row[5].toString() : '',
        ten_thiet_bi:   row[6] ? row[6].toString() : '',
        da_thu_hoi:     row[7].toString() === 'true',
        thu_hoi_luc:    formatCellDate(row[8]),
        tinh_trang:     row[9] ? row[9].toString() : '',
        ghi_chu:        row[10] ? row[10].toString() : '',
        nguoi_thao_tac: row[11] ? row[11].toString() : '',
        tat_canh_bao:   row[13] ? row[13].toString().toLowerCase() === 'true' : false
      });
    }
  }
  return createJsonResponse({ status: 'success', log: log });
}



// API: Lấy toàn bộ lịch sử thu hồi thiết bị (CCDC_Nhan)
function ccdcGetAllNhanLogs() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('CCDC_Nhan');
  // Tự tạo sheet nếu chưa tồn tại (giống cách CCDC_Giao hoạt động)
  if (!sheet) {
    sheet = ss.insertSheet('CCDC_Nhan');
    sheet.appendRow(['Thời Gian Thu Hồi','Mã NV','Họ Tên','Ca Làm Việc','Quản Lý','Mã Thiết Bị','Tên Thiết Bị','Tình Trạng','Ghi Chú','Người Thao Tác']);
    sheet.getRange(1,1,1,10).setFontWeight('bold').setBackground('#2ecc71').setFontColor('white');
    sheet.setFrozenRows(1);
    return createJsonResponse({ status: 'success', log: [] }); // Sheet mới, chưa có dữ liệu
  }
  var data = sheet.getDataRange().getValues();
  var log = [];
  // Cấu trúc CCDC_Nhan: [Thời Gian Thu Hồi, Mã NV, Họ Tên, Ca Làm Việc, Quản Lý, Mã Thiết Bị, Tên Thiết Bị, Tình Trạng, Ghi Chú, Người Thao Tác]
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    if (row[1]) {
      log.push({
        timestamp:       row[0] ? row[0].toString() : '',
        msnv:            row[1] ? row[1].toString() : '',
        hoten:           row[2] ? row[2].toString() : '',
        ca:              row[3] ? row[3].toString() : '',
        quanly:          row[4] ? row[4].toString() : '',
        ma_thiet_bi:     row[5] ? row[5].toString() : '',
        ten_thiet_bi:    row[6] ? row[6].toString() : '',
        tinh_trang:      row[7] ? row[7].toString() : '',
        ghi_chu:         row[8] ? row[8].toString() : '',
        nguoi_thao_tac:  row[9] ? row[9].toString() : ''
      });
    }
  }
  return createJsonResponse({ status: 'success', log: log });
}

// HELPER: Tạo / lấy sheet CCDC_Giao
function ccdcGetOrCreateGiaoSheet(ss) {
  var sheet = ss.getSheetByName('CCDC_Giao');
  if (!sheet) {
    sheet = ss.insertSheet('CCDC_Giao');
    sheet.appendRow([
      'Thời Gian Giao','Mã NV','Họ Tên','Ca Làm Việc','Quản Lý',
      'Mã Thiết Bị','Tên Thiết Bị','Đã Thu Hồi','Thời Gian Thu Hồi',
      'Tình Trạng','Ghi Chú','Người Thao Tác',
      'Thời Gian Nhắc',  // col 12 (M) — timestamp (ms) của lần nhắc gần nhất
      'Tắt Cảnh Báo'     // col 13 (N) — true/false tắt thủ công
    ]);
    sheet.getRange(1,1,1,14).setFontWeight('bold').setBackground('#f26522').setFontColor('white');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1,160); sheet.setColumnWidth(7,200); sheet.setColumnWidth(9,160); sheet.setColumnWidth(12,180);
  }
  return sheet;
}

// HELPER: Tạo / lấy sheet CCDC_Nhan
function ccdcGetOrCreateNhanSheet(ss) {
  var sheet = ss.getSheetByName('CCDC_Nhan');
  if (!sheet) {
    sheet = ss.insertSheet('CCDC_Nhan');
    sheet.appendRow(['Thời Gian Thu Hồi','Mã NV','Họ Tên','Ca Làm Việc','Quản Lý','Mã Thiết Bị','Tên Thiết Bị','Tình Trạng','Ghi Chú','Người Thao Tác']);
    sheet.getRange(1,1,1,10).setFontWeight('bold').setBackground('#27ae60').setFontColor('white');
    sheet.setFrozenRows(1);
  }
  return sheet;
}


// DEBUG: Đọc tên cột thực tế trong "DS nhân sự" để fix config
function ccdcDebugHeaders() {
  var ss = getSpreadsheet();
  var allSheets = ss.getSheets().map(function(s) { return s.getName(); });
  var sheet = ss.getSheetByName(CCDC_EMP_SHEET);
  if (!sheet) {
    return createJsonResponse({
      status: 'error',
      message: 'Không tìm thấy sheet: ' + CCDC_EMP_SHEET,
      all_sheets: allSheets
    });
  }
  var data = sheet.getDataRange().getValues();
  var headers = data[0] ? data[0].map(function(h){ return h.toString(); }) : [];
  var sample = [];
  for (var i = 1; i <= Math.min(3, data.length-1); i++) {
    sample.push(data[i].map(function(c){ return c.toString(); }));
  }
  return createJsonResponse({
    status: 'ok',
    sheet_name: CCDC_EMP_SHEET,
    total_rows: data.length - 1,
    headers: headers,
    sample_rows: sample,
    all_sheets: allSheets
  });
}

// API: Gọi Google TTS từ phía Apps Script và trả về Base64 MP3
function handleTts(text) {
  if (!text) return createJsonResponse({ status: "error", message: "Missing text" });
  try {
    var url = "https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=" + encodeURIComponent(text);
    var response = UrlFetchApp.fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      var urlFallback = "https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=gtx&q=" + encodeURIComponent(text);
      response = UrlFetchApp.fetch(urlFallback, { muteHttpExceptions: true });
    }
    
    if (response.getResponseCode() === 200) {
      var base64 = Utilities.base64Encode(response.getContent());
      return createJsonResponse({ status: "success", audio: base64 });
    } else {
      return createJsonResponse({ status: "error", message: "Google TTS returned HTTP " + response.getResponseCode() });
    }
  } catch(e) {
    return createJsonResponse({ status: "error", message: e.toString() });
  }
}


// ============================================================
// CCDC: Danh sách nhân viên (dùng cho đồng bộ LocalStorage)
// ============================================================
function getEmployeeSheetMap() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(EMP_SHEET_NAME);
  if (!sheet) return { error: 'Không tìm thấy sheet "' + EMP_SHEET_NAME + '"' };
  var data = sheet.getDataRange().getValues();
  // Dòng 1 (data[0]) là tiêu đề merge — dòng 2 (data[1]) mới là header thật
  var HEADER_ROW = 1;
  var headers = data[HEADER_ROW].map(function(h) { return h.toString().trim(); });
  var idx = {
    msnv:   headers.indexOf(EMP_COL_MSNV),
    hoten:  headers.indexOf(EMP_COL_HOTEN),
    ca:     headers.indexOf(EMP_COL_CA),
    // Tìm cột quản lý theo pattern 'Sup/lead' — tự động thích nghi khi đổi tên tháng
    quanly: headers.findIndex(function(h) { return h.indexOf('Sup/lead') >= 0 || h.indexOf('Quản lý') >= 0; })
  };
  // Fallback theo vị trí cột thực tế đã xác nhận
  if (idx.msnv   < 0) idx.msnv   = 0;  // Cột A: ID
  if (idx.hoten  < 0) idx.hoten  = 1;  // Cột B: Họ và tên
  if (idx.ca     < 0) idx.ca     = 2;  // Cột C: Trạng thái
  if (idx.quanly < 0) idx.quanly = 4;  // Cột E: Sup/lead Tháng 5
  return { data: data, idx: idx, headers: headers, dataStart: HEADER_ROW + 1 };
}

function ccdcGetEmployees() {
  var map = getEmployeeSheetMap();
  if (map.error) return createJsonResponse({ status: 'error', message: map.error });
  var data = map.data; var idx = map.idx;
  var list = [];
  // Data bắt đầu từ dòng sau header (dataStart = 2)
  for (var i = map.dataStart; i < data.length; i++) {
    var msnv = (data[i][idx.msnv] || '').toString().trim();
    if (!msnv || msnv === 'ID') continue;
    // Parse tên quản lý: format "MSNV-Họ Tên" → lấy phần sau dấu '-'
    var rawQuanly = (data[i][idx.quanly] || '').toString().trim();
    var quanlyName = rawQuanly;
    if (rawQuanly.indexOf('-') > 0) {
      quanlyName = rawQuanly.substring(rawQuanly.indexOf('-') + 1).trim();
    }
    list.push({
      msnv:   msnv,
      hoten:  (data[i][idx.hoten]  || '').toString().trim(),
      ca:     (data[i][idx.ca]     || '').toString().trim(),
      quanly: quanlyName
    });
  }
  return createJsonResponse({ status: 'success', employees: list });
}

// ============================================================
// AI CHATBOT — Kỹ Sư Trưởng GHN Hưng Yên (Gemini 2.5 Flash)
// ============================================================
function handleAIChat(userMessage) {
  if (!GEMINI_API_KEY) {
    return createJsonResponse({ status: 'success', reply: 'Báo cáo Sếp, hệ thống AI chưa được kích hoạt. Sếp vào Project Settings → Script Properties → thêm GEMINI_API_KEY nhé!' });
  }

  // =====================================================================
  // BƯỚC 1: TRA CỨU NHÂN VIÊN THÔNG MINH (Real-time từ Google Sheet)
  // =====================================================================
  var employeeContext = '';
  var msg = userMessage.toLowerCase();

  // Từ khóa kích hoạt tra cứu nhân viên
  var lookupKeywords = ['tra mã', 'tra cứu', 'tìm nhân viên', 'mã nv', 'msnv', 'nhân viên mã',
    'quản lý của', 'ca của', 'ai quản lý', 'thuộc team', 'thuộc nhóm', 'ai là trưởng'];
  var hasMsnv = /\b\d{7}\b/.test(userMessage); // Mã NV GHN: 7 chữ số
  var hasLookupIntent = hasMsnv || lookupKeywords.some(function(k) { return msg.indexOf(k) >= 0; });

  if (hasLookupIntent) {
    try {
      var map = getEmployeeSheetMap();
      if (!map.error) {
        var data = map.data;
        var idx = map.idx;
        var found = [];

        // Lấy tất cả mã NV 7 chữ số xuất hiện trong câu hỏi
        var msnvList = userMessage.match(/\b\d{7}\b/g) || [];

        for (var i = map.dataStart; i < data.length; i++) {
          var empMsnv = (data[i][idx.msnv] || '').toString().trim();
          var empHoten = (data[i][idx.hoten] || '').toString().trim();
          if (!empMsnv || empMsnv === 'ID') continue;

          var matched = false;
          // Ưu tiên: match theo mã NV
          if (msnvList.length > 0) {
            for (var m = 0; m < msnvList.length; m++) {
              if (empMsnv === msnvList[m]) { matched = true; break; }
            }
          }

          if (matched) {
            var rawQ = (data[i][idx.quanly] || '').toString().trim();
            var quanlyName = rawQ.indexOf('-') > 0 ? rawQ.substring(rawQ.indexOf('-') + 1).trim() : rawQ;
            found.push({
              msnv: empMsnv,
              hoten: empHoten,
              trangthai: (data[i][idx.ca] || '').toString().trim(),
              quanly: quanlyName
            });
            if (found.length >= 10) break;
          }
        }

        if (found.length > 0) {
          employeeContext = '\n\n=== DỮ LIỆU NHÂN VIÊN REAL-TIME TỪ HỆ THỐNG ===\n';
          for (var f = 0; f < found.length; f++) {
            employeeContext += '• MSNV: ' + found[f].msnv +
              ' | Họ tên: ' + found[f].hoten +
              ' | Trạng thái: ' + found[f].trangthai +
              ' | Quản lý trực tiếp: ' + (found[f].quanly || 'Chưa có thông tin') + '\n';
          }
          employeeContext += '=== KẾT THÚC DỮ LIỆU NHÂN VIÊN ===';
        } else if (hasMsnv) {
          employeeContext = '\n\n=== TRA CỨU NHÂN VIÊN ===\nKhông tìm thấy nhân viên nào khớp với mã ' + (userMessage.match(/\b3\d{6}\b/g) || []).join(', ') + ' trong hệ thống.\n===';
        }
      }
    } catch(e) {
      employeeContext = '\n\n[Lưu ý: Không thể truy xuất dữ liệu nhân viên lúc này]';
    }
  }

  // =====================================================================
  // BƯỚC 2: DỮ LIỆU KHO + SYSTEM PROMPT
  // =====================================================================
  var khoData = 'BÁO CÁO DATA TỔNG HỢP DỰ ÁN KHO TRUNG CHUYỂN GHN - HƯNG YÊN (GIAI ĐOẠN 1)\n' +
    'Tên dự án: Trung tâm Phân loại, Đóng gói GHN-Hưng Yên (Giai đoạn 1)\n' +
    'Địa điểm: Lô B11, B12, B13, B24, B25, B26 - KCN số 03, Xã Xuân Trúc, Tỉnh Hưng Yên.\n\n' +
    '1. Thông tin quy mô:\n' +
    '- Tổng diện tích đất dự án: 85.500 m2 (8.55 ha).\n' +
    '- Diện tích Sorting Building: 25.382 m2.\n' +
    '- Khu Inbound/Outbound: Khu 1 (27 xe tải, 20 container), Khu 2 (42 xe tải, 17 container, 19 xe tải).\n\n' +
    '2. Hạ tầng kỹ thuật:\n' +
    '- Móng: Cọc PHC D300-180 (12-13m). Móng điển hình 1500x1500x800mm.\n' +
    '- Cột 300x400mm, thép chủ 8D20. Khoảng cách cột: Dọc 7.5m, Ngang 6m.\n' +
    '- Dầm: 300x600mm, thép chủ 4D20.\n' +
    '- Cửa Dock leveler: 6 cửa (7x5m), 2 cửa (7.5x3m), 1 cửa (16.5x3m).\n\n' +
    '3. Thiết bị CCDC chủ lực:\n' +
    '- PDA Zebra: 250 cái (hoạt động: 210, sửa: 40).\n' +
    '- Xe nâng điện Toyota: 12 xe (hoạt động: 10, bảo trì: 2).\n' +
    '- Xe nâng tay OPK: 45 xe. Lồng hàng xanh navy: 1.200 lồng.\n\n' +
    '4. Nhân sự:\n' +
    '- Tổng: 420 người. Ca 1 (06-14h): 110 NV - TC Nguyễn Hoàng Nam.\n' +
    '- Ca 2 (14-22h): 140 NV - TC Trần Quốc Anh. Ca 3 (22-06h): 170 NV - TC Lê Minh Trí.\n' +
    '- Ban QL: 15 người. Phó phòng KTC: Nguyễn Văn Bảo.\n\n' +
    '5. Các SOP chính:\n' +
    '- SOP-01: Xử lý sự cố thiết bị (RCA 5-Why), lập biên bản trong 15 phút.\n' +
    '- SOP-02: Kiểm tra hạ tầng an toàn đầu mỗi ca.\n' +
    '- SOP-03: Giao nhận CCDC < 3 giây/giao dịch bằng QR.\n\n' +
    '6. Dự án đang triển khai:\n' +
    '- SPARK (tự động hóa băng chuyền): 85% hoàn thành.\n' +
    '- Nâng cấp PCCC: đang nghiệm thu pha 2, hoàn thành dự kiến 25/08/2026.\n' +
    '- Xanh hóa KTC (tái sử dụng màng co): giảm 18% rác thải nhựa tại Ca 2.';

  var systemPrompt = 'Bạn là Kỹ sư trưởng đầy kinh nghiệm chuyên quản lý hạ tầng và vận hành logistics của Giao Hàng Nhanh (GHN).\n' +
    'Nhiệm vụ: tư vấn, giải đáp mọi vấn đề kỹ thuật, vận hành kho bãi, máy móc, và quản lý nhân sự.\n' +
    'Khi hỏi về KTC Hưng Yên, tham khảo dữ liệu sau:\n--- DỮ LIỆU KHO HƯNG YÊN ---\n' + khoData + '\n---\n' +
    'Khi có DỮ LIỆU NHÂN VIÊN REAL-TIME ở dưới, hãy dùng chính xác dữ liệu đó để trả lời, không tự bịa thêm.\n' +
    'Quy tắc giao tiếp: xưng "Tôi", gọi người dùng là "Sếp". Trả lời súc tích, gãy gọn, dùng Markdown.' +
    employeeContext;

  // =====================================================================
  // BƯỚC 3: GỌI GEMINI API
  // =====================================================================
  var payload = {
    'contents': [{ 'role': 'user', 'parts': [{ 'text': systemPrompt + '\n\nSếp hỏi: ' + userMessage }] }],
    'generationConfig': { 'temperature': 0.3 }
  };
  var options = { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(payload), 'muteHttpExceptions': true };

  try {
    var response = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY, options);
    var json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates.length > 0) {
      return createJsonResponse({ status: 'success', reply: json.candidates[0].content.parts[0].text });
    }
    var errMsg = json.error ? (json.error.message || json.error).toString() : 'Lỗi không xác định.';
    if (errMsg.indexOf('Quota exceeded') !== -1 || errMsg.indexOf('rate-limit') !== -1) {
      return createJsonResponse({ status: 'success', reply: 'Sếp hỏi nhanh quá, hệ thống chưa kịp phản hồi (giới hạn 15 câu/phút). Sếp đợi 5-10 giây rồi hỏi lại nhé!' });
    }
    return createJsonResponse({ status: 'success', reply: 'Lỗi API Gemini: ' + errMsg });
  } catch (error) {
    return createJsonResponse({ status: 'success', reply: 'Lỗi hệ thống AI: ' + error.toString() });
  }
}

// ============================================================
// CCDC ALERT: NHẮC NHỞ THU HỒI THIẾT BỊ QUA TELEGRAM
// Trigger: Cài Time-driven trigger mỗi 1 giờ cho hàm này
// ============================================================

/**
 * Parse chuỗi timestamp dạng "dd/MM/yyyy HH:mm:ss" thành Date object
 */
function parseGiaoTimestamp(ts) {
  try {
    var parts = ts.trim().split(' ');
    var d = parts[0].split('/');
    var t = (parts[1] || '0:0:0').split(':');
    return new Date(
      parseInt(d[2]), parseInt(d[1]) - 1, parseInt(d[0]),
      parseInt(t[0]), parseInt(t[1]), parseInt(t[2] || '0')
    );
  } catch(e) { return null; }
}

/**
 * Tìm Telegram Chat ID của user theo Họ Tên trong Sheet "Tài khoản"
 * Sheet "Tài khoản": col C (index 2) = Họ Tên, col G (index 6) = Telegram Chat ID
 */
function getChatIdByName(authData, name) {
  var trimmedName = (name || '').trim();
  for (var i = 1; i < authData.length; i++) {
    if (authData[i][2].toString().trim() === trimmedName) {
      var chatId = authData[i][6] ? authData[i][6].toString().trim() : '';
      return chatId;
    }
  }
  return '';
}

/**
 * Kiểm tra và gửi nhắc nhở thu hồi thiết bị PDA/Xe nâng qua Telegram.
 * Chỉ nhắc khi: đã quá 12 giờ từ lúc giao, chưa thu hồi, chưa tắt cảnh báo.
 * Nhắc lại mỗi 4 giờ nếu vẫn chưa thu hồi.
 *
 * *** ĐỂ KÍCH HOẠT: vào Apps Script → Triggers → Add Trigger ***
 *   Function: checkOverdueDevices
 *   Event source: Time-driven
 *   Type: Hour timer → Every 1 hour
 */
function checkOverdueDevices() {
  var ALERT_DEVICES   = /PDA|Xe\s*n\u00e2ng/i;   // Chỉ nhắc PDA và Xe nâng
  var FIRST_ALERT_H   = 12;    // Nhắc lần đầu sau 12 giờ
  var REPEAT_ALERT_H  = 4;     // Nhắc lại mỗi 4 giờ tiếp theo

  var ss        = getSpreadsheet();
  var giaoSheet = ccdcGetOrCreateGiaoSheet(ss);
  var giaoData  = giaoSheet.getDataRange().getValues();
  var authSheet = getAuthSheet();
  var authData  = authSheet.getDataRange().getValues();

  var now = new Date();
  var sent = 0;

  for (var i = 1; i < giaoData.length; i++) {
    var row = giaoData[i];
    if (!row[1]) continue;                                        // Hàng trống

    // === Điều kiện loại trừ ===
    if (row[7].toString() === 'true') continue;                   // Đã thu hồi
    if ((row[13] || '').toString().toLowerCase() === 'true') continue; // Tắt cảnh báo thủ công

    // Chỉ áp dụng PDA và Xe nâng
    var tenThietBi = row[6].toString();
    if (!ALERT_DEVICES.test(tenThietBi)) continue;

    // === Tính giờ đã trôi ===
    var giaoTime = parseGiaoTimestamp(row[0].toString());
    if (!giaoTime) continue;
    var hoursElapsed = (now.getTime() - giaoTime.getTime()) / 3600000;
    if (hoursElapsed < FIRST_ALERT_H) continue;                   // Chưa đến 12 giờ

    // === Kiểm tra lần nhắc cuối ===
    var lastNhacRaw = row[12] ? row[12].toString().trim() : '';
    if (lastNhacRaw) {
      var lastNhacMs = parseInt(lastNhacRaw);
      if (!isNaN(lastNhacMs)) {
        var hoursSinceLast = (now.getTime() - lastNhacMs) / 3600000;
        if (hoursSinceLast < REPEAT_ALERT_H) continue;            // Chưa đến 4 giờ
      }
    }

    // === Tìm Chat ID người bắn giao ===
    var nguoiThaoTac = row[11] ? row[11].toString() : '';
    var chatId = getChatIdByName(authData, nguoiThaoTac);
    if (!chatId) continue;                                         // Không có Telegram

    // === Tính giờ + phút đã trôi ===
    var totalMin = Math.floor((now.getTime() - giaoTime.getTime()) / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;

    // === Nội dung tin nhắn ===
    var msg = '\u26a0\ufe0f *NH\u1eaec NH\u1ede THU H\u1ed2I THI\u1ebeT B\u1eca*\n\n'
      + '\ud83d\udce6 Thi\u1ebft b\u1ecb: *' + row[5] + '* \u2014 ' + tenThietBi + '\n'
      + '\ud83d\udc64 Nh\u00e2n vi\u00ean: ' + row[2] + ' (' + row[1] + ')\n'
      + '\ud83d\udc54 Qu\u1ea3n l\u00fd TT: *' + (row[4] || 'Ch\u01b0a c\u00f3') + '*\n'
      + '\ud83d\udd57 Giao l\u00fac: ' + row[0].toString().substring(0, 16) + '\n'
      + '\u23f1 \u0110\u00e3 qu\u00e1: *' + h + ' gi\u1edd ' + m + ' ph\u00fat*\n\n'
      + 'Vui l\u00f2ng ki\u1ec3m tra v\u00e0 thu h\u1ed3i thi\u1ebft b\u1ecb.\n'
      + '\ud83d\udd15 T\u1eaft nh\u1eafc: V\u00e0o CCDC Report trong app.';

    sendTelegramMessage(chatId, msg);

    // === Ghi lại thời gian nhắc gần nhất (col M = index 12) ===
    giaoSheet.getRange(i + 1, 13).setValue(now.getTime().toString());
    sent++;
  }

  Logger.log('[CCDC Alert] \u0110\u00e3 g\u1eedi ' + sent + ' nh\u1eafc nh\u1edf l\u00fac ' + now.toString());
}

/**
 * Tắt cảnh báo thủ công cho 1 bản ghi trong CCDC_Giao.
 * rowIndex = data array index (i), sheet row = rowIndex + 1.
 */
function handleMuteAlert(rowIndex) {
  if (!rowIndex || rowIndex < 1) {
    return createJsonResponse({ status: 'error', message: 'Row index không hợp lệ!' });
  }
  var ss    = getSpreadsheet();
  var sheet = ccdcGetOrCreateGiaoSheet(ss);
  var data  = sheet.getDataRange().getValues();
  if (rowIndex >= data.length) {
    return createJsonResponse({ status: 'error', message: 'Không tìm thấy bản ghi!' });
  }
  // Kiểm tra đã thu hồi chưa (không cần tắt nếu đã thu hồi)
  if (data[rowIndex][7].toString() === 'true') {
    return createJsonResponse({ status: 'error', message: 'Thiết bị đã được thu hồi, không cần tắt cảnh báo.' });
  }
  sheet.getRange(rowIndex + 1, 14).setValue('true'); // col N = Tắt Cảnh Báo
  return createJsonResponse({ status: 'success', message: 'Đã tắt cảnh báo nhắc nhở cho thiết bị này!' });
}


// ============================================================
// ONE-TIME SETUP — Tự động hoá sau khi Deploy
// Gọi: ?action=setup_system&secret=INIT_GHN_2026
// Chỉ chạy 1 lần, sau đó khoá lại tự động.
// ============================================================

function handleSetupSystem(secret) {
  var SETUP_SECRET = 'INIT_GHN_2026';
  if (secret !== SETUP_SECRET) {
    return createJsonResponse({ status: 'error', message: 'Sai secret key!' });
  }
  // Cho phép chạy lại bằng cách xoá flag cũ (lần đầu luôn pass)
  scriptProperties.deleteProperty('setup_done');
  try {
    var log = setupSystem();
    scriptProperties.setProperty('setup_done', 'true');
    return createJsonResponse({ status: 'success', message: 'Setup hoàn tất!', log: log });
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Lỗi setup: ' + e.toString() });
  }
}


/**
 * Tự động hoá toàn bộ setup sau deploy:
 * 1. Đặt boss_password mới
 * 2. Cài Time Trigger cho checkOverdueDevices (1h/lần)
 * 3. Thêm cột M & N vào CCDC_Giao (nếu chưa có)
 * 4. Xóa toàn bộ dữ liệu cũ trong CCDC_Giao và CCDC_Nhan
 */
function setupSystem() {
  var log = [];

  // === 1. Đặt boss_password ===
  scriptProperties.setProperty('boss_password', 'QNhi@6789!');
  log.push('✅ boss_password đã cập nhật');

  // === 2. Cài Time Trigger ===
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var t = 0; t < triggers.length; t++) {
      if (triggers[t].getHandlerFunction() === 'checkOverdueDevices') {
        ScriptApp.deleteTrigger(triggers[t]);
        log.push('🗑️ Đã xoá trigger cũ checkOverdueDevices');
      }
    }
    ScriptApp.newTrigger('checkOverdueDevices')
      .timeBased()
      .everyHours(1)
      .create();
    log.push('✅ Time Trigger checkOverdueDevices (1h) đã cài');
  } catch(triggerErr) {
    log.push('⚠️ Trigger cần cài thủ công: ' + triggerErr.message);
  }


  // === 3. Thêm cột M & N vào CCDC_Giao nếu chưa có ===
  var ss = getSpreadsheet();
  var giaoSheet = ss.getSheetByName('CCDC_Giao');
  if (giaoSheet) {
    var headers = giaoSheet.getRange(1, 1, 1, giaoSheet.getLastColumn()).getValues()[0];
    var hasNhac = headers.indexOf('Thời Gian Nhắc') >= 0;
    var hasTat  = headers.indexOf('Tắt Cảnh Báo')  >= 0;
    if (!hasNhac) {
      giaoSheet.getRange(1, 13).setValue('Thời Gian Nhắc');
      giaoSheet.getRange(1, 13).setFontWeight('bold').setBackground('#f26522').setFontColor('white');
      log.push('✅ Đã thêm cột M (Thời Gian Nhắc) vào CCDC_Giao');
    } else {
      log.push('ℹ️ Cột M (Thời Gian Nhắc) đã tồn tại');
    }
    if (!hasTat) {
      giaoSheet.getRange(1, 14).setValue('Tắt Cảnh Báo');
      giaoSheet.getRange(1, 14).setFontWeight('bold').setBackground('#f26522').setFontColor('white');
      log.push('✅ Đã thêm cột N (Tắt Cảnh Báo) vào CCDC_Giao');
    } else {
      log.push('ℹ️ Cột N (Tắt Cảnh Báo) đã tồn tại');
    }

    // === 4. Xoá dữ liệu cũ CCDC_Giao (giữ header row 1) ===
    var lastRow = giaoSheet.getLastRow();
    if (lastRow > 1) {
      giaoSheet.deleteRows(2, lastRow - 1);
      log.push('✅ Đã xoá ' + (lastRow - 1) + ' dòng dữ liệu cũ trong CCDC_Giao');
    } else {
      log.push('ℹ️ CCDC_Giao không có dữ liệu cũ cần xoá');
    }
  } else {
    // Sheet chưa tồn tại → tạo mới (ccdcGetOrCreateGiaoSheet sẽ tự thêm đủ cột)
    ccdcGetOrCreateGiaoSheet(ss);
    log.push('✅ Tạo mới sheet CCDC_Giao (đủ 14 cột)');
  }

  // === 5. Xoá dữ liệu cũ CCDC_Nhan (giữ header) ===
  var nhanSheet = ss.getSheetByName('CCDC_Nhan');
  if (nhanSheet) {
    var lastNhan = nhanSheet.getLastRow();
    if (lastNhan > 1) {
      nhanSheet.deleteRows(2, lastNhan - 1);
      log.push('✅ Đã xoá ' + (lastNhan - 1) + ' dòng dữ liệu cũ trong CCDC_Nhan');
    } else {
      log.push('ℹ️ CCDC_Nhan không có dữ liệu cũ');
    }
  } else {
    ccdcGetOrCreateNhanSheet(ss);
    log.push('✅ Tạo mới sheet CCDC_Nhan');
  }

  log.push('🚀 Setup hoàn tất lúc ' + new Date().toString());
  return log;
}


