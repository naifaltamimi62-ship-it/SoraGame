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
    res.write("Spy Bot (Global Edition) is Awake!");
    res.end();
}).listen(port, '0.0.0.0');

// --- 2. جلب البيانات والربط بالقاعدة ---
let token, mongoUri;
try {
    const config = require('./config.json');
    token = config.token;
    mongoUri = config.MONGO_URI;
} catch (e) {
    token = process.env.token;
    mongoUri = process.env.MONGO_URI;
}

mongoose.connect(mongoUri)
    .then(() => console.log("📦 Connected to MongoDB!"))
    .catch(err => console.error("❌ DB Error:", err));

// موديل اللاعبين
const Player = mongoose.model('Player', new mongoose.Schema({
    userId: String,
    guildId: String, // مضاف لدعم تعدد السيرفرات
    name: String,
    desc: String
}));

// موديل إعدادات السيرفرات
const GuildConfig = mongoose.model('GuildConfig', new mongoose.Schema({
    guildId: String,
    channelId: String
}));

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.DirectMessages 
    ],
    partials: [Partials.Channel, Partials.Message]
});

// --- 3. تعريف الأوامر ---
const commands = [
    new SlashCommandBuilder().setName('login').setDescription('التسجيل (في الخاص فقط)')
        .addStringOption(opt => opt.setName('name').setDescription('اسم الشخصية').setRequired(true))
        .addStringOption(opt => opt.setName('desc').setDescription('وصف الشخصية').setRequired(true)),
    
    new SlashCommandBuilder().setName('say').setDescription('ارسل رسالة مجهولة')
        .addStringOption(opt => opt.setName('message').setDescription('محتوى الرسالة').setRequired(true)),

    new SlashCommandBuilder().setName('who').setDescription('عرض أوصاف الشخصيات في هذا السيرفر'),

    new SlashCommandBuilder().setName('admin_tools').setDescription('أدوات الإدارة')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('action').setDescription('اختر الإجراء').setRequired(true)
            .addChoices(
                { name: 'إرسال إعلان مخصص', value: 'announcement' },
                { name: 'رؤية الأسماء الحقيقية', value: 'list_players' },
                { name: 'حذف شخصية', value: 'delete_player' },
                { name: 'بدء التصويت', value: 'start_vote' },
                { name: 'تحديد قناة اللعبة (هنا)', value: 'set_channel' }
            ))
        .addStringOption(opt => opt.setName('text').setDescription('نص الإعلان (يستخدم مع خيار الإعلان فقط)')),
].map(c => c.toJSON());

// --- 4. التشغيل ---
client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ البوت العام شغال: ${client.user.tag}`);
    } catch (e) { console.error(e); }
});

// --- 5. التفاعلات (Interactions) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu()) return;

    if (interaction.isChatInputCommand()) {
        const { commandName, options, guildId, user } = interaction;

        // --- أمر التسجيل (يعمل في الخاص ويحفظ السيرفر الأخير) ---
        if (commandName === 'login') {
            if (guildId) return interaction.reply({ content: '❌ سجل في الخاص لحماية هويتك!', flags: [MessageFlags.Ephemeral] });
            
            // ملاحظة: اللاعب يسجل "عالميًا" حاليًا، يمكنك تعديله لاحقًا ليكون لكل سيرفر شخصية
            await Player.findOneAndUpdate(
                { userId: user.id },
                { name: options.getString('name'), desc: options.getString('desc') },
                { upsert: true }
            );
            return interaction.reply('✅ تم تسجيل شخصيتك بنجاح!');
        }

        // --- أمر الإرسال (يبحث عن قناة السيرفر) ---
        if (commandName === 'say') {
            if (!guildId) return interaction.reply('❌ استخدم هذا الأمر داخل السيرفر!');
            
            const p = await Player.findOne({ userId: user.id });
            if (!p) return interaction.reply({ content: '❌ سجل أولاً في الخاص بـ /login', flags: [MessageFlags.Ephemeral] });
            
            const config = await GuildConfig.findOne({ guildId });
            if (!config) return interaction.reply({ content: '❌ لم يتم تحديد قناة للعبة في هذا السيرفر! اطلب من الأدمن استخدام /admin_tools', flags: [MessageFlags.Ephemeral] });

            const channel = await client.channels.fetch(config.channelId).catch(() => null);
            if (!channel) return interaction.reply({ content: '❌ فشل الوصول للقناة!', flags: [MessageFlags.Ephemeral] });

            await channel.send({ embeds: [new EmbedBuilder().setAuthor({ name: p.name }).setDescription(options.getString('message')).setColor('#2b2d31')] });
            return interaction.reply({ content: '✅ تم الإرسال مجهولاً!', flags: [MessageFlags.Ephemeral] });
        }

        // --- أمر عرض الشخصيات ---
        if (commandName === 'who') {
            if (!guildId) return interaction.reply('❌ استخدم هذا الأمر داخل السيرفر!');
            const allPlayers = await Player.find(); // هنا يجلب الكل، يمكنك تصفيتهم حسب السيرفر مستقبلاً
            let list = allPlayers.map(v => `🎭 **${v.name}:** ${v.desc}`).join('\n\n');
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('الشخصيات المتواجدة حالياً').setDescription(list || 'لا يوجد لاعبين مسجلين')], flags: [MessageFlags.Ephemeral] });
        }

        // --- أدوات الإدارة ---
        if (commandName === 'admin_tools') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const act = options.getString('action');

            // ضبط القناة
            if (act === 'set_channel') {
                await GuildConfig.findOneAndUpdate({ guildId }, { channelId: interaction.channelId }, { upsert: true });
                return interaction.editReply(`✅ تم اعتماد قناة <#${interaction.channelId}> كقناة رسمية للعبة في هذا السيرفر!`);
            }

            const config = await GuildConfig.findOne({ guildId });
            if (!config && act !== 'set_channel') return interaction.editReply('❌ حدد القناة أولاً باستخدام خيار set_channel');

            if (act === 'announcement') {
                const text = options.getString('text');
                if (!text) return interaction.editReply('❌ اكتب النص في خانة text');
                const channel = await client.channels.fetch(config.channelId);
                await channel.send({ content: '@everyone', embeds: [new EmbedBuilder().setTitle('📢 إعلان').setDescription(text).setColor('#ffcc00')] });
                return interaction.editReply('✅ تم الإرسال!');
            }
            
            if (act === 'list_players') {
                const players = await Player.find();
                let list = players.map(v => `👤 **${v.name}** -> <@${v.userId}>`).join('\n');
                return interaction.editReply(list || "لا يوجد لاعبين");
            }

            if (act === 'start_vote') {
                const players = await Player.find();
                if (players.length === 0) return interaction.editReply('❌ لا يوجد لاعبين');
                const menu = new StringSelectMenuBuilder().setCustomId('vote').setPlaceholder('صوت ضد المشتبه به')
                    .addOptions(players.map(p => ({ label: p.name, value: p.name })));
                const channel = await client.channels.fetch(config.channelId);
                await channel.send({ content: '🚨 **بدأ التصويت المجهول!**', components: [new ActionRowBuilder().addComponents(menu)] });
                return interaction.editReply('✅ بدأ التصويت');
            }
        }
    }

    // --- التصويت المجهول ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'vote') {
        await interaction.reply({ content: `✅ سجلت صوتك ضد: ${interaction.values[0]}`, flags: [MessageFlags.Ephemeral] });
    }
});

client.login(token);