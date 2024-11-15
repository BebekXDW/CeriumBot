const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise'); // Import mysql2 with promise support

// Load the initial config
const configPath = './config.json';
let config = require(configPath);

// Create a new Discord client with the necessary intents
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Create collections for each type of command
client.slashCommands = new Collection();
client.prefixCommands = new Collection();

// Load Slash Commands from the SlashCommands folder
const slashCommandFiles = fs.readdirSync(path.join(__dirname, 'SlashCommands')).filter(file => file.endsWith('.js'));
for (const file of slashCommandFiles) {
    const command = require(`./SlashCommands/${file}`);
    client.slashCommands.set(command.data.name, command);
}

// Recursive function to load prefix commands from subdirectories in PrefixCommands
function loadPrefixCommands(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) {
            loadPrefixCommands(filePath);  // Recursively load subdirectories
        } else if (file.isFile() && file.name.endsWith('.js')) {
            const command = require(filePath);
            client.prefixCommands.set(command.name, command);
        }
    }
}

// Load Prefix Commands from all subdirectories in PrefixCommands
loadPrefixCommands(path.join(__dirname, 'PrefixCommands'));

// Watch for changes in config.json
fs.watchFile(configPath, (curr, prev) => {
    console.log('Config file changed. Reloading...');
    delete require.cache[require.resolve(configPath)]; // Clear the require cache
    config = require(configPath); // Reload the config
    console.log(`New prefix: ${config.prefix}`); // Log the new prefix
});

// When the bot is ready
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Set a custom status without an activity type
    client.user.setPresence({
        activities: [{ name: '/help | by @bebek.xdw' }], // Just the text without an activity type
        status: 'online' // You can set this to 'online', 'idle', 'dnd', etc.
    });

    let connection;
    try {
        connection = await mysql.createConnection({
            host: config.host,
            user: config.user,
            password: config.password,
            database: config.database,
        });

        console.log('Connected to MySQL database!');

        const guilds = client.guilds.cache;
        let newGuildCount = 0;

        for (const guild of guilds.values()) {
            const guildId = guild.id;

            // Check if the guild exists in the database
            const [rows] = await connection.query('SELECT * FROM server_logs WHERE guildId = ?', [guildId]);

            if (rows.length === 0) {
                // If it doesn't exist, insert the guild with default values
                const defaultPrefix = '!'; // Set a default prefix from config
                const defaultModRoleId = null; // Default value for modRoleId
                const defaultBotLogs = null; // Default value for botLogs

                await connection.query(
                    'INSERT INTO server_logs (guildId, prefix, modRoleId, botLogs) VALUES (?, ?, ?, ?)', 
                    [guildId, defaultPrefix, defaultModRoleId, defaultBotLogs]
                );
                newGuildCount++; // Increment count for new guilds
            }
        }

        console.log(`Found ${guilds.size} servers in database.`);
        if (newGuildCount > 0) {
            console.log(`Logged ${newGuildCount} new guild(s) to the database.`);
        }
    } catch (error) {
        console.error('Error connecting to MySQL:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});
// Handle new guild join
client.on('guildCreate', async guild => {
    console.log(`Joined new guild: ${guild.id}`);

    let connection;
    try {
        connection = await mysql.createConnection({
            host: config.host,
            user: config.user,
            password: config.password,
            database: config.database,
        });

        // Set default values
        const defaultPrefix = config.prefix;
        const defaultModRoleId = null;
        const defaultBotLogs = null;

        // Insert the new guild into the database
        await connection.query(
            'INSERT INTO server_logs (guildId, prefix, modRoleId, botLogs) VALUES (?, ?, ?, ?)',
            [guild.id, defaultPrefix, defaultModRoleId, defaultBotLogs]
        );

        console.log(`Logged new guild in database with ID: ${guild.id}`);
    } catch (error) {
        console.error('Error logging new guild to MySQL:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// Handle Slash Commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.slashCommands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
});

// Handle Prefix Commands
client.on('messageCreate', async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    let connection;
    let prefix;
    try {
        connection = await mysql.createConnection({
            host: config.host,
            user: config.user,
            password: config.password,
            database: config.database,
        });

        // Retrieve the prefix from the database for the current guild
        const [rows] = await connection.query('SELECT prefix FROM server_logs WHERE guildId = ?', [message.guild.id]);
        
        if (rows.length > 0) {
            prefix = rows[0].prefix; // Get the prefix from the database
        } else {
            console.error('Guild not found in database.');
            return;
        }
    } catch (error) {
        console.error('Error connecting to MySQL:', error);
        return; // Exit the function if there's a database error
    } finally {
        if (connection) {
            await connection.end();
        }
    }

    // Check if the message starts with the specified prefix
    if (!message.content.startsWith(prefix)) return;

    // Extract command and arguments
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.prefixCommands.get(commandName);
    if (!command) return;

    try {
        await command.execute(message, args);
    } catch (error) {
        console.error(`Error executing prefix command ${commandName}:`, error);
        message.reply('There was an error trying to execute that command!');
    }
});

// Log in to Discord with the bot's token
client.login(config.token);
