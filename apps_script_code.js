// ===== APPS SCRIPT CHO GHN DASHBOARD =====
// Copy TOÀN BỘ đoạn code này, dán vào Apps Script Editor
// Spreadsheet ID lấy từ link Google Sheet của bạn

const SPREADSHEET_ID = '1p6y__HPj7gNcAl7Gi5ByYvPBT2xner-71EvUxO1RoZ8';

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    const allocations = getAllocationsData(ss);
    const forkliftLogs = getForkliftLogsData(ss);
    const infraHealth = getInfraHealthData(ss);
    
    const result = {
      allocations: allocations,
      forkliftLogs: forkliftLogs,
      infraHealth: infraHealth,
      updated: new Date().toISOString()
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== 1. ĐỌC SHEET "Cấp phát các BC" =====
// Cột: NGÀY THÁNG NĂM | BƯU CỤC | HÀNG HÓA CẤP PHÁT | SỐ LƯỢNG | ĐVT | HÀNG VỀ TẠI | Người cấp
function getAllocationsData(ss) {
  const sheet = ss.getSheetByName('Cấp phát các BC');
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  
  return data
    .filter(row => row[0] !== '' && row[0] !== null)
    .map(row => ({
      date: formatDate(row[0]),
      bc: String(row[1] || '').trim(),
      item: String(row[2] || '').trim(),
      sl: Number(row[3]) || 0,
      unit: String(row[4] || '').trim(),
      dest: String(row[5] || '').trim(),
      issuer: String(row[6] || '').trim()
    }));
}

// ===== 2. ĐỌC SHEET "Nhật ký xe nâng" =====
// Cột: Nhà cung cấp | Mã xe (Tên xe) | Thời gian xảy ra sự cố | Loại sự cố | Thời gian khắc phục sự cố | Ghi chú
function getForkliftLogsData(ss) {
  const sheet = ss.getSheetByName('Nhật ký xe nâng');
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  
  return data
    .filter(row => row[0] !== '' && row[0] !== null)
    .map(row => ({
      provider: String(row[0] || '').trim(),
      id: String(row[1] || '').trim(),
      issueDate: formatDate(row[2]),
      issueType: String(row[3] || '').trim(),
      fixDate: formatDate(row[4]),
      note: String(row[5] || '').trim()
    }));
}

// ===== 3. ĐỌC SHEET "KiemTraHaTang" =====
// Cột: Ngày kiểm tra | Nhóm | Hạng mục | Tình trạng | Mô tả chi tiết | Hành động đề xuất | Người kiểm tra
function getInfraHealthData(ss) {
  const sheet = ss.getSheetByName('KiemTraHaTang');
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  
  return data
    .filter(row => row[0] !== '' && row[0] !== null)
    .map(row => ({
      date: formatDate(row[0]),
      group: String(row[1] || '').trim(),
      item: String(row[2] || '').trim(),
      status: String(row[3] || '').trim(),
      desc: String(row[4] || '').trim(),
      action: String(row[5] || '').trim(),
      inspector: String(row[6] || '').trim()
    }));
}

// ===== HÀM PHỤ: FORMAT NGÀY =====
function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const d = value.getDate().toString().padStart(2, '0');
    const m = (value.getMonth() + 1).toString().padStart(2, '0');
    const y = value.getFullYear();
    if (y < 2000) return '';
    return d + '/' + m + '/' + y;
  }
  return String(value).trim();
}
