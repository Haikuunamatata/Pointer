const { Events, Collection } = require('discord.js');
const { getSingleResult, runQuery } = require('../utils/database');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      // Handle command cooldowns
      const { cooldowns } = interaction.client;
      
      if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Collection());
      }
      
      const now = Date.now();
      const timestamps = cooldowns.get(command.data.name);
      const defaultCooldownDuration = 3; // 3 seconds
      const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;
      
      if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
        
        if (now < expirationTime) {
          const expiredTimestamp = Math.round(expirationTime / 1000);
          return interaction.reply({ 
            content: `Please wait <t:${expiredTimestamp}:R> before using the \`${command.data.name}\` command again.`,
            ephemeral: true 
          });
        }
      }
      
      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}`);
        console.error(error);
        
        const errorMessage = 'There was an error while executing this command!';
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    }
    
    // Handle button interactions
    else if (interaction.isButton()) {
      // Code to handle button interactions
    }
    
    // Handle select menu interactions
    else if (interaction.isStringSelectMenu()) {
      // Handle equip item selection
      if (interaction.customId === 'equip_item') {
        const [type, itemId] = interaction.values[0].split('_');
        
        // Unequip all items of the same type
        await runQuery(
          `UPDATE user_inventory 
           SET equipped = 0 
           WHERE user_id = ? AND item_type = ?`,
          [interaction.user.id, type]
        );
        
        // Equip the selected item
        await runQuery(
          `UPDATE user_inventory 
           SET equipped = 1 
           WHERE user_id = ? AND item_type = ? AND item_id = ?`,
          [interaction.user.id, type, itemId]
        );
        
        // Get the item details
        let item;
        if (type === 'tool') {
          item = await getSingleResult(
            'SELECT * FROM fishing_tools WHERE id = ?',
            [itemId]
          );
        } else {
          item = await getSingleResult(
            'SELECT * FROM fishing_baits WHERE id = ?',
            [itemId]
          );
        }
        
        await interaction.update({
          content: `You have equipped ${item.name}!`,
          embeds: [],
          components: []
        });
      }
      
      // Handle collection sorting
      else if (interaction.customId === 'collection_sort') {
        const sort = interaction.values[0];
        const command = interaction.client.commands.get('collection');
        if (command) {
          interaction.options = {
            getString: () => sort
          };
          await command.execute(interaction);
        }
      }
      
      // Handle inventory category selection
      else if (interaction.customId === 'inventory_category') {
        const command = interaction.client.commands.get('inventory');
        if (command) {
          await command.execute(interaction);
        }
      }
    }
    
    // Handle modal submissions
    else if (interaction.isModalSubmit()) {
      // Code to handle modal submissions
    }
  },
}; 