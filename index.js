require('dotenv').config();
const mongoose = require('mongoose');
const { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, 
    TextInputBuilder, TextInputStyle 
} = require("discord.js");
const axios = require("axios");

// --- KẾT NỐI DATABASE (MÁY NÀO CŨNG DÙNG CHUNG) ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Data đã thông lên mây! Máy nào cũng dùng đc r m."))
    .catch(err => console.error("❌ Lỗi kết nối MongoDB:", err));

// Định nghĩa khung dữ liệu để lưu lên mây
const BetSchema = new mongoose.Schema({
    type: String, // 'tx' hoặc 'bc'
    score: Number, // Điểm Tài Xỉu
    animals: [String], // Danh sách con Bầu Cua
    resultStr: String, 
    createdAt: { type: Date, default: Date.now }
});
const BetData = mongoose.model('BetData', BetSchema);

const ChatSchema = new mongoose.Schema({
    history: [String]
});
const ChatData = mongoose.model('ChatData', ChatSchema);

// --- CONFIG ---
const TOKEN = process.env.DISCORD_TOKEN;
const API_KEY = process.env.GEMINI_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_ID = process.env.OWNER_ID;
let autoReply = true;

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// --- SLASH COMMANDS ---
const commands = [
    new SlashCommandBuilder().setName("start").setDescription("Bật bot"),
    new SlashCommandBuilder().setName("stop").setDescription("Tắt bot"),
    new SlashCommandBuilder().setName("chat").setDescription("Chat vs AI").addStringOption(o => o.setName("content").setDescription("Nội dung").setRequired(true)),
    new SlashCommandBuilder().setName("dudoancobac").setDescription("Dự đoán dựa trên CLOUD DATA").addStringOption(o => o.setName("loai").setDescription("TX hoặc BC").setRequired(true).addChoices({ name: "Tài Xỉu", value: "taixiu" }, { name: "Bầu Cua", value: "baucua" })),
    new SlashCommandBuilder().setName("soicau").setDescription("Xem 10 ván gần nhất từ mây").addStringOption(o => o.setName("loai").setDescription("Loại cầu").setRequired(true).addChoices({ name: "Tài Xỉu", value: "taixiu" }, { name: "Bầu Cua", value: "baucua" })),
    new SlashCommandBuilder().setName("newchat").setDescription("Reset sạch data trên mây"),
    new SlashCommandBuilder().setName("avatar").setDescription("Bú avatar").addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
    try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); console.log("🚀 Bot Bịp Online!"); } catch (err) { console.error(err); }
})();

// --- AI LOGIC (DATA TRÊN MÂY) ---
async function getAIReply(text) {
    let chatMem = await ChatData.findOne();
    if (!chatMem) chatMem = await ChatData.create({ history: [] });

    const prompt = `Xưng m t. Ngôn ngữ genz, viết tắt "không" thành "k". Ngắn gọn nhất. Memory: ${JSON.stringify(chatMem.history.slice(-3))}\nU: ${text}`;
    try {
        const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, { contents: [{ parts: [{ text: prompt }] }] });
        const rep = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "k biết.";
        chatMem.history.push(`U: ${text}`, `B: ${rep}`);
        if (chatMem.history.length > 20) chatMem.history.shift();
        await chatMem.save(); 
        return rep;
    } catch { return "API oẳng r."; }
}

// --- XỬ LÝ LỆNH ---
client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === "dudoancobac") {
            const loai = interaction.options.getString("loai");
            if (loai === "taixiu") {
                const dbTX = await BetData.find({ type: 'tx' });
                if (dbTX.length === 0) return interaction.reply("Mây chưa có data TX.");
                const taiCount = dbTX.filter(h => h.score >= 11).length;
                const taiRate = (taiCount / dbTX.length) * 100;
                const predTX_Chot = Math.random() * 100 < taiRate ? "TÀI" : "XỈU";
                
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`neko_tx_${interaction.user.id}`).setLabel('Lưu TX').setStyle(ButtonStyle.Primary));
                await interaction.reply({ content: `📊 **DỰ ĐOÁN TX (CLOUD)**\n- Tổng: ${dbTX.length} ván\n- Tỉ lệ Tài hiện tại: ${Math.round(taiRate)}%\n- Dự đoán: **${predTX_Chot}**`, components: [row] });
            } else {
                const dbBC = await BetData.find({ type: 'bc' });
                if (dbBC.length === 0) return interaction.reply("Mây chưa có data BC.");
                const flatAnimals = dbBC.flatMap(v => v.animals);
                let chot = [flatAnimals[Math.floor(Math.random() * flatAnimals.length)], flatAnimals[Math.floor(Math.random() * flatAnimals.length)], flatAnimals[Math.floor(Math.random() * flatAnimals.length)]];
                
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`neko_bc_${interaction.user.id}`).setLabel('Lưu BC').setStyle(ButtonStyle.Danger));
                await interaction.reply({ content: `📊 **DỰ ĐOÁN BC (CLOUD)**\n- Tổng: ${dbBC.length} ván\n- Dự đoán: **${chot.join(" - ")}**`, components: [row] });
            }
        }

        if (commandName === "chat") {
            await interaction.deferReply();
            const r = await getAIReply(interaction.options.getString("content"));
            await interaction.editReply(r);
        }

        if (commandName === "soicau") {
            const loai = interaction.options.getString("loai");
            const data = await BetData.find({ type: loai === "taixiu" ? "tx" : "bc" }).sort({ createdAt: -1 }).limit(10);
            const list = data.map((h, i) => `${i + 1}. **${h.score || h.resultStr}**`).join("\n");
            await interaction.reply(`📜 **10 VÁN ${loai.toUpperCase()} TRÊN MÂY:**\n${list || "Trống."}`);
        }

        if (commandName === "newchat") {
            await BetData.deleteMany({});
            await ChatData.deleteMany({});
            await interaction.reply("Đã xoá sạch data trên mây.");
        }

        if (commandName === "start") { autoReply = true; await interaction.reply("Bot On."); }
        if (commandName === "stop") { autoReply = false; await interaction.reply("Bot Off."); }
        if (commandName === "avatar") { await interaction.reply(interaction.options.getUser("user").displayAvatarURL({ dynamic: true })); }
    }

    // --- XỬ LÝ Lưu DATA (LƯU LÊN MÂY) ---
    if (interaction.isButton() && interaction.customId.startsWith('neko_')) {
        const [, type, ownerId] = interaction.customId.split('_');
        if (interaction.user.id !== ownerId) return;
        const modal = new ModalBuilder().setCustomId(`modal_${type}`).setTitle(`Lưu ${type.toUpperCase()} Lên Mây`);
        const input = new TextInputBuilder().setCustomId('neko_text').setLabel("Dán KQ Neko").setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
        const raw = interaction.fields.getTextInputValue('neko_text');
        if (interaction.customId === 'modal_tx') {
            const m = raw.match(/=\s*\**(\d+)\**/);
            if (m) { 
                await BetData.create({ type: 'tx', score: parseInt(m[1]) });
                await interaction.reply({ content: `✅ Đã Lưu TX ${m[1]} lên mây!`, ephemeral: false }); 
            }
        } else if (interaction.customId === 'modal_bc') {
            const map = { "ca": "🐟 Cá", "bau": "🎃 Bầu", "cua": "🦀 Cua", "tom": "🦐 Tôm", "ga": "🐔 Gà", "nai": "🦌 Nai" };
            const matches = [...raw.matchAll(/<a?:([a-z]+)(?:_nk)?:/g)];
            const found = matches.map(m => map[m[1]]).filter(x => x);
            if (found.length > 0) {
                await BetData.create({ type: 'bc', animals: found, resultStr: found.join("-") });
                await interaction.reply({ content: `✅ Đã Lưu BC **${found.join(" ")}** lên mây!`, ephemeral: false });
            }
        }
    }
});

client.login(TOKEN);