const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ComponentType } = require('discord.js');
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

// Function to get server configuration from the database
async function getServerConfig(guildId) {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT * FROM server_logs WHERE guildId = ?', [guildId]);
    await connection.end();
    return rows[0] || {}; // Return the first row or an empty object if not found
}

// Function to update a specific field in the server configuration in the database
async function updateServerConfig(guildId, field, value) {
    const connection = await mysql.createConnection(dbConfig);

    // Update the specified field in the server configuration
    await connection.execute(`
        UPDATE server_logs 
        SET ${field} = ? 
        WHERE guildId = ?
    `, [value, guildId]);

    await connection.end();
}

module.exports = {
    name: 'setup',
    description: 'Set up various bot settings',
    folder: 'Default',
    async execute(message) {
        try {
            // Delete the user's command message
            await message.delete();

            const guildId = message.guild.id;
            const serverConfig = await getServerConfig(guildId); // Fetch current settings from the database

            // Step 1: Initial dropdown for selecting the setting to change
            const initialRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('settings_select')
                        .setPlaceholder('Select what you want to change')
                        .addOptions([
                            { label: 'Prefix', value: 'prefix' },
                            { label: 'Choose Moderation Role', value: 'moderation_role' },
                            { label: 'Bot Logs', value: 'bot_logs' },
                            { label: 'Reset Settings', value: 'reset' },
                        ]),
                );

            const initialEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Setup Options')
                .setDescription('Please select what you want to change:');

            const sentMessage = await message.channel.send({ embeds: [initialEmbed], components: [initialRow] });

            // Step 2: Create a collector to listen for the user's choice
            const filter = (interaction) => interaction.user.id === message.author.id;
            const initialCollector = sentMessage.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 15000 });

            initialCollector.on('collect', async (interaction) => {
                try {
                    
                    if (interaction.customId === 'settings_select') {
                        const selectedOption = interaction.values[0];

                        if (selectedOption === 'prefix') {
                            const prefixRow = new ActionRowBuilder()
                                .addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId('prefix_select')
                                        .setPlaceholder('Select a prefix')
                                        .addOptions([
                                            { label: '!', value: '!' },
                                            { label: '?', value: '?' },
                                            { label: '$', value: '$' },
                                            { label: '.', value: '.' },
                                            { label: '^', value: '^' },
                                            { label: '-', value: '-' },
                                        ]),
                                );

                            const prefixEmbed = new EmbedBuilder()
                                .setColor('#0099ff')
                                .setTitle('Setup Prefix')
                                .setDescription('Please select a prefix for the bot:');

                            await interaction.update({ embeds: [prefixEmbed], components: [prefixRow] });


                            const prefixCollector = sentMessage.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 15000 });

                            prefixCollector.on('collect', async (prefixInteraction) => {
                                try {
                                    if (prefixInteraction.customId === 'prefix_select') {
                                        const selectedPrefix = prefixInteraction.values[0];

                                        // Update the server configuration in the database
                                        await updateServerConfig(guildId, 'prefix', selectedPrefix);

                                        await prefixInteraction.update({ content: `Prefix set to: \`${selectedPrefix}\``, embeds: [], components: [] });
                                        console.log("Prefix updated to:", selectedPrefix," | Guild: ", message.guild.id);
                                        
                                        // Editing the original message for confirmation
                                        sentMessage.edit({ content: `The prefix has been updated to: \`${selectedPrefix}\``, embeds: [], components: [] });
                                        prefixCollector.stop();
                                    }
                                } catch (error) {
                                    console.error('Error in prefix collector:', error);
                                    await prefixInteraction.followUp({ content: 'There was an error setting the prefix.', ephemeral: true });
                                }
                            });

                        } else if (selectedOption === 'moderation_role') {
                            // Handle "Choose Moderation Role" option
                            const roleOptions = message.guild.roles.cache.map(role => ({
                                label: role.name,
                                value: role.id,
                            }));

                            if (roleOptions.length === 0) {
                                await interaction.update({ content: 'No roles found in this server.', embeds: [], components: [] });
                                return;
                            }

                            roleOptions.push({ label: '- Create one for me -', value: 'create_role' }); // Adding the create role option

                            const roleRow = new ActionRowBuilder()
                                .addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId('role_select')
                                        .setPlaceholder('Select a role for moderation')
                                        .addOptions(roleOptions),
                                );

                            const roleEmbed = new EmbedBuilder()
                                .setColor('#0099ff')
                                .setTitle('Select Moderation Role')
                                .setDescription('Please select a role for moderation permissions:');

                            await interaction.update({ embeds: [roleEmbed], components: [roleRow] });

                            const roleCollector = sentMessage.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 15000 });

                            roleCollector.on('collect', async (roleInteraction) => {
                                try {
                                    if (roleInteraction.customId === 'role_select') {
                                        const selectedRole = roleInteraction.values[0];

                                        if (selectedRole === 'create_role') {
                                            // Check if the "Moderation" role already exists
                                            const existingRole = message.guild.roles.cache.find(role => role.name === 'Moderation' && role.color === 0xff88ad);
                                            
                                            if (existingRole) {
                                                await roleInteraction.update({ content: 'There already is a Moderation role that I have created, delete that role then try again later.', embeds: [], components: [] });
                                                return;
                                            }

                                            // Create a new role called "Moderation"
                                            const roleName = 'Moderation';
                                            const roleColor = '#ff88ad';
                                            
                                            const newRole = await message.guild.roles.create({
                                                name: roleName,
                                                color: roleColor,
                                                reason: 'Created for moderation purposes'
                                            });

                                            // Update the server configuration in the database
                                            await updateServerConfig(guildId, 'modRoleId', newRole.id);

                                            await roleInteraction.update({ content: `Moderation role created: \`${newRole.name}\``, embeds: [], components: [] });
                                            console.log("Moderation role created:", newRole.name," | Guild: ", message.guild.id);
                                            
                                            // Editing the original message for confirmation
                                            sentMessage.edit({ content: `The moderation role has been created: \`${newRole.name}\``, embeds: [], components: [] });
                                            roleCollector.stop();
                                            return;
                                        }

                                        const roleName = message.guild.roles.cache.get(selectedRole)?.name || 'Unknown Role';
                                        await updateServerConfig(guildId, 'modRoleId', selectedRole);

                                        await roleInteraction.update({ content: `Moderation role set to: \`${roleName}\``, embeds: [], components: [] });
                                        
                                        // Editing the original message for confirmation
                                        sentMessage.edit({ content: `The moderation role has been updated to: \`${roleName}\``, embeds: [], components: [] });
                                        roleCollector.stop();
                                    }
                                } catch (error) {
                                    console.error('Error in role collector:', error);
                                    await roleInteraction.followUp({ content: 'There was an error setting the moderation role.', ephemeral: true });
                                }
                            });

                        } else if (selectedOption === 'bot_logs') {
                            // Handle "Bot Logs" option

                            const channelsOptions = message.guild.channels.cache
                                .filter(channel => channel.type === 0) // This line needs adjustment
                                .map(channel => ({
                                label: channel.name,
                                value: channel.id,
                            }));



                            if (channelsOptions.length === 0) {
                                await interaction.update({ content: 'No text channels found in this server.', embeds: [], components: [] });
                                return;
                            }

                            const botLogsRow = new ActionRowBuilder()
                                .addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId('bot_logs_select')
                                        .setPlaceholder('Select a channel for bot logs')
                                        .addOptions(channelsOptions),
                                );

                            const botLogsEmbed = new EmbedBuilder()
                                .setColor('#0099ff')
                                .setTitle('Select Bot Logs Channel')
                                .setDescription('Please select a text channel for bot logs:');

                            await interaction.update({ embeds: [botLogsEmbed], components: [botLogsRow] });

                            const botLogsCollector = sentMessage.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 15000 });

                            botLogsCollector.on('collect', async (logsInteraction) => {
                                try {
                                    if (logsInteraction.customId === 'bot_logs_select') {
                                        const selectedChannelId = logsInteraction.values[0];

                                        await updateServerConfig(guildId, 'botLogs', selectedChannelId);

                                        const channelName = message.guild.channels.cache.get(selectedChannelId)?.name || 'Unknown Channel';
                                        await logsInteraction.update({ content: `Bot logs channel set to: <#${selectedChannelId}>`, embeds: [], components: [] });
                                        console.log("Bot logs channel updated:", channelName," | Guild: ", message.guild.id);
                                        
                                        // Editing the original message for confirmation
                                        sentMessage.edit({ content: `The bot logs channel has been updated to: <#${selectedChannelId}>`, embeds: [], components: [] });
                                        botLogsCollector.stop();
                                    }
                                } catch (error) {
                                    console.error('Error in bot logs collector:', error);
                                    await logsInteraction.followUp({ content: 'There was an error setting the bot logs channel.', ephemeral: true });
                                }
                            });

                        } else if (selectedOption === 'reset') {
                            // Reset the server configuration
                            await updateServerConfig(guildId, 'prefix', '!'); // Resetting to default prefix
                            await updateServerConfig(guildId, 'modRoleId', null); // Resetting moderation role
                            await updateServerConfig(guildId, 'botLogs', null); // Resetting bot logs channel

                            await interaction.update({ content: 'Server settings have been reset to default.', embeds: [], components: [] });
                            console.log("Server settings reset to default."," | Guild: ", message.guild.id);
                            sentMessage.edit({ content: 'All settings have been reset to their default values.', embeds: [], components: [] });
                        }
                    }
                } catch (error) {
                    console.error('Error in interaction handler:', error);
                    await interaction.followUp({ content: 'There was an error processing your selection.', ephemeral: true });
                }
            });

            initialCollector.on('end', async collected => {
                if (collected.size === 0) {
                    await sentMessage.edit({ content: 'No selection made, setup has expired.', embeds: [], components: [] });
                }
            });

        } catch (error) {
            console.error('Error in setup command execution:', error);
            await message.channel.send({ content: 'There was an error executing the setup command.', ephemeral: true });
        }
    }
};
