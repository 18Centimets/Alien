const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const args = process.argv.slice(2);
const backupDir = path.join(__dirname, 'backups');

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
}

function getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function createZip(moduleName, filesToArchive) {
    const zipName = `${moduleName}_backup_${getTimestamp()}.zip`;
    const zipPath = path.join(backupDir, zipName);
    const zip = new AdmZip();

    filesToArchive.forEach(item => {
        const itemPath = path.join(__dirname, '..', item.src);
        if (fs.existsSync(itemPath)) {
            if (fs.statSync(itemPath).isDirectory()) {
                zip.addLocalFolder(itemPath, item.dest);
            } else {
                zip.addLocalFile(itemPath, path.dirname(item.dest) === '.' ? '' : path.dirname(item.dest));
                // Note: adm-zip addLocalFile puts it in the specified zipPath.
                // Since we want specific dest, we might need to rename, but for our case, they are root files mostly.
            }
        } else {
            console.warn(`⚠️ Bỏ qua: Không tìm thấy ${itemPath}`);
        }
    });

    zip.writeZip(zipPath);
    console.log(`✅ [${moduleName}] Đã backup thành công: ${zipName}`);
}

function runBackup() {
    console.log("📦 Bắt đầu quá trình backup module...");

    const doDB = args.includes('--db') || args.includes('--full');
    const doBackend = args.includes('--backend') || args.includes('--full');
    const doFrontend = args.includes('--frontend') || args.includes('--full');

    if (!doDB && !doBackend && !doFrontend) {
        console.log("Vui lòng chọn module: --db, --backend, --frontend, hoặc --full");
        process.exit(1);
    }

    if (doDB) {
        createZip('database', [
            { src: 'database_offline.xlsx', dest: 'database_offline.xlsx' }
        ]);
    }

    if (doBackend) {
        createZip('backend', [
            { src: 'server/server_offline.js', dest: 'server/server_offline.js' },
            { src: 'server/package.json', dest: 'server/package.json' },
            { src: 'server/.env', dest: 'server/.env' }
        ]);
    }

    if (doFrontend) {
        createZip('frontend', [
            { src: 'app.js', dest: 'app.js' },
            { src: 'index_v2.html', dest: 'index_v2.html' },
            { src: 'index.css', dest: 'index.css' }
        ]);
    }

    console.log("🎉 Hoàn tất backup!");
}

runBackup();
