const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

console.log('Loading Materials Excel file...');
const wb = XLSX.readFile('E:\\Học AI\\Bài tập\\Data vật tư cấp phát\\_MUA HÀNG 2026.xlsx');

const output = {
  allocations: [],
  forklifts: [],
  purchases: [],
  summary: {}
};

function formatExcelDate(date) {
  if (!date) return '';
  if (typeof date === 'number') {
    const d = new Date((date - (25567 + 2)) * 86400 * 1000);
    return d.toLocaleDateString('vi-VN');
  }
  return date;
}

// Process "Cấp phát các BC" sheet
const sheet = wb.Sheets['Cấp phát các BC'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

// Expected headers: 'NGÀY THÁNG NĂM', 'BƯU CỤC', 'HÀNG HÓA CẤP PHÁT', 'SỐ LƯỢNG', 'ĐVT', 'HÀNG VỀ TẠI'

for (let r = 1; r < data.length; r++) { 
  const row = data[r];
  if (!row[1] || row[1] === '') continue; // Skip empty rows

  const date = row[0];
  const postOffice = String(row[1]);
  const item = String(row[2]);
  const quantity = parseFloat(row[3]) || 0;
  const unit = String(row[4]);
  const location = String(row[5]);

  output.allocations.push({
    date: formatExcelDate(date),
    postOffice,
    item,
    quantity,
    unit,
    location
  });
}

// Process "Nhật ký xe nâng" sheet
const forkliftSheet = wb.Sheets['Nhật ký xe nâng'];
if (forkliftSheet) {
  const forkliftData = XLSX.utils.sheet_to_json(forkliftSheet, { header: 1, defval: null });
  // Expected headers: 'Nhà cung cấp', 'Mã xe (Tên xe)', 'Thời gian xảy ra sự cố', 'Loại sự cố', 'Thời gian khắc phục sự cố', 'Ghi chú'

  for (let r = 1; r < forkliftData.length; r++) {
    const row = forkliftData[r];
    if (!row[1] || row[1] === '') continue; // Skip empty rows

    output.forklifts.push({
      supplier: String(row[0] || ''),
      code: String(row[1] || ''),
      issueTime: formatExcelDate(row[2]),
      issueType: String(row[3] || ''),
      fixTime: formatExcelDate(row[4]),
      note: String(row[5] || '')
    });
  }
}

// Process "Tổnghợp đặt mua" sheet
const purchaseSheet = wb.Sheets['Tổnghợp đặt mua'];
if (purchaseSheet) {
  const purchaseData = XLSX.utils.sheet_to_json(purchaseSheet, { header: 1, defval: null });
  // Expected headers: 'TÊN HÀNG HÓA', 'MÃ HÀNG', 'SỐ LƯỢNG ĐẶT', 'NGÀY ĐẶT', 'NGÀY NHẬN', 'LINK QLNS'

  for (let r = 2; r < purchaseData.length; r++) { // Data starts at index 2
    const row = purchaseData[r];
    if (!row[0] || row[0] === '') continue; // Skip empty rows (no item name)

    output.purchases.push({
      itemName: String(row[0] || '').trim(),
      itemCode: String(row[1] || '').trim(),
      quantity: String(row[2] || '').trim(),
      orderDate: formatExcelDate(row[3]),
      receiveDate: formatExcelDate(row[4]),
      link: String(row[5] || '').trim()
    });
  }
}

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const outputPath = path.join(dataDir, 'materials.js');
const jsContent = `window.ghnMaterialsConfig = ${JSON.stringify(output, null, 2)};`;
fs.writeFileSync(outputPath, jsContent);

console.log(`Extraction complete!`);
console.log(`- Processed ${output.allocations.length} Material Allocations`);
console.log(`- Processed ${output.forklifts.length} Forklift Issues`);
console.log(`- Processed ${output.purchases.length} Purchases`);
console.log(`- Saved to ${outputPath}`);
