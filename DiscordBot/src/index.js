const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { initializeDatabase } = require('./utils/database');
const { seedDatabase } = require('./utils/seed-data');

// Initialize the Discord client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Collections to store commands and cooldowns
client.commands = new Collection();
client.cooldowns = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
try {
  // Check if the commands directory exists
  if (fs.existsSync(commandsPath)) {
    const commandFolders = fs.readdirSync(commandsPath);

    for (const folder of commandFolders) {
      const folderPath = path.join(commandsPath, folder);
      
      // Skip if not a directory
      if (!fs.statSync(folderPath).isDirectory()) continue;
      
      const commandFiles = fs
        .readdirSync(folderPath)
        .filter(file => file.endsWith('.js'));
      
      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);
        
        // Set the category based on the folder name
        command.category = folder;
        
        if ('data' in command && 'execute' in command) {
          client.commands.set(command.data.name, command);
          console.log(`Loaded command: ${command.data.name} (${folder})`);
        } else {
          console.log(`[WARNING] The command at ${filePath} is missing required properties.`);
        }
      }
    }
  } else {
    console.log(`[WARNING] Commands directory not found at ${commandsPath}`);
  }
} catch (error) {
  console.error('Error loading commands:', error);
}

// Load events
const eventsPath = path.join(__dirname, 'events');
try {
  // Check if the events directory exists
  if (fs.existsSync(eventsPath)) {
    const eventFiles = fs
      .readdirSync(eventsPath)
      .filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file);
      const event = require(filePath);
      
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
    }
  } else {
    console.log(`[WARNING] Events directory not found at ${eventsPath}`);
  }
} catch (error) {
  console.error('Error loading events:', error);
}

// Initialize and seed the database
(async () => {
  try {
    // Initialize database
    initializeDatabase();
    
    // Seed database with initial data
    await seedDatabase();
    
    // Login to Discord
    client.login(process.env.DISCORD_TOKEN)
      .then(() => console.log('Bot is online!'))
      .catch(error => {
        console.error('Error during login:', error);
        process.exit(1);
      });
  } catch (error) {
    console.error('Error during startup:', error);
    process.exit(1);
  }
})(); 