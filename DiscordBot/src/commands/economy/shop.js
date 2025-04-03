const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getResults, getSingleResult, runQuery } = require('../../utils/database');
const { formatNumber } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and purchase items from the shop')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('The category of items to browse')
        .setRequired(false)
        .addChoices(
          { name: 'Fishing Rods', value: 'fishing_tools' },
          { name: 'Bait', value: 'fishing_baits' },
          { name: 'Items', value: 'items' },
          { name: 'Skins', value: 'skins' }
        ))
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('The page number to view')
        .setRequired(false)
        .setMinValue(1)),
  
  cooldown: 5, // 5 seconds cooldown
  
  async execute(interaction) {
    // If this is a button interaction, we'll edit the message
    const isButtonInteraction = interaction.isButton();
    
    if (!isButtonInteraction) {
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
    const category = isButtonInteraction ? interaction.options.getString() : interaction.options.getString('category') || 'fishing_tools';
    const page = isButtonInteraction ? interaction.options.getInteger() : interaction.options.getInteger('page') || 1;
    const itemsPerPage = 5;
    
    // Get items from selected category
    let items;
    let title;
    let description;
    
    switch (category) {
      case 'fishing_tools':
        items = await getResults('SELECT * FROM fishing_tools ORDER BY price ASC');
        title = '🎣 Fishing Rods Shop';
        description = 'Browse and purchase fishing rods to catch different types of fish.';
        break;
      
      case 'fishing_baits':
        items = await getResults('SELECT * FROM fishing_baits ORDER BY price ASC');
        title = '🪱 Fishing Bait Shop';
        description = 'Browse and purchase bait to increase your chances of catching specific fish.';
        break;
      
      case 'items':
        items = await getResults('SELECT * FROM items WHERE sellable = 1 ORDER BY price ASC');
        title = '🏪 Item Shop';
        description = 'Browse and purchase various items for your adventures.';
        break;
      
      case 'skins':
        items = await getResults('SELECT * FROM item_skins ORDER BY price ASC');
        title = '✨ Skin Shop';
        description = 'Browse and purchase skins for your items.';
        break;
      
      default:
        items = await getResults('SELECT * FROM fishing_tools ORDER BY price ASC');
        title = '🎣 Fishing Rods Shop';
        description = 'Browse and purchase fishing rods to catch different types of fish.';
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(items.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const displayedItems = items.slice(startIndex, endIndex);
    
    if (displayedItems.length === 0) {
      return interaction.editReply(`No items found in this category or page (${page}).`);
    }
    
    // Create shop embed
    const shopEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(title)
      .setDescription(`${description}\n\nYour coins: **${formatNumber(userData.coins)}** 💰`)
      .setFooter({ text: `Page ${page}/${totalPages} • Use the menu below to navigate` })
      .setTimestamp();
    
    // Add items to embed
    for (const item of displayedItems) {
      let fieldValue = `Price: **${formatNumber(item.price)}** 💰\n${item.description}`;
      
      if (category === 'fishing_tools') {
        fieldValue += `\nPower: **${item.power}** | Durability: **${item.durability}**`;
      } else if (category === 'fishing_baits') {
        fieldValue += `\nPower: **${item.power}**`;
        if (item.target_fish) {
          fieldValue += ` | Targets specific fish`;
        }
      } else if (category === 'skins') {
        fieldValue += `\nRarity: **${item.rarity}**`;
      }
      
      shopEmbed.addFields({
        name: `${item.id}. ${item.name}`,
        value: fieldValue
      });
    }
    
    // Create category selector
    const categoryRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('shop_category')
          .setPlaceholder('Select a category')
          .addOptions([
            {
              label: 'Fishing Rods',
              description: 'View available fishing rods',
              value: 'fishing_tools',
              emoji: '🎣',
              default: category === 'fishing_tools'
            },
            {
              label: 'Bait',
              description: 'View available fishing bait',
              value: 'fishing_baits',
              emoji: '🪱',
              default: category === 'fishing_baits'
            },
            {
              label: 'Items',
              description: 'View general items',
              value: 'items',
              emoji: '🏪',
              default: category === 'items'
            },
            {
              label: 'Skins',
              description: 'View item skins',
              value: 'skins',
              emoji: '✨',
              default: category === 'skins'
            }
          ])
      );
    
    // Create pagination buttons
    const paginationRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('shop_prev')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId('shop_next')
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages),
        new ButtonBuilder()
          .setCustomId('shop_buy')
          .setLabel('Buy Item')
          .setStyle(ButtonStyle.Primary)
      );
    
    // Send or edit the message
    if (isButtonInteraction) {
      await interaction.update({
        embeds: [shopEmbed],
        components: [categoryRow, paginationRow]
      });
    } else {
      await interaction.editReply({
        embeds: [shopEmbed],
        components: [categoryRow, paginationRow]
      });
    }
  },
}; 