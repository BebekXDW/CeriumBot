const { PermissionsBitField, EmbedBuilder, ButtonBuilder, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const mysql = require('mysql2/promise');

// Function to get configuration values from the database
async function getConfigValues(guildId) {
    // Load database configuration from config.json
    const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
    const dbConfig = {
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
    };

    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT botLogs FROM server_logs WHERE guildId = ?', [guildId]);
    await connection.end();
    return rows[0] ? rows[0] : null; // Return null if not found
}

module.exports = {
    name: 'del',
    description: 'Delete the last {number} of messages from a specified user.',
    folder: 'Moderation',
    ShownInHelp: 'No',
    async execute(message, args) {
        // Check for permissions
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply("You don't have permission to delete messages.");
        }

        // Check if a user and a number were provided
        const user = message.mentions.users.first();
        const number = parseInt(args[1], 10);

        if (!user || isNaN(number) || number <= 0) {
            return message.reply('Please mention a user and provide a valid number of messages to delete.');
        }

        // Fetch the last 100 messages in the channel
        const messages = await message.channel.messages.fetch({ limit: 100 });

        // Filter messages from the specified user
        const userMessages = messages.filter(msg => msg.author.id === user.id).first(number);

        // Check if any messages were found
        if (userMessages.size === 0) {
            return message.reply('No messages found from the specified user in the last 100 messages.');
        }

        // Store deleted messages content
        const deletedMessagesContent = userMessages.map(msg => `**${msg.createdAt.toLocaleString()}:** ${msg.content}`).join('\n');

        // Attempt to delete the messages
        const deletedMessages = await message.channel.bulkDelete(userMessages, true).catch(err => {
            console.error(err);
            return message.reply('Some messages could not be deleted. They may be older than 14 days.');
        });

        // Get the bot logs channel ID from the database
        const configValues = await getConfigValues(message.guild.id);
        const botLogsChannelId = configValues ? configValues.botLogs : null; // Get the bot logs channel ID

        if (deletedMessages.size > 0) {
            const logChannel = await message.guild.channels.fetch(botLogsChannelId);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setColor('#0080ff') // Set the embed color to #0080ff
                    .setTitle('Messages Deleted')
                    .setDescription(`**Moderator:** ${message.author.tag}\n**User:** ${user.tag}\n**Messages Deleted:** ${deletedMessages.size}\n\n**Deleted Messages:**\n${deletedMessagesContent}`)
                    .setTimestamp();

                // Create buttons
                const prevButton = new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('Previous')
                    .setStyle('Primary');
                
                const nextButton = new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle('Primary');

                const actionRow = new ActionRowBuilder()
                    .addComponents(prevButton, nextButton);

                await logChannel.send({ embeds: [logEmbed], components: [actionRow] });
            }

        } else {
            message.channel.send('No messages were deleted.');
        }
    },
};
