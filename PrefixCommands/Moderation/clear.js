const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const mysql = require('mysql2/promise');

// Load database configuration from config.json
const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const dbConfig = {
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
};

// Function to get the bot logs channel ID from the database
async function getBotLogsChannelId(guildId) {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT botLogs FROM server_logs WHERE guildId = ?', [guildId]);
    await connection.end();
    return rows[0] ? rows[0].botLogs : null; // Return null if not found
}

module.exports = {
    name: 'clear',
    description: 'Clears the specified number of messages from the channel.',
    folder: 'Moderation',
    async execute(message, args) {
        const deleteCount = parseInt(args[0]) + 1;

        if (isNaN(deleteCount) || deleteCount < 1 || deleteCount > 100) {
            return message.reply('Please provide a number between 1 and 99 for the number of messages to delete.');
        }

        try {
            // Fetch messages and attempt to bulk delete
            const fetched = await message.channel.messages.fetch({ limit: deleteCount });
            const deletedMessages = await message.channel.bulkDelete(fetched, true).catch(async (error) => {
                for (const msg of fetched.values()) {
                    try {
                        await msg.delete();
                    } catch (err) {
                        if (err.code !== 10008) console.error('Failed to delete message:', err);
                    }
                }
            });

            // Get the bot logs channel ID from the database
            const logChannelId = await getBotLogsChannelId(message.guild.id);
            let logChannel = message.guild.channels.cache.get(logChannelId);

            // Fallback to the command channel if no log channel is set
            if (!logChannel || !logChannel.isTextBased()) {
                console.warn('Log channel not found or invalid, using the command channel as fallback.');
                logChannel = message.channel;
                await message.reply('Log channel not set or invalid. Logging this action in the current channel.');
            }

            // Prepare log messages in batches of 20 to avoid the 1024 character limit
            const logMessages = fetched.map(msg => ({
                timestamp: msg.createdAt.toLocaleString(),
                content: msg.content || 'N/A',
                author: msg.author.tag,
            }));
            const batchSize = 20;
            const batches = Math.ceil(logMessages.length / batchSize);

            for (let i = 0; i < batches; i++) {
                const logBatch = logMessages.slice(i * batchSize, (i + 1) * batchSize);
                const logEmbed = new EmbedBuilder()
                    .setTitle('Messages Deleted (clear)')
                    .setDescription(`**Moderator:** ${message.author.tag}\n\n**Messages Deleted:** ${deletedMessages.size}`)
                    .addFields({
                        name: 'Deleted Messages:',
                        value: logBatch.length > 0 ? logBatch.map(log => `**${log.timestamp}** - **${log.author}**: ${log.content}`).join('\n') : 'No messages to show',
                    })
                    .setTimestamp();

                // Send the log message to the log channel (or command channel if fallback)
                await logChannel.send({ embeds: [logEmbed] });
            }

        } catch (error) {
            console.error('Error clearing messages:', error);
            message.channel.send('There was an error trying to delete messages in this channel!');
        }
    },
};
