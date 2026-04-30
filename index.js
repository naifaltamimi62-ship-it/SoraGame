const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    StringSelectMenuBuilder, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, Partials, MessageFlags 
} = require('discord.js');
const http = require('http');
const mongoose = require('mongoose');

// --- 1. إبقاء البوت حياً ---
const port = process.env.PORT || 10000; 
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Sora Bot - Multi-Server Logic Active");
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

// الموديل المحدث: الشخصية مرتبطة بالمستخدم + السيرفر
const Player = mongoose.model('Player', new mongoose.Schema({
    userId: String,
    guildId: String, 
    name: String,
    desc: String
}));

const GuildConfig = mongoose.model('GuildConfig', new mongoose.Schema({
    guildId: String,
    channelId: String
}));

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel, Partials.Message]
});

// --- 3. الأوامر المحدثة (بدون الحاجة لـ ID السيرفر يدوياً) ---
const commands = [
    new SlashCommandBuilder().setName('login').setDescription('تسجيل شخصية لهذا السيرفر (استخدمه في روم اللعبة)')
        .addStringOption(opt => opt.setName('name').setDescription('اسم الشخصية').setRequired(true))
        .addStringOption(opt => opt.setName('desc').setDescription('وصف الشخصية').setRequired(true)),
    
    new SlashCommandBuilder().setName('say').setDescription('ارسل رسالة مجهولة')
        .addStringOption(opt => opt.setName('message').setDescription('محتوى الرسالة').setRequired(true)),

    new SlashCommandBuilder().setName('who').setDescription('عرض شخصيات هذا السيرفر فقط'),

    new SlashCommandBuilder().setName('admin_tools').setDescription('أدوات الإدارة')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('action').setDescription('الأمر').setRequired(true)
            .addChoices(
                { name: '📢 إرسال إعلان', value: 'announcement' },
                { name: '🔍 كشف الهويات', value: 'list_players' },
                { name: '🗳️ بدء تصويت', value: 'start_vote' },
                { name: '📍 ضبط القناة', value: 'set_channel' }
            ))
        .addStringOption(opt => opt.setName('text').setDescription('نص الإعلان (اختياري)').setRequired(false)),
].map(c => c.toJSON());

client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ البوت جاهز للفصل بين السيرفرات: ${client.user.tag}`);
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu()) return;
    const { commandName, options, guildId, user } = interaction;

    if (commandName === 'login') {
        if (!guildId) return interaction.reply('❌ سجل داخل السيرفر ليتم ربط شخصيتك به!');
        
        // سيتم حفظ الشخصية لهذا السيرفر فقط
        await Player.findOneAndUpdate(
            { userId: user.id, guildId: guildId },
            { name: options.getString('name'), desc: options.getString('desc') },
            { upsert: true }
        );
        
        return interaction.reply({ content: `✅ تم تسجيل شخصيتك في هذا السيرفر بنجاح! هويتك مخفية عن الآخرين.`, flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === 'say') {
        if (!guildId) return interaction.reply('❌ استخدمه داخل السيرفر!');
        const p = await Player.findOne({ userId: user.id, guildId: guildId });
        if (!p) return interaction.reply({ content: '❌ ليس لديك شخصية في هذا السيرفر! سجل أولاً بـ /login', flags: [MessageFlags.Ephemeral] });
        
        const config = await GuildConfig.findOne({ guildId });
        if (!config) return interaction.reply({ content: '❌ لم يتم ضبط قناة اللعبة بعد!', flags: [MessageFlags.Ephemeral] });

        const channel = await client.channels.fetch(config.channelId);
        await channel.send({ embeds: [new EmbedBuilder().setAuthor({ name: p.name }).setDescription(options.getString('message')).setColor('#2b2d31')] });
        return interaction.reply({ content: '✅ أرسلت بنجاح.', flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === 'who') {
        if (!guildId) return interaction.reply('❌ استخدمه داخل السيرفر!');
        const players = await Player.find({ guildId: guildId });
        let list = players.map(v => `🎭 **${v.name}:** ${v.desc}`).join('\n\n');
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('قائمة الشخصيات هنا').setDescription(list || 'لا يوجد لاعبين حالياً')], flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === 'admin_tools') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const act = options.getString('action');

        if (act === 'set_channel') {
            await GuildConfig.findOneAndUpdate({ guildId }, { channelId: interaction.channelId }, { upsert: true });
            return interaction.editReply('✅ تم ضبط هذه القناة كمقر للعبة.');
        }

        const config = await GuildConfig.findOne({ guildId });
        if (act === 'announcement') {
            const text = options.getString('text');
            if (!text) return interaction.editReply('❌ يرجى كتابة النص في خانة text');
            const channel = await client.channels.fetch(config.channelId);
            await channel.send({ content: '@everyone', embeds: [new EmbedBuilder().setDescription(text).setColor('#ffcc00')] });
            return interaction.editReply('✅ تم الإرسال.');
        }
        
        if (act === 'list_players') {
            const players = await Player.find({ guildId: guildId });
            let list = players.map(v => `👤 **${v.name}** -> <@${v.userId}>`).join('\n');
            return interaction.editReply(list || "لا توجد بيانات لهذا السيرفر");
        }

        if (act === 'start_vote') {
            const players = await Player.find({ guildId: guildId });
            const menu = new StringSelectMenuBuilder().setCustomId('vote').setPlaceholder('اختر المشتبه به')
                .addOptions(players.map(p => ({ label: p.name, value: p.name })));
            const channel = await client.channels.fetch(config.channelId);
            await channel.send({ content: '🚨 **بدأ التصويت المجهول!**', components: [new ActionRowBuilder().addComponents(menu)] });
            return interaction.editReply('✅ بدأ التصويت.');
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'vote') {
        await interaction.reply({ content: `✅ تم التصويت ضد: ${interaction.values[0]}`, flags: [MessageFlags.Ephemeral] });
    }
});

client.login(token);