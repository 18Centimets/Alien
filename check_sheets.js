const XLSX = require('xlsx');
const wb = XLSX.readFile('E:\\Học AI\\Bài tập\\Data Vận hành.xlsx');
console.log('Sheets:', wb.SheetNames);
