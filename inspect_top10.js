const XLSX = require('xlsx');
const wb = XLSX.readFile('E:\\Học AI\\Bài tập\\Data Vận hành.xlsx');
const sheet = wb.Sheets['Top 10 BC yếu nhất'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log(data.slice(0, 15));
