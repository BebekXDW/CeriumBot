const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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

// Function to get the prefix from the database
async function getPrefix(guildId) {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT prefix FROM server_logs WHERE guildId = ?', [guildId]);
    await connection.end();
    return rows[0] ? rows[0].prefix : '!'; // Return default prefix if not found
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Lists all available commands and their descriptions.'),
    async execute(interaction) {
        const { client } = interaction;

        // Get the prefix from the database
        const prefix = await getPrefix(interaction.guild.id);

        // Create a map to hold commands by category
        const commandCategories = {};

        // Organize commands by their folder (category)
        client.prefixCommands.forEach(command => {
            const folderName = command.folder || 'General'; // Default to 'General' if no folder is specified
            if (!commandCategories[folderName]) {
                commandCategories[folderName] = [];
            }
            commandCategories[folderName].push(`\`${prefix}${command.name}\` - ${command.description || 'No description available.'}`);
        });

        // Create the help message embed
        const helpEmbed = new EmbedBuilder()
            .setColor('#000000') // Black color
            .setDescription(`**Prefix:** ${prefix}\n **Website:** https://bot.cerium.ovh`);

        // Add command categories to the embed
        for (const [category, commands] of Object.entries(commandCategories)) {
            helpEmbed.addFields({ name: category, value: commands.join('\n') || 'No commands available.' });
        }

        // Reply with the embed as an ephemeral message
        try {
            await interaction.reply({
                embeds: [helpEmbed],
                ephemeral: true, // Makes the message only visible to the user
            });
        } catch (error) {
            console.error('Error sending ephemeral reply:', error);
            await interaction.reply({ content: 'There was an error with the help command.', ephemeral: true });
        }
    },
};
