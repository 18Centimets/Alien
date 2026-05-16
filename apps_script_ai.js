var GEMINI_API_KEY = "ĐIỀN_API_KEY_MỚI_CỦA_MÀY_VÀO_ĐÂY"; // LƯU Ý: KHÔNG PUSH KEY LÊN GITHUB NỮA NHÉ

function doGet(e) {
  var action = e ? e.parameter.action : null;
  if (action === 'chat') return handleAIChat(e.parameter.message);
  if (action === 'login') return handleLogin(e.parameter.username, e.parameter.password);
  if (action === 'register') return handleRegister(e.parameter.fullname, e.parameter.username, e.parameter.password);
  
  // Trả về dữ liệu cho Dashboard
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = {
      allocations: getAllocationsData(ss),
      forkliftLogs: getForkliftLogsData(ss),
      infraHealth: getInfraHealthData(ss),
      updated: new Date().toISOString()
    };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleAIChat(userMessage) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "ĐIỀN_API_KEY_CỦA_MÀY_VÀO_ĐÂY") {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", reply: "Báo cáo sếp, hệ thống AI chưa được kích hoạt." })).setMimeType(ContentService.MimeType.JSON);
  }

  var khoData = "" +
"BÁO CÁO DATA TỔNG HỢP DỰ ÁN KHO TRUNG CHUYỂN GHN - HƯNG YÊN (GIAI ĐOẠN 1)\n" +
"Tên dự án: Trung tâm Phân loại, Đóng gói GHN-Hưng Yên (Giai đoạn 1)\n" +
"Địa điểm: Lô B11, B12, B13, B24, B25, B26 thuộc Bản đồ quy hoạch sử dụng đất KCN số 03, Xã Xuân Trúc, Tỉnh Hưng Yên.\n" +
"\n" +
"1. Thông tin quy mô:\n" +
"- Tổng diện tích đất dự án: 85.500 m2 (8.55 ha).\n" +
"- Diện tích xây dựng (footprint) tòa nhà phân loại chính (Sorting Building): 25.382 m2.\n" +
"- Khu vực Inbound/Outbound: Có các khu vực bốc dỡ sức chứa lớn (Khu 1: 27 xe tải, 20 container; Khu 2: 42 xe tải, 17 container, 19 xe tải).\n" +
"\n" +
"2. Cột, khoảng cách cột, dầm, móng:\n" +
"- Móng: Cọc PHC D300-180 (dài 12-13m). Móng điển hình (F1) 1500x1500x800mm.\n" +
"- Cột: Điển hình 300x400mm, thép chủ 8D20, đai D8@150.\n" +
"- Khoảng cách cột: Dọc 7.5m, Ngang 6m.\n" +
"- Dầm: Điển hình 300x600mm, thép chủ 4D20 (trên/dưới).\n" +
"\n" +
"3. PCCC, Điện, Cửa Dock leveler:\n" +
"- PCCC: Có hệ thống giao thông PCCC bao quanh, bể nước ngầm nhưng chưa ghi nhận công suất bơm. Hệ thống XLNT 65 m3/ngày.\n" +
"- Điện: Trạm biến áp 6m x 4m (chưa ghi nhận công suất KVA).\n" +
"- Cửa Dock leveler (Cửa cuốn): Rất nhiều cửa lớn. 6 cửa (7m x 5m), 2 cửa (7.5m x 3m), 1 cửa khổng lồ (16.5m x 3m), 1 cửa (12.5m x 3m) và vài cửa nhỏ khác.\n";

  var systemPrompt = "Bạn là Kỹ sư trưởng đầy kinh nghiệm chuyên quản lý hạ tầng và vận hành logistics của Giao Hàng Nhanh (GHN).\n" +
"Nhiệm vụ của bạn là tư vấn, giải đáp mọi vấn đề về kỹ thuật, vận hành kho bãi, máy móc, và quản lý nhân sự cho Giám đốc.\n" +
"Bạn có thể trò chuyện tự nhiên, đưa ra giải pháp tối ưu hóa, tính toán chi phí, hoặc bất cứ điều gì Sếp yêu cầu.\n" +
"Nếu Sếp hỏi riêng về Kho trung chuyển Hưng Yên, hãy tham khảo bộ Dữ liệu bản vẽ thực tế sau đây:\n" +
"--- DỮ LIỆU KHO HƯNG YÊN ---\n" + khoData + "\n----------------------------\n" +
"Với các câu hỏi không liên quan đến Kho Hưng Yên, hãy dùng kiến thức chuyên môn bách khoa của bạn để tư vấn.\n" +
"Quy tắc giao tiếp: Luôn xưng 'Tôi' và gọi người dùng là 'Sếp'. Trả lời súc tích, gãy gọn, thông minh và mang đậm chất kỹ thuật thực chiến. Dùng Markdown để trình bày đẹp mắt.";
  
  var parts = [];
  parts.push({ "text": systemPrompt + "\n\nSếp hỏi: " + userMessage });

  var payload = { "contents": [{ "role": "user", "parts": parts }], "generationConfig": { "temperature": 0.3 } };
  var options = { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true };

  try {
    var response = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY, options);
    var json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates.length > 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", reply: json.candidates[0].content.parts[0].text })).setMimeType(ContentService.MimeType.JSON);
    } else {
      var errMsg = json.error ? (json.error.message || json.error).toString() : "Lỗi không xác định.";
      if (errMsg.indexOf("Quota exceeded") !== -1 || errMsg.indexOf("rate-limit") !== -1) {
          return ContentService.createTextOutput(JSON.stringify({ status: "success", reply: "Sếp hỏi nhanh quá máy chủ Google không phản hồi kịp (Giới hạn 15 câu/phút). Sếp đợi khoảng 5-10 giây rồi hỏi lại nhé!" })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success", reply: "Lỗi API: " + errMsg })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", reply: "Lỗi mạng: " + error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getAuthSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Tài khoản");
  if (!sheet) {
    sheet = ss.insertSheet("Tài khoản");
    sheet.appendRow(["Tên đăng nhập", "Mật khẩu", "Họ Tên", "Trạng thái", "Phân quyền"]);
    sheet.appendRow(["admin", "ghn2026", "Quản Trị Viên", "Đã duyệt", "admin"]);
  }
  return sheet;
}

function handleLogin(username, password) {
  var data = getAuthSheet().getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var sheetUser = data[i][0] ? data[i][0].toString().trim() : "";
    var sheetPass = data[i][1] ? data[i][1].toString().trim() : "";
    var inputUser = username ? username.toString().trim() : "";
    var inputPass = password ? password.toString().trim() : "";
    
    if (sheetUser === inputUser && sheetPass === inputPass) {
      var status = data[i][3] ? data[i][3].toString().trim().toLowerCase() : "";
      if (status === "đã duyệt") {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', role: data[i][4] || 'user', message: 'OK' })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Tài khoản đang chờ duyệt!' })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Sai thông tin!' })).setMimeType(ContentService.MimeType.JSON);
}

function handleRegister(fullname, username, password) {
  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === username) return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Tên đã tồn tại!' })).setMimeType(ContentService.MimeType.JSON);
  }
  sheet.appendRow([username, password, fullname, "Chờ duyệt", "user"]);
  return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Đăng ký OK.' })).setMimeType(ContentService.MimeType.JSON);
}

// ===== CÁC HÀM ĐỌC DỮ LIỆU TỪ EXCEL =====
function getAllocationsData(ss) {
  var sheet = ss.getSheetByName('Cấp phát các BC');
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (row[0] !== '' && row[0] !== null) {
      result.push({
        date: formatDate(row[0]),
        bc: String(row[1] || '').trim(),
        item: String(row[2] || '').trim(),
        sl: Number(row[3]) || 0,
        unit: String(row[4] || '').trim(),
        dest: String(row[5] || '').trim(),
        issuer: String(row[6] || '').trim()
      });
    }
  }
  return result;
}

function getForkliftLogsData(ss) {
  var sheet = ss.getSheetByName('Nhật ký xe nâng');
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (row[0] !== '' && row[0] !== null) {
      result.push({
        provider: String(row[0] || '').trim(),
        id: String(row[1] || '').trim(),
        issueDate: formatDate(row[2]),
        issueType: String(row[3] || '').trim(),
        fixDate: formatDate(row[4]),
        note: String(row[5] || '').trim()
      });
    }
  }
  return result;
}

function getInfraHealthData(ss) {
  var sheet = ss.getSheetByName('KiemTraHaTang');
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (row[0] !== '' && row[0] !== null) {
      result.push({
        date: formatDate(row[0]),
        group: String(row[1] || '').trim(),
        item: String(row[2] || '').trim(),
        status: String(row[3] || '').trim(),
        desc: String(row[4] || '').trim(),
        action: String(row[5] || '').trim(),
        inspector: String(row[6] || '').trim()
      });
    }
  }
  return result;
}

function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    var d = value.getDate().toString();
    var m = (value.getMonth() + 1).toString();
    if (d.length < 2) d = '0' + d;
    if (m.length < 2) m = '0' + m;
    var y = value.getFullYear();
    if (y < 2000) return '';
    return d + '/' + m + '/' + y;
  }
  return String(value).trim();
}
