const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSingleResult, getResults, runQuery } = require('../../utils/database');
const { randomInt, chance, randomChoice, checkCooldown } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fish')
    .setDescription('Go fishing to catch fish')
    .addStringOption(option => 
      option.setName('location')
        .setDescription('The location to fish at')
        .setRequired(false)),
  
  cooldown: 5, // 5 seconds cooldown
  
  async execute(interaction) {
    await interaction.deferReply();
    
    // Get user data, create if not exists
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
    
    // Check if user has a fishing rod equipped
    const equippedRod = await getSingleResult(
      `SELECT t.* FROM user_inventory ui
       JOIN fishing_tools t ON ui.item_id = t.id
       WHERE ui.user_id = ? AND ui.item_type = 'tool' AND ui.equipped = 1
       LIMIT 1`,
      [interaction.user.id]
    );
    
    if (!equippedRod) {
      return interaction.editReply('You need to equip a fishing rod first! Use `/inventory` to view your inventory.');
    }
    
    // Check if user has bait equipped
    const equippedBait = await getSingleResult(
      `SELECT b.* FROM user_inventory ui
       JOIN fishing_baits b ON ui.item_id = b.id
       WHERE ui.user_id = ? AND ui.item_type = 'bait' AND ui.equipped = 1
       LIMIT 1`,
      [interaction.user.id]
    );
    
    if (!equippedBait) {
      return interaction.editReply('You need to equip bait first! Use `/inventory` to view your inventory.');
    }
    
    // Get available locations based on user level
    const availableLocations = await getResults(
      'SELECT * FROM fishing_locations WHERE unlock_level <= ?',
      [userData.level]
    );
    
    if (availableLocations.length === 0) {
      return interaction.editReply('No fishing locations available. This should not happen.');
    }
    
    // Determine fishing location
    let location;
    const locationOption = interaction.options.getString('location');
    
    if (locationOption) {
      location = availableLocations.find(loc => 
        loc.name.toLowerCase() === locationOption.toLowerCase()
      );
      
      if (!location) {
        return interaction.editReply(`Location "${locationOption}" not found or not unlocked yet.`);
      }
    } else {
      // Default to the first available location
      location = availableLocations[0];
    }
    
    // Get fish available at this location
    const fishTypes = location.fish_types.split(',').map(id => parseInt(id.trim()));
    const availableFish = await getResults(
      'SELECT * FROM fish WHERE id IN (' + fishTypes.join(',') + ')'
    );
    
    if (availableFish.length === 0) {
      return interaction.editReply('No fish available at this location. This should not happen.');
    }
    
    // Calculate catch chance and fish rarity based on rod power and bait
    const rodPower = equippedRod.power;
    const baitPower = equippedBait.power;
    const totalPower = rodPower + baitPower;
    
    // Higher power increases chance of better fish
    const catchChance = Math.min(0.9, 0.5 + (totalPower / 100));
    const rarityBoost = totalPower / 50; // Higher boost means better chance for rare fish
    
    // Determine if catch is successful
    if (!chance(catchChance)) {
      return interaction.editReply(`You cast your line at the ${location.name}, but didn't catch anything this time.`);
    }
    
    // Determine which fish is caught based on rarity and bait preference
    let caughtFish;
    
    // Check if bait targets specific fish
    if (equippedBait.target_fish) {
      const targetFishIds = equippedBait.target_fish.split(',').map(id => parseInt(id.trim()));
      const targetFishInLocation = availableFish.filter(fish => targetFishIds.includes(fish.id));
      
      if (targetFishInLocation.length > 0) {
        // 50% chance to catch a targeted fish if it's in this location
        if (chance(0.5)) {
          caughtFish = randomChoice(targetFishInLocation);
        }
      }
    }
    
    // If no targeted fish caught, determine based on rarity
    if (!caughtFish) {
      // Assign weights based on rarity
      const weightedFish = availableFish.map(fish => {
        let weight;
        switch (fish.rarity.toLowerCase()) {
          case 'common': weight = 70 - rarityBoost; break;
          case 'uncommon': weight = 20 + (rarityBoost * 0.5); break;
          case 'rare': weight = 7 + rarityBoost; break;
          case 'epic': weight = 2 + (rarityBoost * 1.5); break;
          case 'legendary': weight = 1 + (rarityBoost * 2); break;
          default: weight = 50; break;
        }
        return { ...fish, weight };
      });
      
      // Select fish based on weights
      let totalWeight = weightedFish.reduce((sum, fish) => sum + fish.weight, 0);
      let random = Math.random() * totalWeight;
      
      for (const fish of weightedFish) {
        random -= fish.weight;
        if (random <= 0) {
          caughtFish = fish;
          break;
        }
      }
      
      // Fallback if no fish selected
      if (!caughtFish) {
        caughtFish = randomChoice(availableFish);
      }
    }
    
    // Determine fish size
    const fishSize = randomInt(
      Math.floor(caughtFish.min_size * 100), 
      Math.floor(caughtFish.max_size * 100)
    ) / 100;
    
    // Small chance (5%) to catch a variant/chroma version if one exists
    let isVariant = false;
    if (!caughtFish.is_variant && chance(0.05)) {
      const variant = await getSingleResult(
        'SELECT * FROM fish WHERE variant_of = ?',
        [caughtFish.id]
      );
      
      if (variant) {
        caughtFish = variant;
        isVariant = true;
      }
    }
    
    // Calculate value based on size and rarity
    let value = Math.floor(caughtFish.base_value * (fishSize / caughtFish.min_size) * 0.8);
    if (isVariant) value *= 2;
    
    // Add fish to user's collection
    await runQuery(
      'INSERT INTO user_fish (user_id, fish_id, size, location_id) VALUES (?, ?, ?, ?)',
      [interaction.user.id, caughtFish.id, fishSize, location.id]
    );
    
    // Add coins and XP to user
    await runQuery(
      'UPDATE users SET coins = coins + ?, xp = xp + ? WHERE id = ?',
      [value, Math.floor(value * 0.5), interaction.user.id]
    );
    
    // Create catch embed
    let rarityColor;
    switch (caughtFish.rarity.toLowerCase()) {
      case 'common': rarityColor = 0x808080; break;
      case 'uncommon': rarityColor = 0x00FF00; break;
      case 'rare': rarityColor = 0x0000FF; break;
      case 'epic': rarityColor = 0xA020F0; break;
      case 'legendary': rarityColor = 0xFFD700; break;
      default: rarityColor = 0x808080; break;
    }
    
    const catchEmbed = new EmbedBuilder()
      .setColor(rarityColor)
      .setTitle(`${interaction.user.username} caught a ${isVariant ? 'Chroma ' : ''}${caughtFish.name}!`)
      .setDescription(caughtFish.description)
      .addFields(
        { name: '📏 Size', value: `${fishSize.toFixed(2)} lbs`, inline: true },
        { name: '💰 Value', value: `${value} coins`, inline: true },
        { name: '🌟 Rarity', value: caughtFish.rarity, inline: true },
        { name: '📍 Location', value: location.name, inline: true }
      )
      .setFooter({ text: `Rod: ${equippedRod.name} | Bait: ${equippedBait.name}` })
      .setTimestamp();
    
    if (caughtFish.image_url) {
      catchEmbed.setThumbnail(caughtFish.image_url);
    }
    
    await interaction.editReply({ embeds: [catchEmbed] });
  },
}; 