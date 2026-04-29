const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    StringSelectMenuBuilder, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, Partials 
} = require('discord.js');
const http = require('http');

// --- 1. نظام إبقاء البوت حياً (Keep Alive) ---
const port = process.env.PORT || 10000; 
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Spy Bot is Awake!");
    res.end();
}).listen(port, '0.0.0.0');

// --- 2. جلب البيانات (Token & Channel ID) ---
let token, channelId;
try {
    const config = require('./config.json');
    token = config.token;
    channelId = config.channelId;
} catch (e) {
    token = process.env.token;
    channelId = process.env.channelId;
}

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.DirectMessages 
    ],
    partials: [Partials.Channel, Partials.Message]
});

let players = new Map();

// --- 3. قالب رسالة اللعبة ---
const getOfficialEmbed = () => {
    return new EmbedBuilder()
        .setTitle('🎭 تجربة اجتماعية غامضة: من المتخفي؟')
        .setColor('#2b2d31')
        .setDescription(`في هذه اللعبة، الجميع مجهول! هدفك هو التفاعل وكشف الآخرين دون أن ينكشف أمرك.\n\n**أوامر اللعبة:**\n\`/login\` : للتسجيل (في الخاص).\n\`/say\` : لإرسال رسالة مجهولة.\n\`/who\` : لعرض قائمة الشخصيات.`);
};

// --- 4. تعريف الأوامر ---
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
                { name: 'إرسال إعلان اللعبة', value: 'announcement' },
                { name: 'رؤية الأسماء الحقيقية', value: 'list_players' },
                { name: 'حذف شخصية', value: 'delete_player' },
                { name: 'بدء التصويت', value: 'start_vote' }
            ))
].map(c => c.toJSON());

// --- 5. التشغيل ---
client.once('ready', async () => {
    if (!token) return console.error("❌ التوكن مفقود!");
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ البوت شغال: ${client.user.tag}`);
    } catch (e) { console.error(e); }
});

// --- 6. التفاعلات (Interactions) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu()) return;

    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        if (commandName === 'login') {
            if (interaction.guildId) return interaction.reply({ content: '❌ سجل في الخاص!', ephemeral: true });
            players.set(interaction.user.id, { name: options.getString('name'), desc: options.getString('desc') });
            return interaction.reply('✅ تم تسجيل شخصيتك!');
        }

        if (commandName === 'say') {
            const p = players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: '❌ سجل أولاً بـ /login', ephemeral: true });
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) return interaction.reply({ content: '❌ القناة غير موجودة!', ephemeral: true });

            await channel.send({ embeds: [new EmbedBuilder().setAuthor({ name: p.name }).setDescription(options.getString('message')).setColor('#2b2d31')] });
            return interaction.reply({ content: '✅ تم الإرسال!', ephemeral: true });
        }

        if (commandName === 'who') {
            let list = Array.from(players.values()).map(v => `🎭 **${v.name}:** ${v.desc}`).join('\n\n');
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('الشخصيات الحالية').setDescription(list || 'لا يوجد لاعبين')], ephemeral: true });
        }

        // --- أدوات الإدارة مع حل مشكلة عدم الرد ---
        if (commandName === 'admin_tools') {
            await interaction.deferReply({ ephemeral: true }); // يعطي البوت 15 دقيقة للرد بدل 3 ثواني

            const act = options.getString('action');
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) return interaction.editReply('❌ القناة غير موجودة!');

            if (act === 'announcement') {
                await channel.send({ content: '@everyone', embeds: [getOfficialEmbed()] });
                return interaction.editReply('✅ تم الإعلان!');
            }
            if (act === 'list_players') {
                let list = Array.from(players.entries()).map(([id, v]) => `👤 **${v.name}** -> <@${id}>`).join('\n');
                return interaction.editReply(list || "القائمة فارغة");
            }
            if (act === 'delete_player') {
                if (players.size === 0) return interaction.editReply('❌ لا يوجد لاعبين');
                const menu = new StringSelectMenuBuilder().setCustomId('del_menu').setPlaceholder('اختر للحذف')
                    .addOptions(Array.from(players.values()).map(p => ({ label: p.name, value: p.name })));
                return interaction.editReply({ content: '🗑️ اختر شخصية لحذفها:', components: [new ActionRowBuilder().addComponents(menu)] });
            }
            if (act === 'start_vote') {
                if (players.size === 0) return interaction.editReply('❌ لا يوجد لاعبين');
                const menu = new StringSelectMenuBuilder().setCustomId('vote').setPlaceholder('صوت هنا')
                    .addOptions(Array.from(players.values()).map(p => ({ label: p.name, value: p.name })));
                await channel.send({ content: '🚨 **بدأ التصويت!**', components: [new ActionRowBuilder().addComponents(menu)] });
                return interaction.editReply('✅ بدأ التصويت في القناة العامة');
            }
        }
    }

    // معالجة القوائم المنسدلة
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'del_menu') {
            const name = interaction.values[0];
            for (let [id, data] of players.entries()) {
                if (data.name === name) { players.delete(id); break; }
            }
            await interaction.update({ content: `✅ تم حذف **${name}**`, components: [] });
        }
        if (interaction.customId === 'vote') {
            await interaction.reply({ content: `✅ سجلت صوتك ضد: ${interaction.values[0]}`, ephemeral: true });
        }
    }
});

client.login(token);