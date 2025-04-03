const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSingleResult, runQuery } = require('../../utils/database');
const { formatNumber } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your profile or another user\'s profile')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to view the profile of')
        .setRequired(false)),
  
  cooldown: 5, // 5 seconds cooldown
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    // Check if user exists in database, create if not
    let userData = await getSingleResult(
      'SELECT * FROM users WHERE id = ?', 
      [targetUser.id]
    );
    
    if (!userData) {
      // Create new user in database
      await runQuery(
        'INSERT INTO users (id, username, coins, xp, level) VALUES (?, ?, ?, ?, ?)',
        [targetUser.id, targetUser.username, 0, 0, 1]
      );
      
      userData = {
        id: targetUser.id,
        username: targetUser.username,
        coins: 0,
        xp: 0,
        level: 1,
        created_at: new Date().toISOString()
      };
    }
    
    // Calculate fishing stats
    const fishCaught = await getSingleResult(
      'SELECT COUNT(*) as count FROM user_fish WHERE user_id = ?',
      [targetUser.id]
    );
    
    // Calculate economy stats
    const itemsOwned = await getSingleResult(
      'SELECT COUNT(*) as count FROM user_inventory WHERE user_id = ?',
      [targetUser.id]
    );
    
    const marketListings = await getSingleResult(
      'SELECT COUNT(*) as count FROM marketplace_listings WHERE seller_id = ?',
      [targetUser.id]
    );
    
    // Calculate XP needed for next level
    const xpNeeded = userData.level * 1000; // Each level requires 1000 XP more than the previous
    const xpProgress = userData.xp % xpNeeded;
    const progressPercentage = (xpProgress / xpNeeded) * 100;
    
    // Create progress bar
    const progressBarLength = 20;
    const filledLength = Math.floor((progressPercentage / 100) * progressBarLength);
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);
    
    // Create profile embed
    const profileEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`${targetUser.username}'s Profile`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '💰 Coins', value: formatNumber(userData.coins), inline: true },
        { name: '📊 Level', value: `${userData.level}`, inline: true },
        { name: '⭐ XP', value: `${formatNumber(userData.xp)}`, inline: true },
        { name: '🎣 Fish Caught', value: `${formatNumber(fishCaught?.count || 0)}`, inline: true },
        { name: '📦 Items Owned', value: `${formatNumber(itemsOwned?.count || 0)}`, inline: true },
        { name: '🏪 Market Listings', value: `${formatNumber(marketListings?.count || 0)}`, inline: true }
      )
      .setFooter({ 
        text: `Member since: ${new Date(userData.created_at).toLocaleDateString()}\n` +
              `Progress to Level ${userData.level + 1}: ${progressBar} ${progressPercentage.toFixed(1)}%`
      })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [profileEmbed] });
  },
}; 