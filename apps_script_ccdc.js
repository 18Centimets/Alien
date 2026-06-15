/**
 * APPS SCRIPT — CCDC DEVICE MANAGEMENT
 * Dán vào Google Apps Script của file Spreadsheet Dashboard.
 * Deploy > New Deployment > Web App > Anyone (cho phép truy cập).
 * 
 * Sheet cần có:
 *   - "DS nhân sự" : danh sách nhân viên
 *   - "CCDC_Giao"  : tự tạo nếu chưa có
 *   - "CCDC_Nhan"  : tự tạo nếu chưa có
 */

// ===================== CONFIG =====================
// Tên cột trong sheet "DS nhân sự" — chỉnh lại nếu tên header khác
var EMP_SHEET_NAME   = 'DS nhân sự';
var EMP_COL_MSNV     = 'Mã NV';
var EMP_COL_HOTEN    = 'Họ và tên';
var EMP_COL_CA       = 'Ca làm việc';
var EMP_COL_QUANLY   = 'Quản lý';
// ==================================================

function doGet(e) {
  var action = e.parameter.action;
  if (action === 'lookup_employee') return handleLookupEmployee(e.parameter.msnv);
  if (action === 'lookup_borrowed') return handleLookupBorrowed(e.parameter.msnv);
  if (action === 'submit_giao')     return handleSubmitGiao(e.parameter);
  if (action === 'submit_nhan')     return handleSubmitNhan(e.parameter);
  if (action === 'get_today_log')   return handleGetTodayLog();
  if (action === 'get_employees')   return handleGetEmployees();
  if (action === 'tts')             return handleTts(e.parameter.text);
  return jsonRes({ status: 'error', message: 'Invalid action' });
}

function jsonRes(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// =============================================
// HELPER: Đọc sheet nhân viên với header động
// =============================================
function getEmployeeSheetMap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EMP_SHEET_NAME);
  if (!sheet) return { error: 'Không tìm thấy sheet "' + EMP_SHEET_NAME + '"' };
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return h.toString().trim(); });
  var idx = {
    msnv:   headers.indexOf(EMP_COL_MSNV),
    hoten:  headers.indexOf(EMP_COL_HOTEN),
    ca:     headers.indexOf(EMP_COL_CA),
    quanly: headers.indexOf(EMP_COL_QUANLY)
  };
  // Fallback theo thứ tự cột nếu không tìm được header
  if (idx.msnv   < 0) idx.msnv   = 0;
  if (idx.hoten  < 0) idx.hoten  = 1;
  if (idx.ca     < 0) idx.ca     = 2;
  if (idx.quanly < 0) idx.quanly = 3;
  return { data: data, idx: idx, headers: headers };
}

// =============================================
// API: Tìm nhân viên theo Mã NV
// =============================================
function handleLookupEmployee(msnv) {
  if (!msnv) return jsonRes({ status: 'error', message: 'Thiếu mã NV' });
  var map = getEmployeeSheetMap();
  if (map.error) return jsonRes({ status: 'error', message: map.error });
  var data = map.data; var idx = map.idx;
  var q = msnv.toString().trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    var empId = (data[i][idx.msnv] || '').toString().trim().toLowerCase();
    if (empId === q) {
      return jsonRes({
        status: 'found',
        msnv:   data[i][idx.msnv].toString().trim(),
        hoten:  data[i][idx.hoten]  ? data[i][idx.hoten].toString().trim()  : '',
        ca:     data[i][idx.ca]     ? data[i][idx.ca].toString().trim()     : '',
        quanly: data[i][idx.quanly] ? data[i][idx.quanly].toString().trim() : ''
      });
    }
  }
  return jsonRes({ status: 'not_found', message: 'Không tìm thấy mã NV: ' + msnv });
}

// =============================================
// API: Tìm thiết bị đang mượn của 1 NV
// =============================================
function handleLookupBorrowed(msnv) {
  if (!msnv) return jsonRes({ status: 'error', message: 'Thiếu mã NV' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateGiaoSheet(ss);
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
    var empRes = JSON.parse(handleLookupEmployee(msnv).getContent());
    return jsonRes({ status: 'no_borrow', emp: empRes });
  }
  return jsonRes({ status: 'has_borrow', borrowed: borrowed });
}

// =============================================
// API: Lưu giao dịch GIAO thiết bị
// =============================================
function handleSubmitGiao(params) {
  var msnv = params.msnv || ''; var hoten = params.hoten || '';
  var ca = params.ca || ''; var quanly = params.quanly || '';
  var ma_thiet_bi = params.ma_thiet_bi || '';
  var ten_thiet_bi = params.ten_thiet_bi || '';
  var ghi_chu = params.ghi_chu || '';
  if (!msnv || !ma_thiet_bi || !ten_thiet_bi)
    return jsonRes({ status: 'error', message: 'Thiếu: Mã NV, Mã Thiết Bị, Tên Thiết Bị' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateGiaoSheet(ss);
  var timestamp = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
  sheet.appendRow([timestamp, msnv, hoten, ca, quanly, ma_thiet_bi, ten_thiet_bi, 'false', '', '', ghi_chu]);
  return jsonRes({ status: 'success', message: 'Giao thiết bị thành công!' });
}

// =============================================
// API: Lưu giao dịch NHẬN (thu hồi) thiết bị
// =============================================
function handleSubmitNhan(params) {
  var msnv = params.msnv || ''; var ma_thiet_bi = params.ma_thiet_bi || '';
  var tinh_trang = params.tinh_trang || ''; var row_index = parseInt(params.row_index || '0');
  var ghi_chu = params.ghi_chu || '';
  if (!msnv || !ma_thiet_bi) return jsonRes({ status: 'error', message: 'Thiếu Mã NV hoặc Mã Thiết Bị' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateGiaoSheet(ss);
  var timestamp = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
  var updated = false;
  // Cập nhật dòng gốc
  if (row_index > 1) {
    try {
      sheet.getRange(row_index, 8).setValue('true');
      sheet.getRange(row_index, 9).setValue(timestamp);
      sheet.getRange(row_index, 10).setValue(tinh_trang);
      if (ghi_chu) sheet.getRange(row_index, 11).setValue(ghi_chu);
      updated = true;
    } catch(e) { Logger.log(e); }
  }
  if (!updated) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][1]||'').toString().trim().toLowerCase() === msnv.toLowerCase() &&
          (data[i][5]||'').toString().trim().toLowerCase() === ma_thiet_bi.toLowerCase() &&
          (data[i][7]||'').toString().trim() !== 'true') {
        sheet.getRange(i+1,8).setValue('true');
        sheet.getRange(i+1,9).setValue(timestamp);
        sheet.getRange(i+1,10).setValue(tinh_trang);
        if (ghi_chu) sheet.getRange(i+1,11).setValue(ghi_chu);
        break;
      }
    }
  }
  // Ghi vào CCDC_Nhan để dễ xem
  var nhanSheet = getOrCreateNhanSheet(ss);
  var giaoData = sheet.getDataRange().getValues();
  var hoten='', ca='', quanly='', ten_thiet_bi='';
  for (var j = 1; j < giaoData.length; j++) {
    if ((giaoData[j][1]||'').toString().trim().toLowerCase() === msnv.toLowerCase() &&
        (giaoData[j][5]||'').toString().trim().toLowerCase() === ma_thiet_bi.toLowerCase()) {
      hoten=giaoData[j][2]; ca=giaoData[j][3]; quanly=giaoData[j][4]; ten_thiet_bi=giaoData[j][6]; break;
    }
  }
  nhanSheet.appendRow([timestamp, msnv, hoten, ca, quanly, ma_thiet_bi, ten_thiet_bi, tinh_trang, ghi_chu]);
  return jsonRes({ status: 'success', message: 'Thu hồi thiết bị thành công!' });
}

// =============================================
// API: Log hôm nay
// =============================================
function handleGetTodayLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateGiaoSheet(ss);
  var data = sheet.getDataRange().getValues();
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');
  var log = [];
  for (var i = data.length - 1; i >= 1; i--) {
    if ((data[i][0]||'').toString().substring(0,10) === today) {
      log.push({
        timestamp:    data[i][0].toString(),
        msnv:         data[i][1].toString(),
        hoten:        data[i][2].toString(),
        ca:           data[i][3].toString(),
        ma_thiet_bi:  data[i][5].toString(),
        ten_thiet_bi: data[i][6].toString(),
        da_thu_hoi:   data[i][7].toString() === 'true',
        thu_hoi_luc:  data[i][8].toString(),
        tinh_trang:   data[i][9].toString()
      });
    }
    if (log.length >= 50) break;
  }
  return jsonRes({ status: 'success', log: log });
}

// =============================================
// API: Danh sách nhân viên
// =============================================
function handleGetEmployees() {
  var map = getEmployeeSheetMap();
  if (map.error) return jsonRes({ status: 'error', message: map.error });
  var data = map.data; var idx = map.idx;
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var msnv = (data[i][idx.msnv] || '').toString().trim();
    if (msnv) list.push({
      msnv:   msnv,
      hoten:  (data[i][idx.hoten]  || '').toString().trim(),
      ca:     (data[i][idx.ca]     || '').toString().trim(),
      quanly: (data[i][idx.quanly] || '').toString().trim()
    });
  }
  return jsonRes({ status: 'success', employees: list });
}

// =============================================
// HELPERS: Tạo Sheet nếu chưa có
// =============================================
function getOrCreateGiaoSheet(ss) {
  var sheet = ss.getSheetByName('CCDC_Giao');
  if (!sheet) {
    sheet = ss.insertSheet('CCDC_Giao');
    sheet.appendRow(['Thời Gian Giao','Mã NV','Họ Tên','Ca Làm Việc','Quản Lý','Mã Thiết Bị','Tên Thiết Bị','Đã Thu Hồi','Thời Gian Thu Hồi','Tình Trạng','Ghi Chú']);
    sheet.getRange(1,1,1,11).setFontWeight('bold').setBackground('#f26522').setFontColor('white');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateNhanSheet(ss) {
  var sheet = ss.getSheetByName('CCDC_Nhan');
  if (!sheet) {
    sheet = ss.insertSheet('CCDC_Nhan');
    sheet.appendRow(['Thời Gian Thu Hồi','Mã NV','Họ Tên','Ca Làm Việc','Quản Lý','Mã Thiết Bị','Tên Thiết Bị','Tình Trạng','Ghi Chú']);
    sheet.getRange(1,1,1,9).setFontWeight('bold').setBackground('#27ae60').setFontColor('white');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// API: Gọi Google TTS từ phía Apps Script và trả về Base64 MP3
function handleTts(text) {
  if (!text) return jsonRes({ status: "error", message: "Missing text" });
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
      return jsonRes({ status: "success", audio: base64 });
    } else {
      return jsonRes({ status: "error", message: "Google TTS returned HTTP " + response.getResponseCode() });
    }
  } catch(e) {
    return jsonRes({ status: "error", message: e.toString() });
  }
}
