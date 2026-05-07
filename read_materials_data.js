const XLSX = require('xlsx');
const path = require('path');

const wb = XLSX.readFile('E:\\Học AI\\Bài tập\\Data vật tư cấp phát\\_MUA HÀNG 2026.xlsx');
console.log('Sheets:', wb.SheetNames);

wb.SheetNames.forEach(sheetName => {
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  console.log(`\nSheet: ${sheetName}`);
  console.log('Row 1:', data[0]);
  console.log('Row 2:', data[1]);
  console.log('Row 3:', data[2]);
  console.log('Row 4:', data[3]);
});
