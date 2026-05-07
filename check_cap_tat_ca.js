const XLSX = require('xlsx');
const wb = XLSX.readFile('E:\\Học AI\\Bài tập\\Data Vận hành.xlsx');
const sheet = wb.Sheets['Tất cả'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: 0 });

let countHasCap = 0;
for (let i = 4; i < data.length; i++) {
  const cap = parseFloat(data[i][20]);
  if (cap > 0) countHasCap++;
}
console.log('Total POs with capacity > 0 in Tất cả:', countHasCap);
