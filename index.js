require('dotenv').config();
const mongoose = require('mongoose');
const { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, 
    TextInputBuilder, TextInputStyle 
} = require("discord.js");
const axios = require("axios");

// --- KẾT NỐI MÂY ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Data thông lên mây!"))
    .catch(err => console.error("❌ Lỗi MongoDB:", err));

const BetData = mongoose.model('BetData', new mongoose.Schema({
    type: String, score: Number, animals: [String], resultStr: String, createdAt: { type: Date, default: Date.now }
}));

const ChatData = mongoose.model('ChatData', new mongoose.Schema({ history: [String] }));

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
    new SlashCommandBuilder().setName("dudoancobac").setDescription("Dự đoán ALL DATA trên mây").addStringOption(o => o.setName("loai").setDescription("TX hoặc BC").setRequired(true).addChoices({ name: "Tài Xỉu", value: "taixiu" }, { name: "Bầu Cua", value: "baucua" })),
    new SlashCommandBuilder().setName("dudoancobac2").setDescription("Dự đoán BETA (Soi Cầu)").addStringOption(o => o.setName("loai").setDescription("TX hoặc BC").setRequired(true).addChoices({ name: "Tài Xỉu", value: "taixiu" }, { name: "Bầu Cua", value: "baucua" })),
    new SlashCommandBuilder().setName("soicau").setDescription("Xem 10 ván gần nhất").addStringOption(o => o.setName("loai").setDescription("Loại cầu").setRequired(true).addChoices({ name: "Tài Xỉu", value: "taixiu" }, { name: "Bầu Cua", value: "baucua" })),
    new SlashCommandBuilder().setName("avatar").setDescription("Bú avatar").addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
    try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); console.log("🚀 Bot Bịp Online!"); } catch (err) { console.error(err); }
})();

// --- AI LOGIC ---
async function getAIReply(text) {
    let chatMem = await ChatData.findOne();
    if (!chatMem) chatMem = await ChatData.create({ history: [] });
    const prompt = `Xưng m t. Ngôn ngữ genz, viết tắt "không" thành "k". Ngắn gọn nhất. Memory: ${JSON.stringify(chatMem.history.slice(-3))}\nU: ${text}`;
    try {
        const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, { contents: [{ parts: [{ text: prompt }] }] });
        const rep = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "k biết.";
        chatMem.history.push(`U: ${text}`, `B: ${rep}`);
        if (chatMem.history.length > 20) chatMem.history.shift();
        await chatMem.save(); return rep;
    } catch { return "API oẳng r."; }
}

// --- LOGIC BETA (SOI CẦU) ---
async function predictBeta(type) {
    const data = await BetData.find({ type: type === "taixiu" ? "tx" : "bc" }).sort({ createdAt: -1 }).limit(6);
    if (data.length < 4) return "K đủ data để soi cầu m ơi!";

    if (type === 'taixiu') {
        const arr = data.map(d => (d.score > 10 ? 'T' : 'X')).reverse();
        const last = arr[arr.length - 1];
        if (arr.slice(-5).every(v => v === last)) return `🔥 Cầu Bệt: **${last}**`;
        if (arr.slice(-4).every((v, i) => i === 0 || v !== arr[arr.length - 5 + i])) return `⚡ Cầu Đảo: **${last === 'T' ? 'X' : 'T'}**`;
        if (arr.slice(-4).join('') === 'TTXX' || arr.slice(-4).join('') === 'XXTT') return `💎 Cầu 2-2: **${last}**`;
        return `🎲 Tỉ lệ: **${arr.filter(v => v === 'T').length > 3 ? 'Tài' : 'Xỉu'}**`;
    } else {
        const all = data.flatMap(d => d.animals);
        const counts = all.reduce((acc, a) => ({ ...acc, [a]: (acc[a] || 0) + 1 }), {});
        return `✨ Hay về: **${Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 2).join(', ')}**`;
    }
}

// --- XỬ LÝ LỆNH ---
client.on("interactionCreate", async (interaction) => {
    const rowTX = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`neko_tx_${interaction.user.id}`).setLabel('Lưu TX').setStyle(ButtonStyle.Primary));
    const rowBC = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`neko_bc_${interaction.user.id}`).setLabel('Lưu BC').setStyle(ButtonStyle.Danger));

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const isOwner = interaction.user.id === OWNER_ID;

        if (commandName === "start" && isOwner) { autoReply = true; return interaction.reply("Bot On."); }
        if (commandName === "stop" && isOwner) { autoReply = false; return interaction.reply("Bot Off."); }

        if (commandName === "dudoancobac") {
            const loai = interaction.options.getString("loai");
            if (loai === "taixiu") {
                const dbTX = await BetData.find({ type: 'tx' });
                if (dbTX.length === 0) return interaction.reply({ content: "Mây k có data TX.", components: [rowTX] });
                const taiCount = dbTX.filter(h => h.score >= 11).length;
                const taiRate = (taiCount / dbTX.length) * 100;
                const predTX_Chot = Math.random() * 100 < taiRate ? "TÀI" : "XỈU";
                await interaction.reply({ content: `📊 **CLOUD TX (${dbTX.length} ván)**\n- Dự đoán: **${predTX_Chot}**`, components: [rowTX] });
            } else {
                const dbBC = await BetData.find({ type: 'bc' });
                if (dbBC.length === 0) return interaction.reply({ content: "Mây k có data BC.", components: [rowBC] });
                const flatAnimals = dbBC.flatMap(v => v.animals);
                let chot = [flatAnimals[Math.floor(Math.random() * flatAnimals.length)], flatAnimals[Math.floor(Math.random() * flatAnimals.length)]];
                await interaction.reply({ content: `📊 **CLOUD BC (${dbBC.length} ván)**\n- Dự đoán: **${chot.join(" - ")}**`, components: [rowBC] });
            }
        }

        if (commandName === "dudoancobac2") {
            const loai = interaction.options.getString("loai");
            const res = await predictBeta(loai);
            await interaction.reply({ content: `🧪 **[BETA] SOI CẦU ${loai.toUpperCase()}**\n${res}`, components: [loai === "taixiu" ? rowTX : rowBC] });
        }

        if (commandName === "soicau") {
            const loai = interaction.options.getString("loai");
            const data = await BetData.find({ type: loai === "taixiu" ? "tx" : "bc" }).sort({ createdAt: -1 }).limit(10);
            const list = data.map((h, i) => `${i + 1}. **${h.score || h.resultStr}**`).join("\n");
            await interaction.reply({ content: `📜 **10 VÁN ${loai.toUpperCase()} GẦN NHẤT:**\n${list || "Trống."}`, components: [loai === "taixiu" ? rowTX : rowBC] });
        }

        if (commandName === "chat") { await interaction.deferReply(); const r = await getAIReply(interaction.options.getString("content")); await interaction.editReply(r); }
        if (commandName === "avatar") { await interaction.reply(interaction.options.getUser("user").displayAvatarURL({ dynamic: true })); }
    }

    // --- BUTTON & MODAL ---
    if (interaction.isButton() && interaction.customId.startsWith('neko_')) {
        const [, type, ownerId] = interaction.customId.split('_');
        if (interaction.user.id !== ownerId) return interaction.reply({ content: "K phải nút của m!", ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`modal_${type}`).setTitle(`Lưu ${type.toUpperCase()}`);
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('neko_text').setLabel("Dán KQ Neko").setStyle(TextInputStyle.Paragraph).setRequired(true)));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
        const raw = interaction.fields.getTextInputValue('neko_text');
        if (interaction.customId === 'modal_tx') {
            const m = raw.match(/=\s*\**(\d+)\**/);
            if (m) { 
                await BetData.create({ type: 'tx', score: parseInt(m[1]) });
                await interaction.reply({ content: `✅ Đã Lưu TX **${m[1]}**`, components: [rowTX] }); 
            }
        } else if (interaction.customId === 'modal_bc') {
            const map = { "ca": "🐟 Cá", "bau": "🎃 Bầu", "cua": "🦀 Cua", "tom": "🦐 Tôm", "ga": "🐔 Gà", "nai": "🦌 Nai" };
            const found = [...raw.matchAll(/<a?:([a-z]+)(?:_nk)?:/g)].map(m => map[m[1]]).filter(x => x);
            if (found.length) {
                await BetData.create({ type: 'bc', animals: found, resultStr: found.join("-") });
                await interaction.reply({ content: `✅ Đã Lưu BC **${found.join(" ")}**`, components: [rowBC] });
            }
        }
    }
});

client.login(TOKEN);
require('http').createServer((req, res) => { res.end('Bot Online!'); }).listen(process.env.PORT || 3000);
