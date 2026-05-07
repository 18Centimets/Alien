const XLSX = require('xlsx');
const path = require('path');

const wb = XLSX.readFile('E:\\Học AI\\Bài tập\\Data Vận hành.xlsx');
const sheet = wb.Sheets['Tất cả-Lấy'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: 0 });

console.log('Row 2 (Headers 1):', data[1]);
console.log('Row 3 (Headers 2):', data[2]);
console.log('Row 4 (Headers 3):', data[3]);
console.log('Row 5 (Data 1):', data[4].slice(0, 25));
console.log('Row 6 (Data 2):', data[5].slice(0, 25));
