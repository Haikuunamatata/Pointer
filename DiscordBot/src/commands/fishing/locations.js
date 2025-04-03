const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSingleResult, getResults } = require('../../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('locations')
    .setDescription('View available fishing locations'),
  
  cooldown: 5, // 5 seconds cooldown
  
  async execute(interaction) {
    await interaction.deferReply();
    
    // Get user's level
    const userData = await getSingleResult(
      'SELECT level FROM users WHERE id = ?',
      [interaction.user.id]
    );
    
    const userLevel = userData?.level || 1;
    
    // Get all fishing locations
    const locations = await getResults(`
      SELECT l.*, 
             GROUP_CONCAT(f.name) as fish_names,
             GROUP_CONCAT(f.rarity) as fish_rarities
      FROM fishing_locations l
      LEFT JOIN fish f ON f.id IN (
        SELECT value FROM json_each('[' || l.fish_types || ']')
      )
      GROUP BY l.id
      ORDER BY l.unlock_level
    `);
    
    // Create locations embed
    const locationsEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Fishing Locations')
      .setDescription('Here are all the available fishing locations:')
      .setTimestamp();
    
    // Add locations to embed
    for (const location of locations) {
      const fishList = location.fish_names ? location.fish_names.split(',')
        .map((name, i) => {
          const rarity = location.fish_rarities.split(',')[i];
          let rarityEmoji;
          switch (rarity.toLowerCase()) {
            case 'common': rarityEmoji = '⚪'; break;
            case 'uncommon': rarityEmoji = '🟢'; break;
            case 'rare': rarityEmoji = '🔵'; break;
            case 'epic': rarityEmoji = '🟣'; break;
            case 'legendary': rarityEmoji = '🟡'; break;
            default: rarityEmoji = '⚪'; break;
          }
          return `${rarityEmoji} ${name}`;
        })
        .join('\n') : 'No fish data available';
      
      const isUnlocked = userLevel >= location.unlock_level;
      const status = isUnlocked ? '✅ Unlocked' : `🔒 Requires Level ${location.unlock_level}`;
      
      locationsEmbed.addFields({
        name: `${location.name} ${isUnlocked ? '' : '(Locked)'}`,
        value: `${location.description}\n\n` +
               `**Level Required:** ${location.unlock_level}\n` +
               `**Status:** ${status}\n\n` +
               `**Available Fish:**\n${fishList}`,
        inline: false
      });
    }
    
    // Send locations embed
    await interaction.editReply({ embeds: [locationsEmbed] });
  }
}; 