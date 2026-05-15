/**
 * BƯỚC 1: HÀM MỚI (Copy và dán xuống dưới cùng của file Apps Script)
 * Hàm này đọc dữ liệu từ sheet "KiemTraHaTang"
 */
function getInfraHealthData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("KiemTraHaTang");
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Bỏ qua nếu chỉ có tiêu đề
  
  const results = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // Bỏ qua các dòng trống
    
    // Gán dữ liệu đúng theo thứ tự cột từ CSV: 
    // 0:Ngày, 1:Nhóm, 2:Hạng mục, 3:Tình trạng, 4:Mô tả, 5:Hành động, 6:Người kiểm tra
    results.push({
      date: (row[0] instanceof Date) ? Utilities.formatDate(row[0], Session.getScriptTimeZone(), "dd/MM/yyyy") : row[0],
      group: row[1] || "",
      item: row[2] || "",
      status: row[3] || "",
      desc: row[4] || "",
      action: row[5] || "",
      inspector: row[6] || ""
    });
  }
  
  return results;
}

/**
 * BƯỚC 2: CẬP NHẬT HÀM doGet(e) CŨ CỦA BẠN
 * Bạn tìm đến hàm doGet(e) hiện tại và CHỈ CẦN THÊM dòng infraHealth: getInfraHealthData()
 * Dưới đây là ví dụ cấu trúc sau khi thêm:
 */
function doGet(e) {
  // ... (giữ nguyên các đoạn code khởi tạo cũ của bạn ở đây) ...
  
  var result = {
    // ... các trường dữ liệu cũ của bạn ...
    allocations: getAllocationsData(), 
    forkliftLogs: getForkliftLogsData(),
    
    // 👇 THÊM DÒNG MỚI NÀY VÀO ĐÂY 👇
    infraHealth: getInfraHealthData() 
  };
  
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
