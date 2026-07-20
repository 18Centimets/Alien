const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const args = process.argv.slice(2);
const backupDir = path.join(__dirname, 'backups');

function restoreZip(zipName) {
    const zipPath = path.join(backupDir, zipName);
    if (!fs.existsSync(zipPath)) {
        console.error(`❌ Không tìm thấy file backup: ${zipPath}`);
        process.exit(1);
    }

    const targetDir = path.join(__dirname, '..'); // Giải nén thẳng ra root project
    
    console.log(`📦 Đang phục hồi từ file: ${zipName}...`);
    try {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(targetDir, true); // true = overwrite
        console.log(`✅ Phục hồi thành công! Dữ liệu đã được bung ra ${targetDir}`);
    } catch (err) {
        console.error(`❌ Lỗi khi giải nén:`, err);
    }
}

function getLatestBackup(modulePrefix) {
    if (!fs.existsSync(backupDir)) return null;
    const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith(modulePrefix) && f.endsWith('.zip'))
        .sort((a, b) => b.localeCompare(a)); // File mới nhất lên đầu
    return files.length > 0 ? files[0] : null;
}

function runRestore() {
    const fileArgIndex = args.indexOf('--file');
    const moduleArgIndex = args.indexOf('--module');

    if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
        restoreZip(args[fileArgIndex + 1]);
    } else if (moduleArgIndex !== -1 && args[moduleArgIndex + 1]) {
        const mod = args[moduleArgIndex + 1]; // db, backend, frontend
        let prefix = '';
        if (mod === 'db') prefix = 'database_backup_';
        else if (mod === 'backend') prefix = 'backend_backup_';
        else if (mod === 'frontend') prefix = 'frontend_backup_';
        else {
            console.log("Tên module không hợp lệ. Dùng: db, backend, frontend");
            process.exit(1);
        }

        const latestFile = getLatestBackup(prefix);
        if (latestFile) {
            restoreZip(latestFile);
        } else {
            console.log(`❌ Không tìm thấy bản backup nào cho module: ${mod}`);
        }
    } else {
        console.log("Hướng dẫn sử dụng:");
        console.log("  node restore_manager.js --file <tên_file.zip>");
        console.log("  node restore_manager.js --module <db|backend|frontend> (Phục hồi bản mới nhất)");
    }
}

runRestore();
