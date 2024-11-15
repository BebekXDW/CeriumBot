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

async function getBotLogsChannelId(guildId) {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT botLogs FROM server_logs WHERE guildId = ?', [guildId]);
        await connection.end();
        return rows[0] ? rows[0].botLogs : null;
    } catch (error) {
        console.error('Error connecting to MySQL:', error);
        return null;
    }
}

module.exports = {
    name: 'ban',
    description: 'Bans a user from the server using their ID or tag.',
    folder: 'Moderation',
    async execute(message, args) {
        await message.delete().catch(console.error);

        if (args.length < 1) {
            return message.channel.send('Please provide a user mention, tag, or ID to ban.');
        }

        const userIdOrTag = args[0];
        let userToBan;

        if (message.mentions.users.size > 0) {
            userToBan = message.mentions.users.first();
        } else {
            userToBan = await message.client.users.fetch(userIdOrTag).catch(() => null);
        }

        if (!userToBan) {
            return message.channel.send('User not found. Please mention a valid user, provide their tag, or use their ID.');
        }

        const reason = args.slice(1).join(' ') || 'Unspecified';

        try {
            const member = await message.guild.members.fetch(userToBan.id).catch(() => null);

            if (member) {
                // Attempt to ban the user
                await member.ban({ reason });

                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('User Banned')
                    .setDescription(`Banned user: <@${userToBan.id}> (${userToBan.tag})`)
                    .addFields({ name: 'Reason', value: reason })
                    .addFields({ name: 'User ID', value: userToBan.id })
                    .setTimestamp()
                    .setFooter({ text: `Banned by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

                const botLogsChannelId = await getBotLogsChannelId(message.guild.id);
                const logChannel = botLogsChannelId
                    ? message.guild.channels.cache.get(botLogsChannelId)
                    : message.channel;

                if (logChannel) {
                    logChannel.send({ embeds: [embed] });
                } else {
                    message.channel.send({ embeds: [embed] });
                }
            } else {
                message.channel.send('I cannot ban this user due to role hierarchy or insufficient permissions.');
            }
        } catch (error) {
            if (error.code === 50013) {
                message.channel.send('Missing permissions to ban this user. Please check my role and permissions.');
            } else {
                console.error(error);
                message.channel.send('An error occurred while trying to ban the user.');
            }
        }
    },
};
