const fs = require("fs");
const axios = require("axios");
const { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, 
    TextInputBuilder, TextInputStyle 
} = require("discord.js");

// --- CONFIG ---
const TOKEN = "MTQ0NDkzMTIxMDQxNjc1NDcyMA.GQ2fi5.2U4vcZTX0fmjACMrJ_psLxSVkwj9fR-G5ENM_8";
let API_KEY = "AIzaSyB09F64N6sj5BtZT3B_FnuvHo_MvyM-BH4";
const CLIENT_ID = "1444931210416754720";
const OWNER_ID = "1436539795340922922";
let CURRENT_MODEL = "gemini-1.5-flash";
let autoReply = true;

const FILE_TX = "memory_tx.json";
const FILE_BC = "memory_bc.json";
const FILE_CHAT = "memory_chat.json";

function loadFile(file, isArray = true) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(isArray ? [] : { history: [] }, null, 2));
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

let dbTX = loadFile(FILE_TX);
let dbBC = loadFile(FILE_BC);
let dbChat = loadFile(FILE_CHAT, false);

const saveTX = () => fs.writeFileSync(FILE_TX, JSON.stringify(dbTX, null, 2));
const saveBC = () => fs.writeFileSync(FILE_BC, JSON.stringify(dbBC, null, 2));
const saveChat = () => fs.writeFileSync(FILE_CHAT, JSON.stringify(dbChat, null, 2));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// --- COMMANDS ---
const commands = [
    new SlashCommandBuilder().setName("start").setDescription("Bật bot"),
    new SlashCommandBuilder().setName("stop").setDescription("Tắt bot"),
    new SlashCommandBuilder().setName("chat").setDescription("Chat vs AI").addStringOption(o => o.setName("content").setDescription("Nội dung").setRequired(true)),
    new SlashCommandBuilder().setName("dudoancobac").setDescription("Dự đoán dựa trên ALL DATA").addStringOption(o => o.setName("loai").setDescription("TX hoặc BC").setRequired(true).addChoices({ name: "Tài Xỉu", value: "taixiu" }, { name: "Bầu Cua", value: "baucua" })),
    new SlashCommandBuilder().setName("soicau").setDescription("Xem 10 ván gần nhất").addStringOption(o => o.setName("loai").setDescription("Loại cầu").setRequired(true).addChoices({ name: "Tài Xỉu", value: "taixiu" }, { name: "Bầu Cua", value: "baucua" })),
    new SlashCommandBuilder().setName("newchat").setDescription("Reset sạch data"),
    new SlashCommandBuilder().setName("avatar").setDescription("Bú avatar").addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
    try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); console.log("Bot Bịp Emoji Final On!"); } catch (err) { console.error(err); }
})();

// --- AI LOGIC ---
async function getAIReply(text) {
    const prompt = `Xưng m t. Ngôn ngữ genz, viết tắt "không" thành "k". Ngắn gọn nhất. Memory: ${JSON.stringify(dbChat.history.slice(-3))}\nU: ${text}`;
    try {
        const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${CURRENT_MODEL}:generateContent?key=${API_KEY}`, { contents: [{ parts: [{ text: prompt }] }] });
        const rep = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "k biết.";
        dbChat.history.push(`U: ${text}`, `B: ${rep}`);
        if (dbChat.history.length > 20) dbChat.history.shift();
        saveChat(); return rep;
    } catch { return "API oẳng r."; }
}

client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === "dudoancobac") {
            const loai = interaction.options.getString("loai");
            if (loai === "taixiu") {
                if (dbTX.length === 0) return interaction.reply("K có data TX.");
                const taiCount = dbTX.filter(h => h.score >= 11).length;
                const taiRate = (taiCount / dbTX.length) * 100;
                const predTX_Goc = taiRate >= 50 ? "TÀI" : "XỈU";
                const predTX_Chot = Math.random() * 100 < taiRate ? "TÀI" : "XỈU";
                const chanCount = dbTX.filter(h => h.score % 2 === 0).length;
                const chanRate = (chanCount / dbTX.length) * 100;
                const predCL_Goc = chanRate >= 50 ? "CHẴN" : "LẺ";
                const predCL_Chot = Math.random() * 100 < chanRate ? "CHẴN" : "LẺ";
                const counts = {}; dbTX.forEach(h => counts[h.score] = (counts[h.score] || 0) + 1);
                const num_Goc = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                const num_Chot = dbTX[Math.floor(Math.random() * dbTX.length)].score;

                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`neko_tx_${interaction.user.id}`).setLabel('Nạp TX').setStyle(ButtonStyle.Primary));
                await interaction.reply({ 
                    content: `📊 **DỰ ĐOÁN TX (${dbTX.length} ván)**\n━━━━━━━━━━━━━━━━━━\n🔴 **TÀI XỈU:**\n- Nhiều nhất: **${predTX_Goc}** (${Math.round(taiRate >= 50 ? taiRate : 100-taiRate)}%)\n- Dự đoán: **${predTX_Chot}**\n\n⚪ **CHẴN LẺ:**\n- Nhiều nhất: **${predCL_Goc}** (${Math.round(chanRate >= 50 ? chanRate : 100-chanRate)}%)\n- Dự đoán: **${predCL_Chot}**\n\n🎯 **SỐ:** Nhiều nhất **${num_Goc}** | Dự đoán **${num_Chot}**\n━━━━━━━━━━━━━━━━━━`, 
                    components: [row] 
                });
            } else {
                if (dbBC.length === 0) return interaction.reply("K có data BC.");
                const flatAnimals = dbBC.flatMap(v => v.animals);
                const counts = {}; flatAnimals.forEach(a => counts[a] = (counts[a] || 0) + 1);
                const top1_Goc = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);

                // Randomly select 3 results
                let chot = [];
                for (let i = 0; i < 3; i++) {
                    chot.push(flatAnimals[Math.floor(Math.random() * flatAnimals.length)]);
                }

                // Randomize the 3 results again
                const finalChoice = chot[Math.floor(Math.random() * chot.length)];

                // Determine the best choice based on frequency
                const bestChoice = chot.reduce((best, current) => {
                    return (counts[current] || 0) > (counts[best] || 0) ? current : best;
                });

                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`neko_bc_${interaction.user.id}`).setLabel('Nạp BC').setStyle(ButtonStyle.Danger));
                await interaction.reply({ 
                    content: `📊 **DỰ ĐOÁN BC (${dbBC.length} ván)**\n━━━━━━━━━━━━━━━━━━\n✨ **Nhiều nhất:** **${top1_Goc}**\n🎲 **Dự đoán:** **${chot.join(" - ")}**\n 🏆 **Dự đoán 1 con:** **${finalChoice}**\n\n━━━━━━━━━━━━━━━━━━`, 
                    components: [row] 
                });
            }
        }

        if (commandName === "chat") {
            await interaction.deferReply();
            const r = await getAIReply(interaction.options.getString("content"));
            await interaction.editReply(r);
        }

        if (commandName === "soicau") {
            const loai = interaction.options.getString("loai");
            const data = loai === "taixiu" ? dbTX : dbBC;
            const list = data.slice(-10).reverse().map((h, i) => `${i + 1}. **${h.score || h.result}**`).join("\n");
            await interaction.reply(`📜 **10 VÁN ${loai.toUpperCase()} MỚI NHẤT:**\n${list || "Trống."}`);
        }

        if (commandName === "newchat") {
            dbTX = []; dbBC = []; dbChat.history = []; saveTX(); saveBC(); saveChat();
            await interaction.reply("Xóa sạch data.");
        }

        if (commandName === "start") { autoReply = true; await interaction.reply("On."); }
        if (commandName === "stop") { autoReply = false; await interaction.reply("Off."); }
        if (commandName === "avatar") { await interaction.reply(interaction.options.getUser("user").displayAvatarURL({ dynamic: true })); }
    }

    if (interaction.isButton() && interaction.customId.startsWith('neko_')) {
        const [, type, ownerId] = interaction.customId.split('_');
        if (interaction.user.id !== ownerId) return;
        const modal = new ModalBuilder().setCustomId(`modal_${type}`).setTitle(`Nạp ${type.toUpperCase()}`);
        const input = new TextInputBuilder().setCustomId('neko_text').setLabel("Dán KQ Neko").setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
        const raw = interaction.fields.getTextInputValue('neko_text');
        if (interaction.customId === 'modal_tx') {
            const m = raw.match(/=\s*\**(\d+)\**/);
            if (m) { dbTX.push({ score: parseInt(m[1]), t: Date.now() }); saveTX(); await interaction.reply({ content: `Nạp TX ${m[1]} xong.`, ephemeral: false }); }
        } else if (interaction.customId === 'modal_bc') {
            const map = { "ca": "🐟 Cá", "bau": "🎃 Bầu", "cua": "🦀 Cua", "tom": "🦐 Tôm", "ga": "🐔 Gà", "nai": "🦌 Nai" };
            // Regex siêu vạn năng: Bốc chữ sau dấu : của cả emoji tĩnh <: và emoji động <a:
            const matches = [...raw.matchAll(/<a?:([a-z]+)(?:_nk)?:/g)];
            const found = matches.map(m => map[m[1]]).filter(x => x);
            if (found.length > 0) {
                dbBC.push({ result: found.join("-"), animals: found, t: Date.now() }); saveBC();
                await interaction.reply({ content: `Nạp BC **${found.join(" ")}** xong.`, ephemeral: false });
            } else await interaction.reply({ content: "Vẫn đéo bóc được emoji. Kiểm tra lại data m dán.", ephemeral: true });
        }
    }
});

client.login(TOKEN);