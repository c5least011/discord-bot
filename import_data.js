require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

// Kết nối mây
mongoose.connect(process.env.MONGO_URI);

const BetData = mongoose.model('BetData', new mongoose.Schema({
    type: String, score: Number, animals: [String], resultStr: String, createdAt: Date
}));

async function migrate() {
    try {
        // Chuyển data Tài Xỉu
        if (fs.existsSync('memory_tx.json')) {
            const txData = JSON.parse(fs.readFileSync('memory_tx.json', 'utf8'));
            const txToImport = txData.map(d => ({ type: 'tx', score: d.score, createdAt: new Date() }));
            await BetData.insertMany(txToImport);
            console.log(`✅ Đã lưu ${txToImport.length} ván TX lên dữ liệu!`);
        }

        // Chuyển data Bầu Cua
        if (fs.existsSync('memory_bc.json')) {
            const bcData = JSON.parse(fs.readFileSync('memory_bc.json', 'utf8'));
            const bcToImport = bcData.map(d => ({ type: 'bc', animals: d.animals, resultStr: d.resultStr, createdAt: new Date() }));
            await BetData.insertMany(bcToImport);
            console.log(`✅ Đã lưu ${bcToImport.length} ván BC lên dữ liệu`);
        }

        console.log("🚀 Xong r đó m, xoá file này đi r bật bot lên là hưởng thôi!");
        process.exit();
    } catch (err) { console.error("Lỗi r:", err); }
}
migrate();