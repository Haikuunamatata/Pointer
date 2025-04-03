const { Events, Collection } = require('discord.js');
const { getSingleResult, getResults, runQuery } = require('../utils/database');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatNumber } = require('../utils/helpers');

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
      // Handle shop pagination and buy buttons
      if (interaction.customId.startsWith('shop_')) {
        const [_, action] = interaction.customId.split('_');
        
        // Get the current shop message
        const message = interaction.message;
        const embed = message.embeds[0];
        const currentPage = parseInt(embed.footer.text.split('/')[0].split(' ')[1]);
        const totalPages = parseInt(embed.footer.text.split('/')[1]);
        
        // Get current category from the select menu
        const categoryRow = message.components[0];
        const categorySelect = categoryRow.components[0];
        const currentCategory = categorySelect.options.find(opt => opt.default)?.value || 'fishing_tools';
        
        if (action === 'prev' && currentPage > 1) {
          // Re-run the shop command with the previous page
          const command = interaction.client.commands.get('shop');
          if (command) {
            interaction.options = {
              getString: () => currentCategory,
              getInteger: () => currentPage - 1
            };
            await command.execute(interaction);
          }
        }
        else if (action === 'next' && currentPage < totalPages) {
          // Re-run the shop command with the next page
          const command = interaction.client.commands.get('shop');
          if (command) {
            interaction.options = {
              getString: () => currentCategory,
              getInteger: () => currentPage + 1
            };
            await command.execute(interaction);
          }
        }
        else if (action === 'buy') {
          // Create a modal for item selection
          const modal = new ModalBuilder()
            .setCustomId('shop_buy_modal')
            .setTitle('Buy Item');
            
          const itemInput = new TextInputBuilder()
            .setCustomId('item_id')
            .setLabel('Enter the item ID to buy')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
            
          const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Enter the quantity (default: 1)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);
            
          const firstActionRow = new ActionRowBuilder().addComponents(itemInput);
          const secondActionRow = new ActionRowBuilder().addComponents(quantityInput);
          
          modal.addComponents(firstActionRow, secondActionRow);
          
          await interaction.showModal(modal);
        }
      }
    }
    
    // Handle select menu interactions
    else if (interaction.isStringSelectMenu()) {
      // Handle shop category selection
      if (interaction.customId === 'shop_category') {
        const category = interaction.values[0];
        const message = interaction.message;
        const embed = message.embeds[0];
        const currentPage = 1; // Reset to first page when changing category
        
        // Get user data
        const userData = await getSingleResult(
          'SELECT * FROM users WHERE id = ?',
          [interaction.user.id]
        );
        
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
        }
        
        // Calculate pagination
        const itemsPerPage = 5;
        const totalPages = Math.ceil(items.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const displayedItems = items.slice(startIndex, endIndex);
        
        // Create shop embed
        const shopEmbed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(title)
          .setDescription(`${description}\n\nYour coins: **${formatNumber(userData.coins)}** 💰`)
          .setFooter({ text: `Page ${currentPage}/${totalPages} • Use the menu below to navigate` })
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
              .setDisabled(currentPage <= 1),
            new ButtonBuilder()
              .setCustomId('shop_next')
              .setLabel('Next')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage >= totalPages),
            new ButtonBuilder()
              .setCustomId('shop_buy')
              .setLabel('Buy Item')
              .setStyle(ButtonStyle.Primary)
          );
        
        await interaction.update({
          embeds: [shopEmbed],
          components: [categoryRow, paginationRow]
        });
      }
      
      // Handle equip item selection
      else if (interaction.customId === 'equip_item') {
        const [type, itemId] = interaction.values[0].split('_');
        
        try {
          // First, unequip any currently equipped items of the same type
          await runQuery(
            `UPDATE user_inventory 
             SET equipped = 0 
             WHERE user_id = ? AND item_type = ? AND equipped = 1`,
            [interaction.user.id, type]
          );
          
          // Then equip the selected item
          await runQuery(
            `UPDATE user_inventory 
             SET equipped = 1 
             WHERE user_id = ? AND item_id = ? AND item_type = ?`,
            [interaction.user.id, itemId, type]
          );
          
          // Get the item details
          const item = await getSingleResult(
            `SELECT * FROM ${type === 'tool' ? 'fishing_tools' : 'fishing_baits'} WHERE id = ?`,
            [itemId]
          );
          
          await interaction.update({
            content: `Successfully equipped ${item.name}!`,
            embeds: [],
            components: []
          });
        } catch (error) {
          console.error('Error equipping item:', error);
          await interaction.reply({
            content: 'There was an error equipping the item. Please try again.',
            ephemeral: true
          });
        }
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
      if (interaction.customId === 'shop_buy_modal') {
        const itemId = interaction.fields.getTextInputValue('item_id');
        const quantity = parseInt(interaction.fields.getTextInputValue('quantity')) || 1;
        
        if (isNaN(itemId) || isNaN(quantity) || quantity < 1) {
          return interaction.reply({
            content: 'Please enter valid numbers for the item ID and quantity.',
            ephemeral: true
          });
        }
        
        // Get user's coins
        const userData = await getSingleResult(
          'SELECT coins FROM users WHERE id = ?',
          [interaction.user.id]
        );
        
        if (!userData) {
          return interaction.reply({
            content: 'An error occurred while fetching your data.',
            ephemeral: true
          });
        }
        
        // Get item details
        let item;
        // Try to find the item in each table
        item = await getSingleResult(
          'SELECT *, "tool" as type FROM fishing_tools WHERE id = ?',
          [itemId]
        );
        
        if (!item) {
          item = await getSingleResult(
            'SELECT *, "bait" as type FROM fishing_baits WHERE id = ?',
            [itemId]
          );
        }
        
        if (!item) {
          item = await getSingleResult(
            'SELECT *, "item" as type FROM items WHERE id = ?',
            [itemId]
          );
        }
        
        if (!item) {
          item = await getSingleResult(
            'SELECT *, "skin" as type FROM item_skins WHERE id = ?',
            [itemId]
          );
        }
        
        if (!item) {
          return interaction.reply({
            content: 'Item not found.',
            ephemeral: true
          });
        }
        
        const totalCost = item.price * quantity;
        
        if (userData.coins < totalCost) {
          return interaction.reply({
            content: `You don't have enough coins! You need ${totalCost} coins but only have ${userData.coins} coins.`,
            ephemeral: true
          });
        }
        
        // Deduct coins and add item to inventory
        await runQuery(
          'UPDATE users SET coins = coins - ? WHERE id = ?',
          [totalCost, interaction.user.id]
        );
        
        // Check if user already has this item
        const existingItem = await getSingleResult(
          'SELECT * FROM user_inventory WHERE user_id = ? AND item_id = ? AND item_type = ?',
          [interaction.user.id, itemId, item.type || 'item']
        );
        
        if (existingItem) {
          // Update quantity of existing item
          await runQuery(
            'UPDATE user_inventory SET quantity = quantity + ? WHERE user_id = ? AND item_id = ? AND item_type = ?',
            [quantity, interaction.user.id, itemId, item.type || 'item']
          );
        } else {
          // Add new item to inventory
          await runQuery(
            'INSERT INTO user_inventory (user_id, item_type, item_id, quantity) VALUES (?, ?, ?, ?)',
            [interaction.user.id, item.type || 'item', itemId, quantity]
          );
        }
        
        await interaction.reply({
          content: `Successfully purchased ${quantity}x ${item.name} for ${totalCost} coins!`,
          ephemeral: true
        });
      }
    }
  },
}; 