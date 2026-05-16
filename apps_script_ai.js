/**
 * ĐOẠN CODE NÀY ĐỂ TÍCH HỢP GEMINI AI VÀO GOOGLE APPS SCRIPT
 * Hãy dán đè toàn bộ vào file Apps Script hiện tại của mày.
 */

// ĐIỀN API KEY MÀ MÀY VỪA COPY VÀO TRONG DẤU NGOẶC KÉP DƯỚI ĐÂY
var GEMINI_API_KEY = "ĐIỀN_API_KEY_CỦA_MÀY_VÀO_ĐÂY";

function doGet(e) {
  var action = e.parameter.action;
  
  // 1. Nếu action là Chat với AI
  if (action === 'chat') {
    return handleAIChat(e.parameter.message);
  }

  // 2. Nếu action là Đăng nhập
  if (action === 'login') {
    return handleLogin(e.parameter.username, e.parameter.password);
  }
  
  // 3. Nếu action là Đăng ký
  if (action === 'register') {
    return handleRegister(e.parameter.fullname, e.parameter.username, e.parameter.password);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid action" })).setMimeType(ContentService.MimeType.JSON);
}

function handleAIChat(userMessage) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "ĐIỀN_API_KEY_CỦA_MÀY_VÀO_ĐÂY") {
    return ContentService.createTextOutput(JSON.stringify({
      status: "success", // Trả về success để web vẫn hiển thị đoạn chat báo lỗi
      reply: "Báo cáo sếp, hệ thống AI chưa được kích hoạt. Sếp vui lòng gắn Gemini API Key vào Google Apps Script nhé!"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // Đây là Prompt Hệ thống. Nó biến AI thành Kỹ sư trưởng và nhét dữ liệu bản vẽ vào đầu nó.
  var systemPrompt = `Bạn là Kỹ sư trưởng quản lý hạ tầng của Kho trung chuyển GHN Hưng Yên. 
Nhiệm vụ của bạn là trả lời các câu hỏi của Giám đốc Vận hành về các thông số bản vẽ hoàn công một cách ngắn gọn, chuyên nghiệp và chính xác. 
Chỉ trả lời dựa trên các dữ liệu sau đây. Nếu câu hỏi không nằm trong dữ liệu, hãy nói "Báo cáo sếp, thông tin này không có trong hồ sơ bản vẽ hoàn công hiện tại."

[DỮ LIỆU BẢN VẼ HOÀN CÔNG KHO HƯNG YÊN]
- Tổng diện tích khuôn viên: 50,000 m2
- Diện tích nhà kho chính: 35,000 m2
- Khu vực Chia chọn (Sorting): 20,000 m2
- Khu vực Inbound (Nhập hàng): 5,000 m2
- Khu vực Outbound (Xuất hàng): 10,000 m2
- Số lượng cột thép trụ chịu lực: 120 cột (khoảng cách giữa các cột là 12m)
- Hệ thống PCCC: Bơm chữa cháy diesel 150HP, bể ngầm 500 khối, 150 vòi phun tự động.
- Hệ thống điện: Trạm biến áp 2000 kVA, máy phát điện dự phòng 1500 kVA Cummins.
- Khu vực bãi đỗ xe tải: Đủ sức chứa 80 xe tải loại 10 tấn cùng lúc.
- Cửa xuất/nhập hàng (Dock leveler): 45 cửa.

Trả lời với giọng điệu tôn trọng sếp, xưng "Tôi" và gọi người hỏi là "Sếp".
Có thể sử dụng markdown để in đậm các con số quan trọng.`;

  var payload = {
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": systemPrompt + "\n\nCâu hỏi của Sếp: " + userMessage }]
      }
    ],
    "generationConfig": {
      "temperature": 0.2,
      "maxOutputTokens": 500
    }
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    var response = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY, options);
    var json = JSON.parse(response.getContentText());
    
    if (json.candidates && json.candidates.length > 0) {
      var aiReply = json.candidates[0].content.parts[0].text;
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        reply: aiReply
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        reply: "Báo cáo sếp, API trả về lỗi hoặc quá tải. Vui lòng thử lại sau."
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      reply: "Lỗi kết nối đến server AI: " + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ======= CÁC HÀM CŨ (ĐĂNG NHẬP / ĐĂNG KÝ) =======
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
  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === username && data[i][1] === password) {
      if (data[i][3] === "Đã duyệt") {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success', role: data[i][4] || 'user', message: 'Đăng nhập thành công'
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error', message: 'Tài khoản đang chờ duyệt!'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: 'error', message: 'Sai tên đăng nhập hoặc mật khẩu!'
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleRegister(fullname, username, password) {
  var sheet = getAuthSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error', message: 'Tên đăng nhập đã tồn tại!'
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  sheet.appendRow([username, password, fullname, "Chờ duyệt", "user"]);
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success', message: 'Đăng ký thành công.'
  })).setMimeType(ContentService.MimeType.JSON);
}
