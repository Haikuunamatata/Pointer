const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getSingleResult, getResults, runQuery } = require('../../utils/database');
const { formatNumber } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View and manage your inventory')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('The category of items to view')
        .addChoices(
          { name: 'Tools', value: 'tool' },
          { name: 'Baits', value: 'bait' },
          { name: 'Items', value: 'item' },
          { name: 'Skins', value: 'skin' }
        )
        .setRequired(false)),
  
  cooldown: 5, // 5 seconds cooldown
  
  async execute(interaction) {
    // If this is a select menu interaction, we'll edit the message
    const isSelectMenu = interaction.isStringSelectMenu();
    
    if (!isSelectMenu) {
      await interaction.deferReply();
    }
    
    // Get user data
    let userData = await getSingleResult(
      'SELECT * FROM users WHERE id = ?',
      [interaction.user.id]
    );
    
    if (!userData) {
      await runQuery(
        'INSERT INTO users (id, username, coins, xp, level) VALUES (?, ?, ?, ?, ?)',
        [interaction.user.id, interaction.user.username, 0, 0, 1]
      );
      
      userData = {
        id: interaction.user.id,
        username: interaction.user.username,
        coins: 0,
        xp: 0,
        level: 1
      };
    }
    
    // Determine category to display
    const category = isSelectMenu ? interaction.values[0] : interaction.options.getString('category') || 'tool';
    
    // Get user's inventory items
    let items;
    let title;
    let description;
    
    switch (category) {
      case 'tool':
        items = await getResults(`
          SELECT t.*, ui.quantity, ui.equipped 
          FROM user_inventory ui
          JOIN fishing_tools t ON ui.item_id = t.id
          WHERE ui.user_id = ? AND ui.item_type = 'tool'
          ORDER BY t.power DESC
        `, [interaction.user.id]);
        title = 'Fishing Tools';
        description = 'Your collection of fishing rods and tools';
        break;
        
      case 'bait':
        items = await getResults(`
          SELECT b.*, ui.quantity, ui.equipped 
          FROM user_inventory ui
          JOIN fishing_baits b ON ui.item_id = b.id
          WHERE ui.user_id = ? AND ui.item_type = 'bait'
          ORDER BY b.power DESC
        `, [interaction.user.id]);
        title = 'Fishing Baits';
        description = 'Your collection of fishing baits and lures';
        break;
        
      case 'item':
        items = await getResults(`
          SELECT i.*, ui.quantity 
          FROM user_inventory ui
          JOIN items i ON ui.item_id = i.id
          WHERE ui.user_id = ? AND ui.item_type = 'item'
          ORDER BY i.price DESC
        `, [interaction.user.id]);
        title = 'Items';
        description = 'Your collection of items';
        break;
        
      case 'skin':
        items = await getResults(`
          SELECT s.*, ui.quantity 
          FROM user_inventory ui
          JOIN item_skins s ON ui.item_id = s.id
          WHERE ui.user_id = ? AND ui.item_type = 'skin'
          ORDER BY s.rarity DESC
        `, [interaction.user.id]);
        title = 'Skins';
        description = 'Your collection of item skins';
        break;
    }
    
    // Create inventory embed
    const inventoryEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`${interaction.user.username}'s ${title}`)
      .setDescription(description)
      .setFooter({ text: `Coins: ${formatNumber(userData.coins)}` })
      .setTimestamp();
    
    // Add items to embed
    if (items.length === 0) {
      inventoryEmbed.addFields({
        name: 'Empty',
        value: 'You don\'t have any items in this category.'
      });
    } else {
      for (const item of items) {
        let value = '';
        
        if (category === 'tool' || category === 'bait') {
          value = `Power: ${item.power}\n`;
          if (item.equipped) value += '**Equipped**\n';
        }
        
        if (category === 'item') {
          value = `Category: ${item.category}\n`;
        }
        
        if (category === 'skin') {
          value = `Rarity: ${item.rarity}\n`;
        }
        
        value += `Quantity: ${item.quantity}`;
        
        inventoryEmbed.addFields({
          name: item.name,
          value: value,
          inline: true
        });
      }
    }
    
    // Create category selector
    const categoryRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('inventory_category')
          .setPlaceholder('Select a category')
          .addOptions([
            { label: 'Tools', value: 'tool' },
            { label: 'Baits', value: 'bait' },
            { label: 'Items', value: 'item' },
            { label: 'Skins', value: 'skin' }
          ])
      );
    
    // Send or edit the message
    if (isSelectMenu) {
      await interaction.update({
        embeds: [inventoryEmbed],
        components: [categoryRow]
      });
    } else {
      await interaction.editReply({
        embeds: [inventoryEmbed],
        components: [categoryRow]
      });
    }
  }
}; 