const XLSX = require('xlsx');
const wb = XLSX.readFile('E:\\Học AI\\Bài tập\\Data Vận hành.xlsx');
wb.SheetNames.forEach(name => {
  const sheet = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (row && row.some(cell => String(cell).toLowerCase().includes('capacity'))) {
      console.log(`Found capacity in sheet: ${name}, row: ${i}`);
      console.log(row);
      return;
    }
  }
});
