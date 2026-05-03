const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    StringSelectMenuBuilder, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, Partials, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const http = require('http');
const mongoose = require('mongoose');

// --- Keep Alive ---
const port = process.env.PORT || 10000; 
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Sora Bot - Stealth Fixed");
    res.end();
}).listen(port, '0.0.0.0');

// --- Database ---
let token, mongoUri;
try {
    const config = require('./config.json');
    token = config.token;
    mongoUri = config.MONGO_URI;
} catch (e) {
    token = process.env.token;
    mongoUri = process.env.MONGO_URI;
}

mongoose.connect(mongoUri).then(() => console.log("📦 Connected to MongoDB!"));

const Player = mongoose.model('Player', new mongoose.Schema({
    userId: String, guildId: String, name: String, desc: String
}));

const Vote = mongoose.model('Vote', new mongoose.Schema({
    guildId: String, voterId: String, q1: String, q2: String, q3: String
}));

const GuildConfig = mongoose.model('GuildConfig', new mongoose.Schema({
    guildId: String, channelId: String
}));

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel, Partials.Message]
});

// --- Commands Register ---
const commands = [
    new SlashCommandBuilder().setName('login').setDescription('تسجيل شخصية لهذا السيرفر')
        .addStringOption(opt => opt.setName('name').setDescription('اسم الشخصية').setRequired(true))
        .addStringOption(opt => opt.setName('desc').setDescription('وصف الشخصية').setRequired(true)),
    
    new SlashCommandBuilder().setName('say').setDescription('ارسل رسالة مجهولة (بدون ظهور typing)'),

    new SlashCommandBuilder().setName('who').setDescription('عرض شخصيات هذا السيرفر'),

    new SlashCommandBuilder().setName('admin_tools').setDescription('أدوات الإدارة')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('action').setDescription('الأمر').setRequired(true)
            .addChoices(
                { name: '📢 إرسال إعلان', value: 'announcement' },
                { name: '🗳️ بدء التصويت الثلاثي', value: 'start_triple_vote' },
                { name: '📊 عرض نتائج التصويت', value: 'show_results' },
                { name: '📍 ضبط القناة', value: 'set_channel' },
                { name: '🔍 كشف الهويات', value: 'list_players' },
                { name: '❌ حذف جميع البيانات', value: 'reset_all' }
            ))
        .addStringOption(opt => opt.setName('text').setDescription('نص الإعلان').setRequired(false)),
].map(c => c.toJSON());

client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ البوت جاهز: ${client.user.tag}`);
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async interaction => {
    // 1. فتح النافذة المنبثقة (Modal)
    if (interaction.isChatInputCommand() && interaction.commandName === 'say') {
        const p = await Player.findOne({ userId: interaction.user.id, guildId: interaction.guildId });
        if (!p) return interaction.reply({ content: '❌ سجل بـ /login أولاً!', ephemeral: true });

        const modal = new ModalBuilder().setCustomId('say_modal').setTitle('إرسال رسالة مجهولة');
        const messageInput = new TextInputBuilder()
            .setCustomId('message_text')
            .setLabel("اكتب رسالتك (لن يظهر أنك تكتب)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(messageInput));
        return await interaction.showModal(modal);
    }

    // 2. معالجة إرسال النص من النافذة (تم إصلاح الربط هنا)
    if (interaction.isModalSubmit() && interaction.customId === 'say_modal') {
        await interaction.deferReply({ ephemeral: true });
        
        const p = await Player.findOne({ userId: interaction.user.id, guildId: interaction.guildId });
        const config = await GuildConfig.findOne({ guildId: interaction.guildId });
        
        if (!config) return interaction.editReply('❌ اطلب من الأدمن ضبط القناة بـ /admin_tools set_channel');
        
        const messageText = interaction.fields.getTextInputValue('message_text');
        const channel = await client.channels.fetch(config.channelId).catch(() => null);
        
        if (!channel) return interaction.editReply('❌ القناة المحددة غير موجودة!');

        await channel.send({ embeds: [new EmbedBuilder().setAuthor({ name: p.name }).setDescription(messageText).setColor('#2b2d31')] });
        return interaction.editReply('✅ تم إرسال رسالتك بسرية تامة!');
    }

    // 3. بقية الأوامر
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guildId, user } = interaction;
        await interaction.deferReply({ ephemeral: true });

        if (commandName === 'login') {
            await Player.findOneAndUpdate({ userId: user.id, guildId }, { name: options.getString('name'), desc: options.getString('desc') }, { upsert: true });
            return interaction.editReply(`✅ سجلت بشخصية: **${options.getString('name')}**`);
        }

        if (commandName === 'who') {
            const players = await Player.find({ guildId });
            let list = players.map(v => `🎭 **${v.name}:** ${v.desc}`).join('\n\n');
            return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('قائمة الشخصيات').setDescription(list || 'لا يوجد لاعبين')] });
        }

        if (commandName === 'admin_tools') {
            const act = options.getString('action');
            if (act === 'set_channel') {
                await GuildConfig.findOneAndUpdate({ guildId }, { channelId: interaction.channelId }, { upsert: true });
                return interaction.editReply('✅ تم ضبط القناة للرسائل المجهولة.');
            }
            if (act === 'start_triple_vote') {
                const players = await Player.find({ guildId });
                if (players.length < 3) return interaction.editReply('❌ نحتاج 3 لاعبين على الأقل!');
                await Vote.deleteMany({ guildId });
                for (const p of players) {
                    const target = await client.users.fetch(p.userId).catch(() => null);
                    if (target) {
                        const row = (id, label) => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(label).addOptions(players.map(pl => ({ label: pl.name, value: pl.name }))));
                        await target.send({ 
                            content: `🗳️ **تصويت سيرفر ${interaction.guild.name}**`, 
                            components: [row('q1', 'مين اكثر شخص غثيث؟'), row('q2', 'مين اكثر شخص ثقيل دم؟'), row('q3', 'مين الشخص الي تبي تطرده؟')] 
                        }).catch(() => {});
                    }
                }
                return interaction.editReply('✅ تم إرسال التصويت للجميع.');
            }
            if (act === 'show_results') {
                const res = await Vote.find({ guildId });
                let summary = res.map(v => `👤 **المصوت:** <@${v.voterId}>\n> 😖 الغثيث: ${v.q1}\n> 💩 الثقيل: ${v.q2}\n> 🚪 طرد: ${v.q3}`).join('\n───\n');
                return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('📊 النتائج').setDescription(summary || "لا نتائج")] });
            }
            if (act === 'list_players') {
                const players = await Player.find({ guildId });
                let list = players.map(p => `🎭 **${p.name}** هو <@${p.userId}>`).join('\n');
                return interaction.editReply(`🔍 كشف الهويات:\n${list || "فارغ"}`);
            }
            if (act === 'reset_all') {
                await Player.deleteMany({ guildId });
                await Vote.deleteMany({ guildId });
                return interaction.editReply('🗑️ تم التصفير.');
            }
        }
    }

    // تصويت الخاص
    if (interaction.isStringSelectMenu()) {
        await interaction.deferReply({ ephemeral: true });
        let v = await Vote.findOne({ voterId: interaction.user.id });
        if (!v) v = new Vote({ voterId: interaction.user.id, guildId: "active", q1: '-', q2: '-', q3: '-' });
        if (interaction.customId === 'q1') v.q1 = interaction.values[0];
        if (interaction.customId === 'q2') v.q2 = interaction.values[0];
        if (interaction.customId === 'q3') v.q3 = interaction.values[0];
        await v.save();
        return interaction.editReply(`✅ اخترت: ${interaction.values[0]}`);
    }
});

client.login(token);