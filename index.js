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
    res.write("Spy Bot (Custom Announcements) is Awake!");
    res.end();
}).listen(port, '0.0.0.0');

// --- 2. جلب البيانات والربط بالقاعدة ---
let token, channelId, mongoUri;
try {
    const config = require('./config.json');
    token = config.token;
    channelId = config.channelId;
    mongoUri = config.MONGO_URI;
} catch (e) {
    token = process.env.token;
    channelId = process.env.channelId;
    mongoUri = process.env.MONGO_URI;
}

mongoose.connect(mongoUri)
    .then(() => console.log("📦 Connected to MongoDB!"))
    .catch(err => console.error("❌ DB Error:", err));

const Player = mongoose.model('Player', new mongoose.Schema({
    userId: String,
    name: String,
    desc: String
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

    new SlashCommandBuilder().setName('who').setDescription('عرض أوصاف الشخصيات الحالية'),

    new SlashCommandBuilder().setName('admin_tools').setDescription('أدوات الإدارة')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('action').setDescription('اختر الإجراء').setRequired(true)
            .addChoices(
                { name: 'إرسال إعلان مخصص', value: 'announcement' },
                { name: 'رؤية الأسماء الحقيقية', value: 'list_players' },
                { name: 'حذف شخصية', value: 'delete_player' },
                { name: 'بدء التصويت', value: 'start_vote' }
            ))
        // الخيار الجديد لكتابة نص الإعلان
        .addStringOption(opt => opt.setName('text').setDescription('اكتب نص الإعلان هنا (يستخدم فقط مع خيار الإعلان)')),
].map(c => c.toJSON());

// --- 4. التشغيل ---
client.once('ready', async () => {
    if (!token) return console.error("❌ التوكن مفقود!");
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ البوت شغال: ${client.user.tag}`);
    } catch (e) { console.error(e); }
});

// --- 5. التفاعلات (Interactions) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu()) return;

    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        if (commandName === 'login') {
            if (interaction.guildId) return interaction.reply({ content: '❌ سجل في الخاص!', flags: [MessageFlags.Ephemeral] });
            await Player.findOneAndUpdate(
                { userId: interaction.user.id },
                { name: options.getString('name'), desc: options.getString('desc') },
                { upsert: true }
            );
            return interaction.reply('✅ تم تسجيل شخصيتك!');
        }

        if (commandName === 'say') {
            const p = await Player.findOne({ userId: interaction.user.id });
            if (!p) return interaction.reply({ content: '❌ سجل أولاً بـ /login', flags: [MessageFlags.Ephemeral] });
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) return interaction.reply({ content: '❌ القناة غير موجودة!', flags: [MessageFlags.Ephemeral] });
            await channel.send({ embeds: [new EmbedBuilder().setAuthor({ name: p.name }).setDescription(options.getString('message')).setColor('#2b2d31')] });
            return interaction.reply({ content: '✅ تم الإرسال!', flags: [MessageFlags.Ephemeral] });
        }

        if (commandName === 'who') {
            const allPlayers = await Player.find();
            let list = allPlayers.map(v => `🎭 **${v.name}:** ${v.desc}`).join('\n\n');
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('الشخصيات الحالية').setDescription(list || 'لا يوجد لاعبين')], flags: [MessageFlags.Ephemeral] });
        }

        if (commandName === 'admin_tools') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); 
            const act = options.getString('action');
            const customText = options.getString('text');
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) return interaction.editReply('❌ القناة غير موجودة!');

            // تعديل نظام الإعلان ليكون مخصصاً
            if (act === 'announcement') {
                if (!customText) return interaction.editReply('❌ يرجى كتابة نص في خانة text لإرسال الإعلان!');
                
                const announceEmbed = new EmbedBuilder()
                    .setTitle('📢 إعلان من الإدارة')
                    .setColor('#ffcc00')
                    .setDescription(customText)
                    .setTimestamp();

                await channel.send({ content: '@everyone', embeds: [announceEmbed] });
                return interaction.editReply('✅ تم إرسال إعلانك المخصص!');
            }
            
            if (act === 'list_players') {
                const allPlayers = await Player.find();
                let list = allPlayers.map(v => `👤 **${v.name}** -> <@${v.userId}>`).join('\n');
                return interaction.editReply(list || "القائمة فارغة");
            }
            
            if (act === 'delete_player') {
                const allPlayers = await Player.find();
                if (allPlayers.length === 0) return interaction.editReply('❌ لا يوجد لاعبين');
                const menu = new StringSelectMenuBuilder().setCustomId('del_menu').setPlaceholder('اختر للحذف')
                    .addOptions(allPlayers.map(p => ({ label: p.name, value: p.name })));
                return interaction.editReply({ content: '🗑️ اختر شخصية لحذفها:', components: [new ActionRowBuilder().addComponents(menu)] });
            }
            
            if (act === 'start_vote') {
                const allPlayers = await Player.find();
                if (allPlayers.length === 0) return interaction.editReply('❌ لا يوجد لاعبين');
                const menu = new StringSelectMenuBuilder().setCustomId('vote').setPlaceholder('صوت هنا')
                    .addOptions(allPlayers.map(p => ({ label: p.name, value: p.name })));
                await channel.send({ content: '🚨 **بدأ التصويت!**', components: [new ActionRowBuilder().addComponents(menu)] });
                return interaction.editReply('✅ بدأ التصويت');
            }
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'del_menu') {
            const name = interaction.values[0];
            await Player.deleteOne({ name: name });
            await interaction.update({ content: `✅ تم حذف **${name}**`, components: [] });
        }
        if (interaction.customId === 'vote') {
            await interaction.reply({ content: `✅ سجلت صوتك ضد: ${interaction.values[0]}`, flags: [MessageFlags.Ephemeral] });
        }
    }
});

client.login(token);