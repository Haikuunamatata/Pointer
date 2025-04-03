const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getResults, getSingleResult } = require('../../utils/database');
const { formatNumber } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rewards')
    .setDescription('View level rewards and your progress'),
  
  cooldown: 5,
  
  async execute(interaction) {
    await interaction.deferReply();
    
    // Get user's current level
    const userData = await getSingleResult(
      'SELECT level, xp FROM users WHERE id = ?',
      [interaction.user.id]
    );
    
    if (!userData) {
      return interaction.editReply('You need to send some messages first to get your level!');
    }
    
    // Get all level rewards
    const rewards = await getResults(
      'SELECT * FROM level_rewards ORDER BY level ASC'
    );
    
    // Create rewards embed
    const rewardsEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Level Rewards')
      .setDescription(`Your current level: **${userData.level}**\nYour XP: **${formatNumber(userData.xp)}**`)
      .setTimestamp();
    
    // Add rewards to embed
    for (const reward of rewards) {
      let rewardText = reward.description;
      
      // Add status based on user's level
      if (userData.level >= reward.level) {
        rewardText += ' ✅';
      } else {
        const xpNeeded = reward.level * 1000;
        const xpProgress = userData.xp % xpNeeded;
        const progressPercentage = (xpProgress / xpNeeded) * 100;
        rewardText += ` (${progressPercentage.toFixed(1)}% to level ${reward.level})`;
      }
      
      rewardsEmbed.addFields({
        name: `Level ${reward.level}`,
        value: rewardText,
        inline: true
      });
    }
    
    await interaction.editReply({ embeds: [rewardsEmbed] });
  },
}; 