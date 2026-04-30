const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const token = process.env.token;

client.on('ready', async () => {
    console.log(`⚖️ SoraAdmin جاهز للإدارة`);
    const commands = [new SlashCommandBuilder().setName('dashboard').setDescription('لوحة التحكم').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)].map(c => c.toJSON());
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on('interactionCreate', async interaction => {
    if (interaction.commandName === 'dashboard') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('st_btn').setLabel('حالة السيرفر').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('ann_btn').setLabel('إرسال إعلان').setStyle(ButtonStyle.Primary)
        );
        await interaction.reply({ content: '🎮 **لوحة تحكم Sora**', components: [row], ephemeral: true });
    }
});

client.login(token);