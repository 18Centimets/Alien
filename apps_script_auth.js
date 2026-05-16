/**
 * ĐOẠN CODE NÀY DÙNG ĐỂ DÁN VÀO GOOGLE APPS SCRIPT
 * Hãy chép đè hoặc thêm vào file Apps Script hiện tại của mày.
 */

function doGet(e) {
  var action = e.parameter.action;
  
  // 1. Nếu action là Đăng nhập
  if (action === 'login') {
    return handleLogin(e.parameter.username, e.parameter.password);
  }
  
  // 2. Nếu action là Đăng ký
  if (action === 'register') {
    return handleRegister(e.parameter.fullname, e.parameter.username, e.parameter.password);
  }
  
  // 3. Nếu không có action, trả về dữ liệu Dashboard (Code cũ của mày)
  // ... (Phần code cũ trả về JSON của Dashboard)
  return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid action" })).setMimeType(ContentService.MimeType.JSON);
}

function getAuthSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Tài khoản");
  
  // Tự động tạo Tab nếu chưa có
  if (!sheet) {
    sheet = ss.insertSheet("Tài khoản");
    sheet.appendRow(["Tên đăng nhập", "Mật khẩu", "Họ Tên", "Trạng thái", "Phân quyền"]);
    // Tạo sẵn tài khoản Admin mặc định
    sheet.appendRow(["admin", "ghn2026", "Quản Trị Viên", "Đã duyệt", "admin"]);
  }
  return sheet;
}

function handleLogin(username, password) {
  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    var rowUser = data[i][0];
    var rowPass = data[i][1];
    var rowStatus = data[i][3];
    var rowRole = data[i][4];
    
    if (rowUser === username && rowPass === password) {
      if (rowStatus === "Đã duyệt") {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          role: rowRole || 'user',
          message: 'Đăng nhập thành công'
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Tài khoản đang chờ duyệt!'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'error',
    message: 'Sai tên đăng nhập hoặc mật khẩu!'
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleRegister(fullname, username, password) {
  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  
  // Kiểm tra trùng lặp
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Tên đăng nhập đã tồn tại!'
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // Thêm user mới
  sheet.appendRow([username, password, fullname, "Chờ duyệt", "user"]);
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'Đăng ký thành công, chờ phê duyệt.'
  })).setMimeType(ContentService.MimeType.JSON);
}
