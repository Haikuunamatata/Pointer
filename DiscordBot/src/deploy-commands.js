const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
const commandFoldersPath = path.join(__dirname, 'commands');

try {
  // Get all command folders
  const commandFolders = fs.readdirSync(commandFoldersPath);

  for (const folder of commandFolders) {
    // Get all command files in each folder
    const commandFiles = fs
      .readdirSync(path.join(commandFoldersPath, folder))
      .filter(file => file.endsWith('.js'));
    
    console.log(`Loading commands from ${folder}...`);
    
    // Load command data for each command
    for (const file of commandFiles) {
      const filePath = path.join(commandFoldersPath, folder, file);
      const command = require(filePath);
      
      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`Added command: ${command.data.name}`);
      } else {
        console.log(`[WARNING] The command at ${filePath} is missing required properties.`);
      }
    }
  }
} catch (error) {
  console.error('Error loading commands:', error);
  process.exit(1);
}

// Setup REST API client
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Deploy commands
(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // Deploy commands globally
    const data = await rest.put(
      Routes.applicationCommands(process.env.DISCORD_APP_ID),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('Error deploying commands:', error);
  }
})(); 