const { Events } = require('discord.js');
const { getSingleResult, runQuery } = require('../utils/database');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Ignore messages from bots
    if (message.author.bot) return;
    
    // Ignore messages in DM channels
    if (!message.guild) return;
    
    // Get user data
    let userData = await getSingleResult(
      'SELECT * FROM users WHERE id = ?',
      [message.author.id]
    );
    
    if (!userData) {
      await runQuery(
        'INSERT INTO users (id, username, coins, xp, level) VALUES (?, ?, ?, ?, ?)',
        [message.author.id, message.author.username, 0, 0, 1]
      );
      
      userData = {
        id: message.author.id,
        username: message.author.username,
        coins: 0,
        xp: 0,
        level: 1
      };
    }
    
    // Award XP (random amount between 5 and 15)
    const xpGained = Math.floor(Math.random() * 11) + 5;
    const newXP = userData.xp + xpGained;
    
    // Calculate XP needed for next level
    const xpNeeded = userData.level * 1000;
    
    // Check for level up
    if (newXP >= xpNeeded) {
      const newLevel = userData.level + 1;
      
      // Get level reward if any
      const reward = await getSingleResult(
        'SELECT * FROM level_rewards WHERE level = ?',
        [newLevel]
      );
      
      let rewardMessage = '';
      if (reward) {
        switch (reward.reward_type) {
          case 'coins':
            await runQuery(
              'UPDATE users SET coins = coins + ? WHERE id = ?',
              [reward.reward_amount, message.author.id]
            );
            rewardMessage = `\nYou received ${formatNumber(reward.reward_amount)} coins as a reward!`;
            break;
            
          case 'role':
            try {
              const member = await message.guild.members.fetch(message.author.id);
              const role = await message.guild.roles.fetch(reward.role_id);
              if (role) {
                await member.roles.add(role);
                rewardMessage = `\nYou received the ${role.name} role as a reward!`;
              }
            } catch (error) {
              console.error('Error adding role:', error);
            }
            break;
            
          case 'item':
            await runQuery(
              'INSERT INTO user_inventory (user_id, item_type, item_id, quantity) VALUES (?, ?, ?, ?)',
              [message.author.id, 'item', reward.reward_id, reward.reward_amount]
            );
            rewardMessage = `\nYou received ${reward.reward_amount}x ${reward.description} as a reward!`;
            break;
        }
      }
      
      await runQuery(
        'UPDATE users SET xp = ?, level = ? WHERE id = ?',
        [newXP - xpNeeded, newLevel, message.author.id]
      );
      
      // Send level up message with reward
      message.channel.send(`🎉 Congratulations ${message.author}! You've reached level ${newLevel}!${rewardMessage}`);
    } else {
      await runQuery(
        'UPDATE users SET xp = ? WHERE id = ?',
        [newXP, message.author.id]
      );
    }
  },
}; 