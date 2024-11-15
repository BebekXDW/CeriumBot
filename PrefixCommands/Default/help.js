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

// Function to get the prefix from the database
async function getPrefix(guildId) {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT prefix FROM server_logs WHERE guildId = ?', [guildId]);
    await connection.end();
    return rows[0] ? rows[0].prefix : '!'; // Return default prefix if not found
}

module.exports = {
    name: 'help',
    description: 'Lists all available commands and their descriptions.',
    folder: 'Default', // Specify the folder here
    async execute(message) {
        const { client } = message;

        // Get the prefix from the database
        const prefix = await getPrefix(message.guild.id);

        // Create a map to hold commands by category
        const commandCategories = {};

        // Organize commands by their folder (category)
        client.prefixCommands.forEach(command => {
            // Skip commands marked as "ShownInHelp: 'No'"
            if (command.ShownInHelp && command.ShownInHelp === 'No') return;

            const folderName = command.folder || 'General'; // Default to 'General' if no folder is specified
            if (!commandCategories[folderName]) {
                commandCategories[folderName] = [];
            }
            commandCategories[folderName].push(`\`${prefix}${command.name}\` - ${command.description || 'No description available.'}`);
        });

        // Create the help message embed
        const helpEmbed = new EmbedBuilder()
            .setColor('#000000') // Black color
            .setDescription(`**Prefix:** ${prefix}\n**Website:** https://bot.cerium.ovh`);

        // Add command categories to the embed
        for (const [category, commands] of Object.entries(commandCategories)) {
            helpEmbed.addFields({ name: category, value: commands.join('\n') || 'No commands available.' });
        }

        // Send the help message
        await message.reply({ embeds: [helpEmbed] });
    },
};
