const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    StringSelectMenuBuilder, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, Partials 
} = require('discord.js');
const http = require('http'); // مكتبة لإبقاء البوت حياً

// --- 1. إعدادات السيرفر الوهمي (Keep Alive) ---
// هذا الجزء يخلي الاستضافة تظن أن البوت "موقع ويب" ولا تطفيه
http.createServer((req, res) => {
    res.write("Spy Bot is Running 24/7!");
    res.end();
}).listen(8080);

// --- 2. جلب البيانات من ملف الإعدادات ---
const { token, channelId } = require('./config.json');

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

// --- 3. رسالة اللعبة الرسمية والقوانين ---
const getOfficialEmbed = () => {
    return new EmbedBuilder()
        .setTitle('🎭 تجربة اجتماعية غامضة: من المتخفي؟')
        .setColor('#2b2d31')
        .setDescription(`
أهلاً بك في تجربة اجتماعية غامضة.. هل تستطيع الصمود 24 ساعة دون أن ينكشف أمرك؟

**✨ فكرة اللعبة:**
في هذه اللعبة، الجميع مجهول! ستدخل بشخصية وهمية تختار (اسمها) و (وصفها) بنفسك. ستتحدث مع الآخرين عبر البوت بـ **Embeds** رسمية تخفي هويتك الحقيقية تماماً. هدفك هو التفاعل، طرح الأسئلة، وتحليل أوصاف الآخرين لكشف من هم خلف الأقنعة.

**📜 قوانين اللعبة:**
1️⃣ **التخفي التام:** لا أحد يعرف من أنت، ولا يمكنك كشف هويتك الحقيقية.
2️⃣ **التقمص (Roleplay):** تحدث بأسلوب الشخصية التي اخترتها وبناءً على الوصف الذي كتبته.
3️⃣ **التحقيق:** اقرأ أوصاف المشتركين بعناية وحاول حشرهم بالأسئلة لكشف التناقضات.

**🗳️ مرحلة التصويت (بعد 24 ساعة):**
🥴 **الأكثر غثاثة:** من هو الشخص الذي لم تطق الحديث معه؟
📢 **الأكثر إزعاجاً:** من الذي ملأ الشات بضجيجه؟
🚪 **قرار الطرد:** من الشخص الذي أجمع الجميع على خروجه من اللعبة؟

**🛠️ أوامر البدء:**
\`/login\` : لإنشاء شخصيتك (الاسم والوصف) في سرية تامة.
\`/say\` : لإرسال رسائلك المجهولة في قناة اللعبة.
\`/who\` : لعرض قائمة أوصاف الشخصيات الموجودة حالياً.

*خلك ذكي، خلك غامض.. ولا تخليهم يمسكون عليك زلة!* 🕵️‍♂️🔥
        `)
        .setFooter({ text: 'تذكير تلقائي بنظام اللعبة' });
};

// --- 4. تعريف أوامر السلاش ---
const commands = [
    new SlashCommandBuilder().setName('login').setDescription('التسجيل (استخدمه في الخاص)')
        .addStringOption(opt => opt.setName('name').setDescription('اسم الشخصية الوهمية').setRequired(true))
        .addStringOption(opt => opt.setName('desc').setDescription('وصف الشخصية').setRequired(true)),
    
    new SlashCommandBuilder().setName('say').setDescription('ارسل رسالة مجهولة باسم شخصيتك')
        .addStringOption(opt => opt.setName('message').setDescription('محتوى الرسالة').setRequired(true)),

    new SlashCommandBuilder().setName('who').setDescription('عرض أوصاف الشخصيات الحالية والبحث عن المتناقضات'),

    new SlashCommandBuilder().setName('admin_tools').setDescription('أدوات الإدارة للأدمن فقط')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('action').setDescription('اختر الإجراء المطلوب').setRequired(true)
            .addChoices(
                { name: 'إرسال إعلان اللعبة للكل', value: 'announcement' },
                { name: 'رؤية الأسماء الحقيقية (كشف)', value: 'list_players' },
                { name: 'حذف شخصية محددة', value: 'delete_player' },
                { name: 'بدء التصويت على الطرد', value: 'start_vote' }
            ))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

// --- 5. تشغيل البوت وتثبيت الأوامر ---
client.once('ready', async () => {
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ تم التشغيل بنجاح باسم: ${client.user.tag}`);

        // إرسال تلقائي للقوانين كل 15 دقيقة
        setInterval(async () => {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (channel) channel.send({ embeds: [getOfficialEmbed()] }).catch(() => null);
        }, 15 * 60 * 1000);

    } catch (e) { console.error(e); }
});

// --- 6. معالجة التفاعلات والأوامر ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu()) return;

    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        if (commandName === 'login') {
            if (interaction.guildId) return interaction.reply({ content: '❌ للأمان، سجل في الخاص حق البوت!', ephemeral: true });
            players.set(interaction.user.id, { name: options.getString('name'), desc: options.getString('desc') });
            await interaction.reply('✅ تم تسجيل شخصيتك بنجاح! اذهب للسيرفر وابدأ اللعب.');
        }

        if (commandName === 'say') {
            const p = players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: '❌ سجل أولاً بـ /login في الخاص', ephemeral: true });
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) return interaction.reply({ content: '❌ قناة اللعبة غير موجودة!', ephemeral: true });
            
            await channel.send({ embeds: [new EmbedBuilder().setAuthor({ name: p.name }).setDescription(options.getString('message')).setColor('#2b2d31')] });
            await interaction.reply({ content: '✅ تم الإرسال بنجاح!', ephemeral: true });
        }

        if (commandName === 'who') {
            let list = Array.from(players.values()).map(v => `🎭 **${v.name}:** ${v.desc}`).join('\n\n');
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('قائمة أوصاف الشخصيات').setDescription(list || 'لا يوجد لاعبين حالياً')], ephemeral: true });
        }

        if (commandName === 'admin_tools') {
            const act = options.getString('action');
            
            if (act === 'announcement') {
                const channel = await client.channels.fetch(channelId);
                await channel.send({ content: '@everyone', embeds: [getOfficialEmbed()] });
                await interaction.reply({ content: 'تم إرسال الإعلان للكل', ephemeral: true });
            }
            
            if (act === 'list_players') {
                let list = Array.from(players.entries()).map(([id, v]) => `👤 **${v.name}** -> <@${id}>`).join('\n');
                await interaction.reply({ content: list || "لا يوجد أحد مسجل", ephemeral: true });
            }
            
            if (act === 'delete_player') {
                if (players.size === 0) return interaction.reply({ content: 'لا يوجد لاعبين', ephemeral: true });
                const menu = new StringSelectMenuBuilder().setCustomId('del_menu').setPlaceholder('اختر الشخصية لحذفها')
                    .addOptions(Array.from(players.values()).map(p => ({ label: p.name, value: p.name })));
                await interaction.reply({ content: '🗑️ اختر الشخصية لحذف داتا التسجيل الخاصة بها:', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
            }

            if (act === 'start_vote') {
                if (players.size === 0) return interaction.reply({ content: 'لا يوجد لاعبين للتصويت عليهم', ephemeral: true });
                const menu = new StringSelectMenuBuilder().setCustomId('vote_kick').setPlaceholder('صوت ضد شخص للطرد')
                    .addOptions(Array.from(players.values()).map(p => ({ label: p.name, value: p.name })));
                await interaction.channel.send({ content: '🚨 **وقت الحساب!** صوتوا الآن ضد الشخص الذي تُريدون طرده:', components: [new ActionRowBuilder().addComponents(menu)] });
                await interaction.reply({ content: 'تم تفعيل منيو التصويت بنجاح', ephemeral: true });
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
            await interaction.update({ content: `✅ تم حذف شخصية **${name}**، يمكنه الآن التسجيل من جديد.`, components: [] });
        }
        
        if (interaction.customId === 'vote_kick') {
            await interaction.reply({ content: `✅ تم تسجيل صوتك ضد: **${interaction.values[0]}**`, ephemeral: true });
        }
    }
});

client.login(token);