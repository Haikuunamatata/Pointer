const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows information about available commands')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('The category of commands to view')
        .addChoices(
          { name: 'General', value: 'general' },
          { name: 'Fishing', value: 'fishing' },
          { name: 'Economy', value: 'economy' }
        )
        .setRequired(false)),
  
  cooldown: 5, // 5 seconds cooldown
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const category = interaction.options.getString('category');
    
    // Get all commands
    const commands = interaction.client.commands;
    
    // Organize commands by category
    const commandCategories = {
      general: [],
      fishing: [],
      economy: []
    };
    
    for (const command of commands.values()) {
      if (command.category && commandCategories[command.category]) {
        commandCategories[command.category].push(command);
      }
    }
    
    // Create help embed
    const helpEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Pointer Community Bot Help')
      .setDescription('Here are all the available commands:')
      .setTimestamp();
    
    if (category) {
      // Show commands for specific category
      const categoryCommands = commandCategories[category];
      if (categoryCommands.length === 0) {
        helpEmbed.addFields({
          name: category.charAt(0).toUpperCase() + category.slice(1),
          value: 'No commands found in this category.'
        });
      } else {
        helpEmbed.addFields({
          name: category.charAt(0).toUpperCase() + category.slice(1),
          value: categoryCommands
            .map(cmd => `**/${cmd.data.name}** - ${cmd.data.description}`)
            .join('\n')
        });
      }
    } else {
      // Show all commands by category
      for (const [cat, cmds] of Object.entries(commandCategories)) {
        if (cmds.length > 0) {
          helpEmbed.addFields({
            name: cat.charAt(0).toUpperCase() + cat.slice(1),
            value: cmds
              .map(cmd => `**/${cmd.data.name}** - ${cmd.data.description}`)
              .join('\n')
          });
        }
      }
    }
    
    // Add footer with additional information
    helpEmbed.setFooter({
      text: 'Use /help [category] to view commands for a specific category'
    });
    
    // Send help embed
    await interaction.editReply({ embeds: [helpEmbed] });
  }
}; 