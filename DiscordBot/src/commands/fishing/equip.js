const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getSingleResult, getResults, runQuery } = require('../../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('equip')
    .setDescription('Equip fishing tools and baits')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('The type of item to equip')
        .addChoices(
          { name: 'Fishing Rod', value: 'tool' },
          { name: 'Bait', value: 'bait' }
        )
        .setRequired(true)),
  
  cooldown: 5, // 5 seconds cooldown
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const type = interaction.options.getString('type');
    
    // Get user's inventory items of the specified type
    let items;
    let title;
    
    if (type === 'tool') {
      items = await getResults(`
        SELECT t.*, ui.quantity, ui.equipped 
        FROM user_inventory ui
        JOIN fishing_tools t ON ui.item_id = t.id
        WHERE ui.user_id = ? AND ui.item_type = 'tool'
        ORDER BY t.power DESC
      `, [interaction.user.id]);
      title = 'Fishing Tools';
    } else {
      items = await getResults(`
        SELECT b.*, ui.quantity, ui.equipped 
        FROM user_inventory ui
        JOIN fishing_baits b ON ui.item_id = b.id
        WHERE ui.user_id = ? AND ui.item_type = 'bait'
        ORDER BY b.power DESC
      `, [interaction.user.id]);
      title = 'Fishing Baits';
    }
    
    if (items.length === 0) {
      return interaction.editReply(`You don't have any ${type === 'tool' ? 'fishing tools' : 'baits'} in your inventory.`);
    }
    
    // Create equip embed
    const equipEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`Equip ${title}`)
      .setDescription(`Select a ${type === 'tool' ? 'fishing tool' : 'bait'} to equip.`)
      .setTimestamp();
    
    // Add items to embed
    for (const item of items) {
      equipEmbed.addFields({
        name: item.name,
        value: `Power: ${item.power}\n${item.equipped ? '**Currently Equipped**' : ''}`,
        inline: true
      });
    }
    
    // Create item selector
    const itemRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('equip_item')
          .setPlaceholder(`Select a ${type === 'tool' ? 'fishing tool' : 'bait'} to equip`)
          .addOptions(
            items.map(item => ({
              label: item.name,
              description: `Power: ${item.power}${item.equipped ? ' (Equipped)' : ''}`,
              value: `${type}_${item.id}`
            }))
          )
      );
    
    // Send equip embed
    await interaction.editReply({
      embeds: [equipEmbed],
      components: [itemRow]
    });
  }
}; 