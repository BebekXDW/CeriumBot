const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Load configuration from config.json
const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

// Database configuration from config.json
const dbConfig = {
    host: config.host,           // Database host
    user: config.user,           // Database user
    password: config.password,   // Database password
    database: config.database    // Database name
};

// Function to get guildId from the database
async function getGuildId() {
    try {
        // Create a connection to the database
        const connection = await mysql.createConnection(dbConfig);
        
        // Query to retrieve the guildId from the server_logs table
        const [rows] = await connection.execute('SELECT guildId FROM server_logs LIMIT 1');
        
        // Close the database connection
        await connection.end();

        // Check if a row was returned
        if (rows.length === 0) {
            throw new Error('Guild ID not found in the database');
        }

        // Extract guildId from the result
        const { guildId } = rows[0];
        return guildId;

    } catch (error) {
        console.error('Error retrieving guild ID:', error);
        throw error;  // Re-throw error to handle it outside
    }
}

const commands = [];

// Read command files
const commandFiles = fs.readdirSync(path.join(__dirname, 'SlashCommands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./SlashCommands/${file}`);
    commands.push(command.data.toJSON()); // Ensure command.data is properly set up
}

(async () => {
    try {
        // Retrieve the guildId from the database
        const guildId = await getGuildId(); // Get guildId from the DB

        // Set up the REST API client with the token from config.json
        const rest = new REST({ version: '9' }).setToken(config.token);

        console.log('Started refreshing application (/) commands.');

        // Use guildId for the application commands
        await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: commands });

        console.log('Successfully reloaded application (/) commands.');

    } catch (error) {
        console.error('Error deploying commands:', error);
    }
})();
