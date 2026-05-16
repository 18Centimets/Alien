const fs = require('fs');
const path = require('path');

const BOT_TOKEN = '8690867509:AAF3M1JamzUJ4jYhDIeWYlpSGnmkUIdciQc';

console.log('Đang chờ mày gửi tin nhắn cho Bot...');
console.log('Mày hãy mở Telegram, tìm bot của mày và gởi chữ "Hi" hoặc bấm /start nhé!');

const interval = setInterval(async () => {
    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
            // Lấy tin nhắn mới nhất
            const lastUpdate = data.result[data.result.length - 1];
            const chatId = lastUpdate.message.chat.id;
            const firstName = lastUpdate.message.chat.first_name || 'Boss';
            
            console.log(`\n🎉 Đã nhận được tin nhắn từ ${firstName}! Chat ID của mày là: ${chatId}`);
            
            // Ghi Chat ID vào file telegram_bot.js
            const botFilePath = path.join(__dirname, 'telegram_bot.js');
            let botCode = fs.readFileSync(botFilePath, 'utf8');
            botCode = botCode.replace(/let CHAT_ID = '';/, `let CHAT_ID = '${chatId}';`);
            
            // Bỏ comment dòng chạy checkAndAlert
            botCode = botCode.replace(/\/\/ checkAndAlert\(\);/, `checkAndAlert();`);
            botCode = botCode.replace(/\/\/ setInterval\(checkAndAlert, FIVE_HOURS\);/, `setInterval(checkAndAlert, FIVE_HOURS);`);
            
            fs.writeFileSync(botFilePath, botCode);
            console.log('✅ Đã lưu Chat ID vào code tự động!');
            
            clearInterval(interval);
            
            console.log('\n🚀 Bắt đầu khởi động Bot chạy ngầm...');
            // Chạy bot
            require('./telegram_bot');
        } else {
            process.stdout.write('.');
        }
    } catch (error) {
        console.error('\nLỗi khi lấy dữ liệu từ Telegram:', error.message);
    }
}, 3000);
