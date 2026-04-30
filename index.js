const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    StringSelectMenuBuilder, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, Partials, MessageFlags 
} = require('discord.js');
const http = require('http');
const mongoose = require('mongoose');

// --- 1. نظام إبقاء البوت حياً ---
const port = process.env.PORT || 10000; 
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Sora Bot - Triple Announcement Fix");
    res.end();
}).listen(port, '0.0.0.0');

// --- 2. الربط بالقاعدة ---
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
    guildId: String, voterId: String,
    q1: String, q2: String, q3: String
}));

const GuildConfig = mongoose.model('GuildConfig', new mongoose.Schema({
    guildId: String, channelId: String
}));

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel, Partials.Message]
});

const commands = [
    new SlashCommandBuilder().setName('login').setDescription('تسجيل شخصية لهذا السيرفر')
        .addStringOption(opt => opt.setName('name').setDescription('اسم الشخصية').setRequired(true))
        .addStringOption(opt => opt.setName('desc').setDescription('وصف الشخصية').setRequired(true)),
    
    new SlashCommandBuilder().setName('say').setDescription('ارسل رسالة مجهولة')
        .addStringOption(opt => opt.setName('message').setDescription('محتوى الرسالة').setRequired(true)),

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

// استخدام clientReady لحل مشكلة التحذير في Node v24
client.once('clientReady', async () => {
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ البوت جاهز ومستقر: ${client.user.tag}`);
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu()) return;

    // منع التكرار: إذا تم الرد بالفعل، لا تفعل شيئاً
    if (interaction.replied || interaction.deferred) return;

    const { commandName, options, guildId, user } = interaction;

    if (commandName === 'login') {
        await Player.findOneAndUpdate({ userId: user.id, guildId }, { name: options.getString('name'), desc: options.getString('desc') }, { upsert: true });
        return interaction.reply({ content: `✅ سجلت شخصيتك بنجاح!`, flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === 'say') {
        const p = await Player.findOne({ userId: user.id, guildId });
        if (!p) return interaction.reply({ content: '❌ سجل بـ /login أولاً!', flags: [MessageFlags.Ephemeral] });
        const config = await GuildConfig.findOne({ guildId });
        if (!config) return interaction.reply({ content: '❌ لم يتم ضبط القناة!', flags: [MessageFlags.Ephemeral] });
        const channel = await client.channels.fetch(config.channelId);
        await channel.send({ embeds: [new EmbedBuilder().setAuthor({ name: p.name }).setDescription(options.getString('message')).setColor('#2b2d31')] });
        return interaction.reply({ content: '✅ تم الإرسال!', flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === 'admin_tools') {
        const act = options.getString('action');
        
        if (act === 'set_channel') {
            await GuildConfig.findOneAndUpdate({ guildId }, { channelId: interaction.channelId }, { upsert: true });
            return interaction.reply({ content: '✅ تم ضبط القناة.', flags: [MessageFlags.Ephemeral] });
        }

        if (act === 'announcement') {
            const text = options.getString('text');
            if (!text) return interaction.reply({ content: '❌ اكتب النص في خانة text!', flags: [MessageFlags.Ephemeral] });
            const config = await GuildConfig.findOne({ guildId });
            const channel = await client.channels.fetch(config.channelId);
            
            // التأكد من إرسال رسالة واحدة
            await channel.send({ content: '@everyone', embeds: [new EmbedBuilder().setTitle('📢 إعلان الإدارة').setDescription(text).setColor('#ffcc00')] });
            return interaction.reply({ content: '✅ تم إرسال الإعلان.', flags: [MessageFlags.Ephemeral] });
        }

        // ... بقية الأوامر (Triple Vote, Results, List, Reset) بنفس المنطق المستقر
        if (act === 'start_triple_vote') {
            const players = await Player.find({ guildId });
            if (players.length < 2) return interaction.reply({ content: '❌ اللاعبين قليلين!', flags: [MessageFlags.Ephemeral] });
            await Vote.deleteMany({ guildId });
            for (const p of players) {
                const target = await client.users.fetch(p.userId).catch(() => null);
                if (target) {
                    const row = (id, label) => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(label).addOptions(players.map(pl => ({ label: pl.name, value: pl.name }))));
                    await target.send({ content: `🚨 **تصويت سيرفر ${interaction.guild.name}**`, components: [row('q1', 'الأكثر غثاثة؟'), row('q2', 'الأثقل دماً؟'), row('q3', 'من تريد طرده؟')] }).catch(() => {});
                }
            }
            return interaction.reply({ content: '✅ أرسلت الأسئلة في الخاص!', flags: [MessageFlags.Ephemeral] });
        }
        
        if (act === 'show_results') {
            const res = await Vote.find({ guildId });
            let summary = res.map((v, i) => `🗳️ **تصويت ${i+1}:**\nغثيث: ${v.q1} | ثقيل دم: ${v.q2} | طرد: ${v.q3}`).join('\n\n');
            return interaction.reply({ content: summary || "لا توجد نتائج", flags: [MessageFlags.Ephemeral] });
        }

        if (act === 'reset_all') {
            await Player.deleteMany({ guildId });
            await Vote.deleteMany({ guildId });
            return interaction.reply({ content: '🗑️ تم تصفير بيانات السيرفر.', flags: [MessageFlags.Ephemeral] });
        }
    }

    if (interaction.isStringSelectMenu()) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        let v = await Vote.findOne({ voterId: user.id });
        if (!v) v = new Vote({ voterId: user.id, guildId: interaction.guildId || "unknown", q1: '-', q2: '-', q3: '-' });
        if (interaction.customId === 'q1') v.q1 = interaction.values[0];
        if (interaction.customId === 'q2') v.q2 = interaction.values[0];
        if (interaction.customId === 'q3') v.q3 = interaction.values[0];
        await v.save();
        return interaction.editReply(`✅ سجلت اختيارك: ${interaction.values[0]}`);
    }
});

client.login(token);