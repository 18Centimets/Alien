require('dotenv').config();
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

async function test() {
    console.log("Đang gửi tin nhắn test tới Chat ID:", chatId);
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: chatId, 
                text: "✅ Chào sếp! Bot Telegram của GHN Command Center V2 đã được kết nối thành công với Chat ID của sếp.\nTừ giờ tôi sẽ báo cáo tài sản quá hạn tại đây nhé! 🚀" 
            })
        });
        const data = await res.json();
        if(data.ok) {
            console.log("✅ Đã gửi thành công!");
        } else {
            console.error("❌ Lỗi từ Telegram:", data);
        }
    } catch (e) {
        console.error("❌ Lỗi kết nối:", e);
    }
}

test();
