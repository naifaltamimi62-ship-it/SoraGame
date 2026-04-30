const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Message, Partials.Channel]
});

const token = process.env.token;
const adminLogsId = process.env.ADMIN_LOGS_CHANNEL; 

client.on('ready', () => console.log(`🛡️ SoraSecurity جاهز للرقابة`));

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const logChannel = await client.channels.fetch(adminLogsId).catch(() => null);
    if (logChannel) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: '🚨 تقرير أمني', iconURL: interaction.user.displayAvatarURL() })
            .setColor('#ff0000')
            .setDescription(`**المستخدم:** <@${interaction.user.id}>\n**استخدم أمر:** \`/${interaction.commandName}\``)
            .setTimestamp();
        logChannel.send({ embeds: [embed] });
    }
});

client.login(token);