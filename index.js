const http = require('http');

// --- نظام إبقاء البوت حياً على Render ---
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Sora Multi-System is Online!");
    res.end();
}).listen(port, '0.0.0.0');

// --- استدعاء (Require) كل أجزاء النظام ---
console.log("🚀 جاري تشغيل أنظمة Sora...");

require('./security.js');    // يشغل بوت الزعيم والحماية
require('./admin.js');       // يشغل بوت الإدارة والأزرار
require('./game.js');        // يشغل بوت اللعبة (login, say, who)

console.log("✅ كل البوتات شغالين تحت إشراف SoraSecurity");