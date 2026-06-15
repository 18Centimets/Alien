/**
 * ĐOẠN CODE NÀY DÙNG ĐỂ DÁN VÀO GOOGLE APPS SCRIPT
 * Hãy chép đè vào file Apps Script hiện tại của bạn và Deploy lại (New Deployment).
 */

var scriptProperties = PropertiesService.getScriptProperties();
var TELEGRAM_BOT_TOKEN = scriptProperties.getProperty('TELEGRAM_BOT_TOKEN');
if (!TELEGRAM_BOT_TOKEN) {
  // Tự động gán fallback để duy trì tính hoạt động ban đầu
  scriptProperties.setProperty('TELEGRAM_BOT_TOKEN', '8690867509:AAF3M1JamzUJ4jYhDIeWYlpSGnmkUIdciQc');
  TELEGRAM_BOT_TOKEN = '8690867509:AAF3M1JamzUJ4jYhDIeWYlpSGnmkUIdciQc';
}

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
  if (action === 'google_login') return handleGoogleAuth(e.parameter.email);
  if (action === 'request_otp') return handleRequestOTP(e.parameter.msnv);
  if (action === 'verify_otp') return handleVerifyOTP(e.parameter.msnv, e.parameter.otp);
  if (action === 'verify_session') return handleVerifySession(e.parameter.msnv, e.parameter.role);
  if (action === 'submit_chatid') return handleSubmitChatID(e.parameter.msnv, e.parameter.chatid);
  if (action === 'register') return handleRegister(e.parameter.fullname, e.parameter.msnv, e.parameter.password, e.parameter.phone, e.parameter.chatid);
  
  // APIs cho Quản lý nhân sự
  if (action === 'get_users') return handleGetUsers();
  if (action === 'create_user') return handleCreateUser(e.parameter.msnv, e.parameter.password, e.parameter.fullname, e.parameter.role, e.parameter.chatid, e.parameter.permissions);
  if (action === 'update_user') return handleUpdateUser(e.parameter.msnv, e.parameter.password, e.parameter.fullname, e.parameter.role, e.parameter.chatid, e.parameter.permissions, e.parameter.status);
  if (action === 'delete_user') return handleDeleteUser(e.parameter.msnv);

  // APIs cho CCDC Quản Lý Thiết Bị
  if (action === 'lookup_employee')  return ccdcLookupEmployee(e.parameter.msnv);
  if (action === 'lookup_borrowed')  return ccdcLookupBorrowed(e.parameter.msnv);
  if (action === 'submit_giao')      return ccdcSubmitGiao(e.parameter);
  if (action === 'submit_nhan')      return ccdcSubmitNhan(e.parameter);
  if (action === 'get_today_log')    return ccdcGetTodayLog();
  if (action === 'ccdc_get_all_logs') return ccdcGetAllLogs();
  if (action === 'debug_headers')    return ccdcDebugHeaders(); // tạm thời để fix tên cột
  if (action === 'tts')              return handleTts(e.parameter.text);


  return createJsonResponse({ status: "error", message: "Invalid action" });
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getAuthSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
  // Backdoor Super Admin - Không cần OTP, ẩn danh
  if (msnv === 'BOSS001' && password === 'boss123') {
    return createJsonResponse({
      status: 'bypass_otp',
      msnv: 'BOSS001',
      role: 'admin',
      fullname: 'Super Admin',
      permissions: 'overview,post-offices,trends,materials,forklifts,infra-health,purchases,transport-map,ccdc-device,ccdc-report,user-management',
      message: 'Đăng nhập Super Admin thành công!'
    });
  }

  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === msnv && data[i][1].toString() === password) {
      if (data[i][4].toString() === "Đã duyệt") {
        return createJsonResponse({ status: 'success', msnv: data[i][0].toString(), message: 'Xác thực thành công. Vui lòng xác thực OTP.' });
      } else {
        return createJsonResponse({ status: 'error', message: 'Tài khoản đang bị khóa!' });
      }
    }
  }
  return createJsonResponse({ status: 'error', message: 'Sai MSNV hoặc mật khẩu!' });
}

function handleGoogleAuth(email) {
  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][3].toString().toLowerCase() === email.toLowerCase()) {
      if (data[i][4].toString() === "Đã duyệt") {
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
    return createJsonResponse({
      status: 'success',
      role: 'admin',
      permissions: 'overview,post-offices,trends,materials,forklifts,infra-health,purchases,transport-map,ccdc-device,ccdc-report,user-management',
      message: 'Đăng nhập thành công!'
    });
  }

  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  var currentTime = new Date().getTime();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === msnv) {
      if (data[i][7].toString() === otp) {
        if (currentTime > parseInt(data[i][8])) return createJsonResponse({ status: 'error', message: 'Mã OTP đã hết hạn!' });
        
        sheet.getRange(i + 1, 8).clearContent();
        sheet.getRange(i + 1, 9).clearContent();
        
        return createJsonResponse({
          status: 'success',
          role: data[i][5].toString(),
          permissions: data[i][9] ? data[i][9].toString() : "overview",
          message: 'Đăng nhập thành công!'
        });
      } else {
        return createJsonResponse({ status: 'error', message: 'Mã OTP không chính xác!' });
      }
    }
  }
  return createJsonResponse({ status: 'error', message: 'Xác thực thất bại.' });
}

function handleVerifySession(msnv, role) {
  if (!msnv) return createJsonResponse({ status: 'error', message: 'Thiếu MSNV' });
  if (msnv === 'BOSS001') {
    return createJsonResponse({
      status: 'success',
      role: 'admin',
      permissions: 'overview,post-offices,trends,materials,forklifts,infra-health,purchases,transport-map,ccdc-device,ccdc-report,user-management'
    });
  }

  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === msnv) {
      if (data[i][4].toString() === "Đã duyệt") {
        return createJsonResponse({
          status: 'success',
          role: data[i][5].toString(),
          permissions: data[i][9] ? data[i][9].toString() : "overview"
        });
      } else {
        return createJsonResponse({ status: 'error', message: 'Tài khoản đang bị khóa!' });
      }
    }
  }
  return createJsonResponse({ status: 'error', message: 'Phiên đăng nhập không tồn tại!' });
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

function handleGetUsers() {
  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  var users = [];
  for (var i = 1; i < data.length; i++) {
    var msnvVal = data[i][0].toString();
    if (msnvVal === 'BOSS001') continue; // Ẩn hoàn toàn tài khoản này khỏi Admin
    users.push({
      msnv: msnvVal,
      fullname: data[i][2].toString(),
      status: data[i][4].toString() === "Đã duyệt" ? "active" : data[i][4].toString() === "Chờ duyệt" ? "pending" : "locked",
      role: data[i][5].toString(),
      chatid: data[i][6].toString(),
      permissions: data[i][9] ? data[i][9].toString().split(',') : ['overview']
    });
  }
  return createJsonResponse({ status: 'success', data: users });
}

function handleCreateUser(msnv, password, fullname, role, chatid, permissions) {
  if (msnv === 'BOSS001') {
    return createJsonResponse({ status: 'error', message: 'MSNV đã tồn tại!' }); // Ngăn tạo đè
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = getAuthSheet();
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === msnv) return createJsonResponse({ status: 'error', message: 'MSNV đã tồn tại!' });
    }
    sheet.appendRow([msnv, password || "123456", fullname, "", "Đã duyệt", role, chatid, "", "", permissions || "overview"]);
    return createJsonResponse({ status: 'success', message: 'Tạo tài khoản thành công!' });
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Hệ thống bận, vui lòng thử lại sau.' });
  } finally {
    lock.releaseLock();
  }
}

function handleUpdateUser(msnv, password, fullname, role, chatid, permissions, status) {
  if (msnv === 'BOSS001') {
    return createJsonResponse({ status: 'error', message: 'Không tìm thấy MSNV!' }); // Giả vờ không tồn tại
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = getAuthSheet();
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === msnv) {
        var row = i + 1;
        if (password && password !== 'null' && password !== 'undefined') sheet.getRange(row, 2).setValue(password);
        if (fullname && fullname !== 'null') sheet.getRange(row, 3).setValue(fullname);
        if (status && status !== 'null') sheet.getRange(row, 5).setValue(status === 'active' ? "Đã duyệt" : "Khóa");
        if (role && role !== 'null') sheet.getRange(row, 6).setValue(role);
        if (chatid && chatid !== 'null') sheet.getRange(row, 7).setValue(chatid);
        if (permissions && permissions !== 'null') sheet.getRange(row, 10).setValue(permissions);
        return createJsonResponse({ status: 'success', message: 'Cập nhật thành công!' });
      }
    }
    return createJsonResponse({ status: 'error', message: 'Không tìm thấy MSNV!' });
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Hệ thống bận, vui lòng thử lại sau.' });
  } finally {
    lock.releaseLock();
  }
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
function handleDeleteUser(msnv) {
  if (msnv === 'ADMIN001' || msnv === 'BOSS001') return createJsonResponse({ status: 'error', message: 'Không thể xóa tài khoản này!' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = getAuthSheet();
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === msnv) {
        sheet.deleteRow(i + 1);
        return createJsonResponse({ status: 'success', message: 'Xóa tài khoản thành công!' });
      }
    }
    return createJsonResponse({ status: 'error', message: 'Không tìm thấy MSNV!' });
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Hệ thống bận, vui lòng thử lại sau.' });
  } finally {
    lock.releaseLock();
  }
}


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
var CCDC_COL_CA      = 'Ca làm việc đăng ký';
var CCDC_COL_QUANLY  = 'Sup/lead Tháng 5'; // Cột E — quản lý trực tiếp


// Đọc sheet nhân viên và tạo bản đồ index cột theo tên header
function ccdcGetEmpMap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
    quanly: headers.indexOf(CCDC_COL_QUANLY)
  };
  // Fallback hardcode theo vị trí thực tế đã xác nhận
  if (idx.msnv   < 0) idx.msnv   = 0;  // ID
  if (idx.hoten  < 0) idx.hoten  = 1;  // Họ và tên
  if (idx.ca     < 0) idx.ca     = 3;  // Ca làm việc đăng ký
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ccdcGetOrCreateGiaoSheet(ss);
    var ts = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
    sheet.appendRow([ts, msnv, hoten, ca, quanly, ma, ten, 'false', '', '', ghi, nguoi_thao_tac]);
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
    var ss = SpreadsheetApp.getActiveSpreadsheet();
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


// API: Log giao dịch hôm nay
function ccdcGetTodayLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ccdcGetOrCreateGiaoSheet(ss);
  var data = sheet.getDataRange().getValues();
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');
  var log = [];
  for (var i = data.length - 1; i >= 1; i--) {
    if ((data[i][0]||'').toString().substring(0,10) === today) {
      log.push({
        timestamp:       data[i][0].toString(),
        msnv:            data[i][1].toString(),
        hoten:           data[i][2].toString(),
        ca:              data[i][3].toString(),
        ma_thiet_bi:     data[i][5].toString(),
        ten_thiet_bi:    data[i][6].toString(),
        da_thu_hoi:      data[i][7].toString() === 'true',
        thu_hoi_luc:     data[i][8].toString(),
        tinh_trang:      data[i][9].toString(),
        nguoi_thao_tac:  data[i][11] ? data[i][11].toString() : ''
      });
    }
    if (log.length >= 50) break;
  }
  return createJsonResponse({ status: 'success', log: log });
}


// API: Lấy toàn bộ lịch sử giao nhận CCDC thiết bị
function ccdcGetAllLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ccdcGetOrCreateGiaoSheet(ss);
  var data = sheet.getDataRange().getValues();
  var log = [];
  // Quét từ dòng mới nhất lên dòng đầu tiên (bỏ qua dòng tiêu đề index 0)
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    if (row[1]) { // Kiểm tra nếu có Mã NV (không phải hàng trống)
      log.push({
        timestamp:       row[0] ? row[0].toString() : '',
        msnv:            row[1] ? row[1].toString() : '',
        hoten:           row[2] ? row[2].toString() : '',
        ca:              row[3] ? row[3].toString() : '',
        quanly:          row[4] ? row[4].toString() : '',
        ma_thiet_bi:     row[5] ? row[5].toString() : '',
        ten_thiet_bi:    row[6] ? row[6].toString() : '',
        da_thu_hoi:      row[7].toString() === 'true',
        thu_hoi_luc:     row[8] ? row[8].toString() : '',
        tinh_trang:      row[9] ? row[9].toString() : '',
        ghi_chu:         row[10] ? row[10].toString() : '',
        nguoi_thao_tac:  row[11] ? row[11].toString() : ''
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
    sheet.appendRow(['Thời Gian Giao','Mã NV','Họ Tên','Ca Làm Việc','Quản Lý','Mã Thiết Bị','Tên Thiết Bị','Đã Thu Hồi','Thời Gian Thu Hồi','Tình Trạng','Ghi Chú','Người Thao Tác']);
    sheet.getRange(1,1,1,12).setFontWeight('bold').setBackground('#f26522').setFontColor('white');
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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


