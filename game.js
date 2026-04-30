const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, MessageFlags } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages], partials: [1] });
const token = process.env.token;
let players = new Map();

client.on('ready', async () => {
    console.log(`🎭 SoraGame جاهز للعب`);
    const commands = [
        new SlashCommandBuilder().setName('login').setDescription('تسجيل').addStringOption(o => o.setName('name').setRequired(true).setDescription('الاسم')).addStringOption(o => o.setName('desc').setRequired(true).setDescription('الوصف')),
        new SlashCommandBuilder().setName('say').setDescription('رسالة مجهولة').addStringOption(o => o.setName('msg').setRequired(true).setDescription('الرسالة')),
        new SlashCommandBuilder().setName('who').setDescription('قائمة الشخصيات')
    ].map(c => c.toJSON());
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user } = interaction;

    if (commandName === 'login') {
        players.set(user.id, { name: options.getString('name'), desc: options.getString('desc') });
        return interaction.reply({ content: '✅ سجلت!', flags: [MessageFlags.Ephemeral] });
    }
    // ... باقي أوامر say و who حطها هنا بنفس الطريقة
});

client.login(token);