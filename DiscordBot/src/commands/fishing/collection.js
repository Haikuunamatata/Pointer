const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getSingleResult, getResults } = require('../../utils/database');
const { formatNumber } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collection')
    .setDescription('View your fish collection')
    .addStringOption(option =>
      option.setName('sort')
        .setDescription('How to sort your collection')
        .addChoices(
          { name: 'By Rarity', value: 'rarity' },
          { name: 'By Size', value: 'size' },
          { name: 'By Value', value: 'value' }
        )
        .setRequired(false)),
  
  cooldown: 5, // 5 seconds cooldown
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const sort = interaction.options.getString('sort') || 'rarity';
    
    // Get user's fish collection
    const collection = await getResults(`
      SELECT f.*, uf.size, uf.caught_at, l.name as location_name,
             COUNT(*) OVER (PARTITION BY f.id) as total_caught,
             MAX(uf.size) OVER (PARTITION BY f.id) as largest_size
      FROM user_fish uf
      JOIN fish f ON uf.fish_id = f.id
      JOIN fishing_locations l ON uf.location_id = l.id
      WHERE uf.user_id = ?
      ORDER BY 
        CASE WHEN ? = 'rarity' THEN 
          CASE f.rarity
            WHEN 'Legendary' THEN 1
            WHEN 'Epic' THEN 2
            WHEN 'Rare' THEN 3
            WHEN 'Uncommon' THEN 4
            WHEN 'Common' THEN 5
          END
        WHEN ? = 'size' THEN -uf.size
        WHEN ? = 'value' THEN -(f.base_value * (uf.size / f.min_size) * 0.8)
        END
    `, [interaction.user.id, sort, sort, sort]);
    
    if (collection.length === 0) {
      return interaction.editReply('You haven\'t caught any fish yet! Use `/fish` to start fishing.');
    }
    
    // Create collection embed
    const collectionEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`${interaction.user.username}'s Fish Collection`)
      .setDescription(`Total unique fish: ${new Set(collection.map(f => f.id)).size}`)
      .setTimestamp();
    
    // Add fish to embed
    const uniqueFish = new Map();
    for (const fish of collection) {
      if (!uniqueFish.has(fish.id)) {
        uniqueFish.set(fish.id, {
          ...fish,
          total_caught: fish.total_caught,
          largest_size: fish.largest_size
        });
      }
    }
    
    for (const fish of uniqueFish.values()) {
      let rarityColor;
      switch (fish.rarity.toLowerCase()) {
        case 'common': rarityColor = 0x808080; break;
        case 'uncommon': rarityColor = 0x00FF00; break;
        case 'rare': rarityColor = 0x0000FF; break;
        case 'epic': rarityColor = 0xA020F0; break;
        case 'legendary': rarityColor = 0xFFD700; break;
        default: rarityColor = 0x808080; break;
      }
      
      collectionEmbed.addFields({
        name: `${fish.is_variant ? 'Chroma ' : ''}${fish.name}`,
        value: `Rarity: ${fish.rarity}\n` +
               `Total Caught: ${fish.total_caught}\n` +
               `Largest Size: ${fish.largest_size.toFixed(2)} lbs\n` +
               `Base Value: ${fish.base_value} coins\n` +
               `Found in: ${fish.location_name}`,
        inline: true
      });
    }
    
    // Create sort selector
    const sortRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('collection_sort')
          .setPlaceholder('Sort by...')
          .addOptions([
            { label: 'By Rarity', value: 'rarity' },
            { label: 'By Size', value: 'size' },
            { label: 'By Value', value: 'value' }
          ])
      );
    
    // Send collection embed
    await interaction.editReply({
      embeds: [collectionEmbed],
      components: [sortRow]
    });
  }
}; 