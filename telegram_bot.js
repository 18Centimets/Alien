const fs = require('fs');
const path = require('path');

const BOT_TOKEN = '8690867509:AAF3M1JamzUJ4jYhDIeWYlpSGnmkUIdciQc';
let CHAT_ID = '1014440614'; // Sẽ điền sau khi lấy được từ API

const CSV_PATH = path.join(__dirname, '..', 'KiemTraHaTang_HungYen.csv');

// Hàm đọc và parse CSV thủ công (không dùng thư viện ngoài)
function readLocalCSV() {
    try {
        const content = fs.readFileSync(CSV_PATH, 'utf8');
        const lines = content.split('\n').filter(line => line.trim() !== '');
        const data = [];
        
        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim());
            if (cols.length >= 6) {
                data.push({
                    group: cols[1],
                    item: cols[2],
                    status: cols[3],
                    desc: cols[4],
                    action: cols[5],
                });
            }
        }
        return data;
    } catch (error) {
        console.error('Lỗi đọc file CSV:', error);
        return [];
    }
}

// Hàm gửi tin nhắn qua Telegram
async function sendTelegramMessage(text) {
    if (!CHAT_ID) {
        console.log('Chưa có CHAT_ID, không thể gửi tin nhắn.');
        return;
    }

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: text,
                parse_mode: 'HTML'
            })
        });
        const result = await response.json();
        if (result.ok) {
            console.log(`[${new Date().toLocaleString('vi-VN')}] Đã gửi báo cáo Telegram thành công!`);
        } else {
            console.error('Lỗi từ Telegram:', result);
        }
    } catch (error) {
        console.error('Lỗi gửi tin nhắn Telegram:', error);
    }
}

// Hàm kiểm tra và cảnh báo
async function checkAndAlert() {
    console.log(`[${new Date().toLocaleString('vi-VN')}] Đang kiểm tra Sức khỏe kho...`);
    const infraData = readLocalCSV();
    
    // Lọc các hạng mục Kém hoặc Trung bình để cảnh báo
    const criticalItems = infraData.filter(item => item.status.toLowerCase() === 'kém');
    const warningItems = infraData.filter(item => item.status.toLowerCase() === 'trung bình' || item.status.toLowerCase() === 'tb');

    if (criticalItems.length === 0 && warningItems.length === 0) {
        console.log('Tất cả hạ tầng đều ổn. Không gửi cảnh báo.');
        return;
    }

    let message = `🚨 <b>BÁO CÁO SỨC KHỎE HẠ TẦNG KHO</b> 🚨\n`;
    message += `Thời gian: ${new Date().toLocaleString('vi-VN')}\n\n`;

    if (criticalItems.length > 0) {
        message += `🔴 <b>HẠNG MỤC ĐỎ (CẦN XỬ LÝ KHẨN CẤP): ${criticalItems.length}</b>\n`;
        criticalItems.forEach((item, index) => {
            message += `${index + 1}. [${item.group}] ${item.item}\n`;
            message += `   └ <i>Hành động: ${item.action}</i>\n`;
        });
        message += `\n`;
    }

    if (warningItems.length > 0) {
        message += `🟠 <b>HẠNG MỤC CAM (CẦN LƯU Ý): ${warningItems.length}</b>\n`;
        warningItems.forEach((item, index) => {
            message += `${index + 1}. [${item.group}] ${item.item}\n`;
            message += `   └ <i>Hành động: ${item.action}</i>\n`;
        });
    }

    message += `\n👉 <a href="https://baotuanloc.netlify.app/#infra-health">Xem chi tiết trên Dashboard</a>`;

    await sendTelegramMessage(message);
}

// Lên lịch chạy nghiệm vụ tự động (Mỗi 5 tiếng = 5 * 60 * 60 * 1000 ms)
const FIVE_HOURS = 5 * 60 * 60 * 1000;

console.log('Bot đã khởi động và đang làm việc!');

// Chức năng lắng nghe tin nhắn trực tiếp từ mày (Long Polling)
let lastUpdateId = 0;

async function listenForCommands() {
    if (!CHAT_ID) return; // Chỉ nghe khi đã có ID
    
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId}&timeout=10`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id + 1; // Đánh dấu đã đọc
                
                if (update.message && update.message.text) {
                    const text = update.message.text.toLowerCase().trim();
                    const senderId = update.message.chat.id;
                    
                    // Nếu gửi lệnh báo cáo
                    if (text === '/baocao' || text === 'báo cáo' || text === 'report') {
                        console.log(`[${new Date().toLocaleString('vi-VN')}] Nhận được lệnh yêu cầu báo cáo khẩn!`);
                        
                        // Gửi tin nhắn xác nhận trước
                        await sendTelegramMessage("Tuân lệnh sếp! Đang tổng hợp dữ liệu báo cáo...");
                        
                        // Chạy báo cáo ngay lập tức
                        await checkAndAlert();
                    }
                }
            }
        }
    } catch (error) {
        // Bỏ qua lỗi mạng lặt vặt
    }
    
    // Tiếp tục vòng lặp nghe ngóng
    setTimeout(listenForCommands, 2000);
}

// Chạy 1 lần đầu tiên
checkAndAlert();

// Hẹn giờ chạy 5 tiếng/lần
setInterval(checkAndAlert, FIVE_HOURS);

// Khởi động đôi tai lắng nghe lệnh
setTimeout(listenForCommands, 2000);

module.exports = { checkAndAlert, sendTelegramMessage, setChatId: (id) => CHAT_ID = id };
