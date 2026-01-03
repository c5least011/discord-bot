require('dotenv').config();
const mongoose = require('mongoose');
const { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, 
    TextInputBuilder, TextInputStyle 
} = require("discord.js");

// --- KẾT NỐI MÂY (MONGODB) ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Data đã thông lên mây!"))
    .catch(err => console.error("❌ Lỗi MongoDB:", err));

const BetSchema = new mongoose.Schema({
    type: String,
    score: Number,
    animals: [String],
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
    new SlashCommandBuilder().setName("goiynoitu").setDescription("Gợi ý nối từ").addStringOption(o => o.setName("tu").setDescription("Nhập 1 từ").setRequired(true)),
    new SlashCommandBuilder().setName("dudoancobac").setDescription("Dự đoán ALL DATA trên mây").addStringOption(o => o.setName("loai").setDescription("TX hoặc BC").setRequired(true).addChoices({ name: "Tài Xỉu", value: "taixiu" }, { name: "Bầu Cua", value: "baucua" })),
    new SlashCommandBuilder().setName("soicau").setDescription("Xem 10 ván gần nhất").addStringOption(o => o.setName("loai").setDescription("Loại cầu").setRequired(true).addChoices({ name: "Tài Xỉu", value: "taixiu" }, { name: "Bầu Cua", value: "baucua" })),
    new SlashCommandBuilder().setName("avatar").setDescription("Bú avatar").addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
    try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); console.log("🚀 Bot Bịp Online!"); } catch (err) { console.error(err); }
})();

// --- AI LOGIC (Dùng fetch để tránh lỗi API Render) ---
async function getAIReply(text) {
    let chatMem = await ChatData.findOne();
    if (!chatMem) chatMem = await ChatData.create({ history: [] });
    const prompt = `Xưng m t. Ngôn ngữ genz, viết tắt "không" thành "k". Memory: ${JSON.stringify(chatMem.history.slice(-3))}\nU: ${text}`;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        const rep = data?.candidates?.[0]?.content?.parts?.[0]?.text || "k biết.";
        chatMem.history.push(`U: ${text}`, `B: ${rep}`);
        if (chatMem.history.length > 20) chatMem.history.shift();
        await chatMem.save(); return rep;
    } catch { return "API oẳng r."; }
}

async function getWordSuggestion(tu) {
    const prompt = `M là chuyên gia ngôn ngữ Việt Nam. Hãy tìm 1 từ ghép 2 tiếng bắt đầu bằng từ "${tu}". Từ này phải có nghĩa, phổ biến. CHỈ TRẢ VỀ ĐÚNG 2 TIẾNG ĐÓ, K GIẢI THÍCH.`;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        const rep = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        return rep ? rep.replace(/[*_]/g, '') : "Chịu.";
    } catch { return "API oẳng r."; }
}

// --- XỬ LÝ LỆNH ---
client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const isOwner = interaction.user.id === OWNER_ID;

        if (commandName === "start") {
            if (!isOwner) return interaction.reply({ content: "❌ Quyền gì?", ephemeral: true });
            autoReply = true; await interaction.reply("Bot On.");
        }

        if (commandName === "stop") {
            if (!isOwner) return interaction.reply({ content: "❌ Quyền gì?", ephemeral: true });
            autoReply = false; await interaction.reply("Bot Off.");
        }

        if (commandName === "goiynoitu") {
            const tu = interaction.options.getString("tu").trim();
            await interaction.deferReply({ ephemeral: true }); // Chỉ người dùng thấy
            const res = await getWordSuggestion(tu);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`other_${tu}`).setLabel('Từ khác').setStyle(ButtonStyle.Secondary)
            );
            await interaction.editReply({ content: `👉 **${res}**`, components: [row] });
        }

        if (commandName === "chat") {
            await interaction.deferReply();
            const r = await getAIReply(interaction.options.getString("content"));
            await interaction.editReply(r);
        }

        if (commandName === "dudoancobac") {
            const loai = interaction.options.getString("loai");
            if (loai === "taixiu") {
                const dbTX = await BetData.find({ type: 'tx' });
                if (dbTX.length === 0) return interaction.reply("Mây k có data TX.");
                const taiCount = dbTX.filter(h => h.score >= 11).length;
                const taiRate = (taiCount / dbTX.length) * 100;
                const predTX_Chot = Math.random() * 100 < taiRate ? "TÀI" : "XỈU";
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`neko_tx_${interaction.user.id}`).setLabel('Lưu TX').setStyle(ButtonStyle.Primary));
                await interaction.reply({ content: `📊 **CLOUD TX**: Dự đoán **${predTX_Chot}**`, components: [row] });
            } else {
                const dbBC = await BetData.find({ type: 'bc' });
                if (dbBC.length === 0) return interaction.reply("Mây k có data BC.");
                const flatAnimals = dbBC.flatMap(v => v.animals);
                let chot = []; for (let i = 0; i < 3; i++) chot.push(flatAnimals[Math.floor(Math.random() * flatAnimals.length)]);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`neko_bc_${interaction.user.id}`).setLabel('Lưu BC').setStyle(ButtonStyle.Danger));
                await interaction.reply({ content: `🎲 **Dự đoán BC:** **${chot.join(" - ")}**`, components: [row] });
            }
        }

        if (commandName === "soicau") {
            const loai = interaction.options.getString("loai");
            const data = await BetData.find({ type: loai === "taixiu" ? "tx" : "bc" }).sort({ createdAt: -1 }).limit(10);
            const list = data.map((h, i) => `${i + 1}. **${h.score || h.resultStr}**`).join("\n");
            await interaction.reply(`📜 **10 VÁN ${loai.toUpperCase()} MỚI NHẤT:**\n${list || "Trống."}`);
        }

        if (commandName === "avatar") {
            await interaction.reply(interaction.options.getUser("user").displayAvatarURL({ dynamic: true }));
        }
    }

    // --- XỬ LÝ NÚT BẤM ---
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('other_')) {
            const tu = interaction.customId.split('_')[1];
            await interaction.deferUpdate(); // Không cần check owner
            const res = await getWordSuggestion(tu);
            await interaction.editReply({ content: `👉 **${res}**` });
        }

        if (interaction.customId.startsWith('neko_')) {
            const [, type, ownerId] = interaction.customId.split('_');
            if (interaction.user.id !== ownerId) return interaction.reply({ content: "K phải nút của m.", ephemeral: true });
            const modal = new ModalBuilder().setCustomId(`modal_${type}`).setTitle(`Lưu ${type.toUpperCase()}`);
            const input = new TextInputBuilder().setCustomId('neko_text').setLabel("Dán KQ Neko").setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }
    }

    // --- XỬ LÝ MODAL ---
    if (interaction.isModalSubmit()) {
        const raw = interaction.fields.getTextInputValue('neko_text');
        if (interaction.customId === 'modal_tx') {
            const m = raw.match(/=\s*\**(\d+)\**/);
            if (m) { 
                await BetData.create({ type: 'tx', score: parseInt(m[1]) });
                await interaction.reply({ content: `✅ Đã Lưu TX **${m[1]}**`, ephemeral: false }); 
            }
        } else if (interaction.customId === 'modal_bc') {
            const map = { "ca": "🐟 Cá", "bau": "🎃 Bầu", "cua": "🦀 Cua", "tom": "🦐 Tôm", "ga": "🐔 Gà", "nai": "🦌 Nai" };
            const matches = [...raw.matchAll(/<a?:([a-z]+)(?:_nk)?:/g)];
            const found = matches.map(m => map[m[1]]).filter(x => x);
            if (found.length > 0) {
                await BetData.create({ type: 'bc', animals: found, resultStr: found.join("-") });
                await interaction.reply({ content: `✅ Đã Lưu BC **${found.join(" ")}**`, ephemeral: false });
            }
        }
    }
});

client.login(TOKEN);

// Server chống lỗi Render
const http = require('http');
http.createServer((req, res) => {
    res.writeHead(200); res.end('Bot Online!');
}).listen(process.env.PORT || 3000);
