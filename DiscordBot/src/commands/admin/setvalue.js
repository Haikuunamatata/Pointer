const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getSingleResult, runQuery } = require('../../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setvalue')
    .setDescription('Set a value in the database (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('table')
        .setDescription('The table to modify')
        .setRequired(true)
        .addChoices(
          { name: 'Users', value: 'users' },
          { name: 'Items', value: 'items' },
          { name: 'Fishing Tools', value: 'fishing_tools' },
          { name: 'Fishing Baits', value: 'fishing_baits' },
          { name: 'Item Skins', value: 'item_skins' },
          { name: 'Level Rewards', value: 'level_rewards' }
        ))
    .addStringOption(option =>
      option.setName('id')
        .setDescription('The ID of the row to modify')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('column')
        .setDescription('The column to modify')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('value')
        .setDescription('The new value')
        .setRequired(true)),
  
  cooldown: 5,
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    // Check if user has administrator permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({
        content: 'You need administrator permissions to use this command.',
        ephemeral: true
      });
    }
    
    const table = interaction.options.getString('table');
    const id = interaction.options.getString('id');
    const column = interaction.options.getString('column');
    const value = interaction.options.getString('value');
    
    // Validate table name to prevent SQL injection
    const validTables = ['users', 'items', 'fishing_tools', 'fishing_baits', 'item_skins', 'level_rewards'];
    if (!validTables.includes(table)) {
      return interaction.editReply({
        content: 'Invalid table name.',
        ephemeral: true
      });
    }
    
    // Validate column name to prevent SQL injection
    const validColumns = {
      users: ['coins', 'xp', 'level', 'username'],
      items: ['name', 'description', 'category', 'price', 'sellable', 'tradeable', 'image_url'],
      fishing_tools: ['name', 'description', 'price', 'power', 'durability', 'image_url'],
      fishing_baits: ['name', 'description', 'price', 'power', 'target_fish', 'image_url'],
      item_skins: ['name', 'item_id', 'rarity', 'price', 'image_url'],
      level_rewards: ['level', 'reward_type', 'reward_id', 'reward_amount', 'description', 'role_id']
    };
    
    if (!validColumns[table].includes(column)) {
      return interaction.editReply({
        content: `Invalid column name for table ${table}. Valid columns are: ${validColumns[table].join(', ')}`,
        ephemeral: true
      });
    }
    
    try {
      // Check if the row exists
      const row = await getSingleResult(
        `SELECT * FROM ${table} WHERE id = ?`,
        [id]
      );
      
      if (!row) {
        return interaction.editReply({
          content: `No row found with ID ${id} in table ${table}.`,
          ephemeral: true
        });
      }
      
      // Update the value
      await runQuery(
        `UPDATE ${table} SET ${column} = ? WHERE id = ?`,
        [value, id]
      );
      
      // Get the updated row
      const updatedRow = await getSingleResult(
        `SELECT * FROM ${table} WHERE id = ?`,
        [id]
      );
      
      await interaction.editReply({
        content: `Successfully updated ${column} to ${value} in ${table} for ID ${id}.\n\nUpdated row:\n${JSON.stringify(updatedRow, null, 2)}`,
        ephemeral: true
      });
    } catch (error) {
      console.error('Error updating database:', error);
      await interaction.editReply({
        content: `Error updating database: ${error.message}`,
        ephemeral: true
      });
    }
  },
}; 