import discord
from discord.ext import commands
from discord import app_commands
from typing import Optional
import json
import os
import time
import random

from utils.db import Database
from utils.helpers import get_coin_emoji, create_embed

class ShopItem:
    def __init__(self, id: str, name: str, description: str, price: int, category: str, useable: bool = False, effect: Optional[str] = None):
        self.id = id
        self.name = name
        self.description = description
        self.price = price
        self.category = category
        self.useable = useable
        self.effect = effect

class Shop(commands.Cog):
    """Shop system for buying and using items"""

    def __init__(self, bot):
        self.bot = bot
        self.coin_emoji = get_coin_emoji()
        
        # Define available colors
        self.available_colors = {
            "red": discord.Color.red(),
            "orange": discord.Color.orange(),
            "yellow": discord.Color.yellow(),
            "green": discord.Color.green(),
            "blue": discord.Color.blue(),
            "purple": discord.Color.purple(),
            "pink": discord.Color.pink(),
            "gold": discord.Color.gold(),
            "teal": discord.Color.teal(),
            "dark_blue": discord.Color.dark_blue(),
            "dark_green": discord.Color.dark_green(),
            "dark_purple": discord.Color.dark_purple(),
            "dark_red": discord.Color.dark_red(),
            "dark_teal": discord.Color.dark_teal(),
            "dark_orange": discord.Color.dark_orange(),
            "dark_gold": discord.Color.dark_gold(),
            "dark_grey": discord.Color.dark_grey(),
            "light_grey": discord.Color.light_grey(),
            "darker_grey": discord.Color.darker_grey(),
            "lighter_grey": discord.Color.lighter_grey(),
            "blurple": discord.Color.blurple(),
            "fuchsia": discord.Color.fuchsia(),
            "magenta": discord.Color.magenta(),
            "dark_magenta": discord.Color.dark_magenta(),
            "dark_theme": discord.Color.dark_theme(),
            "brand_red": discord.Color.brand_red(),
            "brand_green": discord.Color.brand_green(),
        }
        
        # Define shop items
        self.items = {
            # Tools
            "fishing_rod": ShopItem(
                id="fishing_rod",
                name="Fishing Rod",
                description="A basic fishing rod. Increases fishing rewards by 20%",
                price=500,
                category="Tools",
                useable=True,
                effect="fishing_boost"
            ),
            "pickaxe": ShopItem(
                id="pickaxe",
                name="Pickaxe",
                description="A sturdy pickaxe. Increases mining rewards by 20%",
                price=500,
                category="Tools",
                useable=True,
                effect="mining_boost"
            ),
            
            # Consumables
            "lucky_charm": ShopItem(
                id="lucky_charm",
                name="Lucky Charm",
                description="A charm that increases your chances of success for 1 hour",
                price=1000,
                category="Consumables",
                useable=True,
                effect="luck_boost"
            ),
            "energy_drink": ShopItem(
                id="energy_drink",
                name="Energy Drink",
                description="Reduces work cooldown by 50% for 1 hour",
                price=800,
                category="Consumables",
                useable=True,
                effect="work_boost"
            ),
            
            # Collectibles
            "golden_fish": ShopItem(
                id="golden_fish",
                name="Golden Fish",
                description="A rare collectible fish",
                price=2000,
                category="Collectibles"
            ),
            "diamond": ShopItem(
                id="diamond",
                name="Diamond",
                description="A precious gemstone",
                price=3000,
                category="Collectibles"
            ),
            
            # Special
            "name_color": ShopItem(
                id="name_color",
                name="Name Color",
                description="Unlock a random color for your name",
                price=5000,
                category="Special",
                useable=True,
                effect="name_color"
            ),
            "custom_role": ShopItem(
                id="custom_role",
                name="Custom Role",
                description="Get a custom role in the server",
                price=10000,
                category="Special",
                useable=True,
                effect="custom_role"
            )
        }
        
        # Initialize data files if they don't exist
        self.initialize_data_files()

    def initialize_data_files(self):
        """Initialize the shop data files if they don't exist"""
        # Initialize inventory data
        if not os.path.exists("data/inventory.json"):
            with open("data/inventory.json", "w") as f:
                json.dump({}, f)
        
        # Initialize effects data
        if not os.path.exists("data/effects.json"):
            with open("data/effects.json", "w") as f:
                json.dump({}, f)
                
        # Initialize colors data
        if not os.path.exists("data/colors.json"):
            with open("data/colors.json", "w") as f:
                json.dump({}, f)

    def get_inventory(self, user_id: int) -> dict:
        """Get a user's inventory"""
        inventory_data = Database.load_data("data/inventory.json")
        user_id = str(user_id)
        
        if user_id not in inventory_data:
            inventory_data[user_id] = {}
            Database.save_data("data/inventory.json", inventory_data)
            
        return inventory_data[user_id]

    def update_inventory(self, user_id: int, item_id: str, quantity: int):
        """Update a user's inventory"""
        inventory_data = Database.load_data("data/inventory.json")
        user_id = str(user_id)
        
        if user_id not in inventory_data:
            inventory_data[user_id] = {}
            
        if quantity <= 0:
            if item_id in inventory_data[user_id]:
                del inventory_data[user_id][item_id]
        else:
            inventory_data[user_id][item_id] = quantity
            
        Database.save_data("data/inventory.json", inventory_data)

    def get_active_effects(self, user_id: int) -> dict:
        """Get a user's active effects"""
        effects_data = Database.load_data("data/effects.json")
        user_id = str(user_id)
        
        if user_id not in effects_data:
            effects_data[user_id] = {}
            Database.save_data("data/effects.json", effects_data)
            
        return effects_data[user_id]

    def update_effect(self, user_id: int, effect: str, expires_at: int):
        """Update a user's effect"""
        effects_data = Database.load_data("data/effects.json")
        user_id = str(user_id)
        
        if user_id not in effects_data:
            effects_data[user_id] = {}
            
        effects_data[user_id][effect] = expires_at
        Database.save_data("data/effects.json", effects_data)

    def remove_effect(self, user_id: int, effect: str):
        """Remove a user's effect"""
        effects_data = Database.load_data("data/effects.json")
        user_id = str(user_id)
        
        if user_id in effects_data and effect in effects_data[user_id]:
            del effects_data[user_id][effect]
            Database.save_data("data/effects.json", effects_data)

    def get_item(self, item_id: str) -> Optional[ShopItem]:
        return self.items.get(item_id)

    def get_unlocked_colors(self, user_id: int) -> list:
        """Get a user's unlocked colors"""
        colors_data = Database.load_data("data/colors.json")
        user_id = str(user_id)
        
        if user_id not in colors_data:
            colors_data[user_id] = []
            Database.save_data("data/colors.json", colors_data)
            
        return colors_data[user_id]

    def unlock_random_color(self, user_id: int) -> Optional[str]:
        """Unlock a random color for a user"""
        colors_data = Database.load_data("data/colors.json")
        user_id = str(user_id)
        
        if user_id not in colors_data:
            colors_data[user_id] = []
            
        # Get available colors that user hasn't unlocked yet
        available_colors = [color for color in self.available_colors.keys() if color not in colors_data[user_id]]
        
        if not available_colors:
            return None
            
        # Select a random color
        selected_color = random.choice(available_colors)
        colors_data[user_id].append(selected_color)
        Database.save_data("data/colors.json", colors_data)
        
        return selected_color

    async def get_inventory_embed(self, user_id: int) -> discord.Embed:
        """Create an embed showing the user's inventory"""
        # Get user's inventory
        inventory = self.get_inventory(user_id)
        
        # Get user object
        user = self.bot.get_user(user_id)
        if not user:
            user = await self.bot.fetch_user(user_id)
        
        # Create embed
        embed = create_embed(
            title=f"🎒 {user.display_name}'s Inventory",
            color=user.accent_color or discord.Color.blue(),
            thumbnail=user.display_avatar.url
        )
        
        # Add active boosters section first
        active_effects = self.get_active_effects(user_id)
        if active_effects:
            effects_text = ""
            current_time = int(time.time())
            for effect, expires_at in active_effects.items():
                remaining_time = expires_at - current_time
                if remaining_time > 0:
                    minutes = remaining_time // 60
                    seconds = remaining_time % 60
                    effect_name = effect.replace("_", " ").title()
                    effects_text += f"⏳ {effect_name} ({minutes}m {seconds}s remaining)\n"
            
            if effects_text:
                embed.add_field(name="✨ Active Boosters", value=effects_text, inline=False)
        
        # Add unlocked colors section
        unlocked_colors = self.get_unlocked_colors(user_id)
        if unlocked_colors:
            colors_text = ""
            for color in unlocked_colors:
                color_obj = self.available_colors[color]
                colors_text += f"🔸 {color.title()} ({color_obj})\n"
            embed.add_field(name="🎨 Unlocked Colors", value=colors_text, inline=False)
        
        # Add items by category if there are any
        if inventory:
            # Group items by category
            items_by_category = {}
            for item_id, quantity in inventory.items():
                item = self.get_item(item_id)
                if item:
                    if item.category not in items_by_category:
                        items_by_category[item.category] = []
                    items_by_category[item.category].append((item, quantity))
            
            # Add items to embed by category
            for category, items in items_by_category.items():
                value = ""
                for item, quantity in items:
                    useable_text = "🔹" if item.useable else ""
                    value += f"{useable_text} {item.name} x{quantity}\n"
                embed.add_field(name=category, value=value, inline=False)
        elif not unlocked_colors and not active_effects:
            # Only show empty message if there are no items, colors, or active effects
            embed.description = "Your inventory is empty."
        
        return embed

    async def get_shop_embed(self) -> discord.Embed:
        """Create an embed showing the shop items"""
        embed = create_embed(
            title="🏪 Shop",
            description="Use `/buy <item_id>` to purchase items",
            color=discord.Color.gold()
        )
        
        # Group items by category
        items_by_category = {}
        for item in self.items.values():
            if item.category not in items_by_category:
                items_by_category[item.category] = []
            items_by_category[item.category].append(item)
        
        # Add items to embed by category
        for category, items in items_by_category.items():
            value = ""
            for item in items:
                useable_text = "🔹" if item.useable else ""
                value += f"{useable_text} **{item.name}** ({item.id})\n"
                value += f"Price: {item.price} {self.coin_emoji}\n"
                value += f"{item.description}\n\n"
            embed.add_field(name=category, value=value, inline=False)
        
        return embed

    @app_commands.command(name="shop", description="View the shop")
    async def shop(self, interaction: discord.Interaction):
        """View the shop"""
        embed = await self.get_shop_embed()
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="inventory", description="View your or another user's inventory")
    async def inventory(self, interaction: discord.Interaction, user: Optional[discord.User] = None):
        """Display a user's inventory"""
        target_user = user or interaction.user
        embed = await self.get_inventory_embed(target_user.id)
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="buy", description="Buy an item from the shop")
    async def buy(self, interaction: discord.Interaction, item_id: str):
        """Buy an item from the shop"""
        # Get item
        item = self.get_item(item_id)
        if not item:
            await interaction.response.send_message(f"Item '{item_id}' not found.", ephemeral=True)
            return
        
        # Check if user has enough coins
        balance = Database.get_user_balance(interaction.user.id)
        if balance < item.price:
            await interaction.response.send_message(
                f"You don't have enough coins. You need {item.price} {self.coin_emoji} but you have {balance} {self.coin_emoji}.",
                ephemeral=True
            )
            return
        
        # Add item to inventory
        inventory = self.get_inventory(interaction.user.id)
        current_quantity = inventory.get(item.id, 0)
        self.update_inventory(interaction.user.id, item.id, current_quantity + 1)
        
        # Deduct coins
        Database.update_user_balance(interaction.user.id, item.price, "subtract")
        
        # Send success message
        await interaction.response.send_message(
            f"You bought {item.name} for {item.price} {self.coin_emoji}!"
        )

    @app_commands.command(name="color", description="Change your name color")
    async def color(self, interaction: discord.Interaction, color: str):
        """Change your name color"""
        # Check if color is valid
        if color.lower() not in self.available_colors:
            await interaction.response.send_message(
                f"Invalid color. Use `/shop` to see available colors.",
                ephemeral=True
            )
            return
            
        # Check if user has unlocked the color
        unlocked_colors = self.get_unlocked_colors(interaction.user.id)
        if color.lower() not in unlocked_colors:
            await interaction.response.send_message(
                f"You haven't unlocked this color yet. Buy a Name Color item from the shop to unlock random colors!",
                ephemeral=True
            )
            return
            
        # Get or create color role
        role_name = f"Color: {color.title()}"
        role = discord.utils.get(interaction.guild.roles, name=role_name)
        
        if not role:
            # Create the role
            role = await interaction.guild.create_role(
                name=role_name,
                color=self.available_colors[color.lower()],
                mentionable=False,
                hoist=False
            )
            
        # Remove other color roles from user
        for member_role in interaction.user.roles:
            if member_role.name.startswith("Color: "):
                await interaction.user.remove_roles(member_role)
                
        # Add the new color role
        await interaction.user.add_roles(role)
        
        # Send success message
        await interaction.response.send_message(
            f"Your name color has been changed to {color.title()}!"
        )

    @app_commands.command(name="use", description="Use an item from your inventory")
    async def use(self, interaction: discord.Interaction, item_id: str):
        """Use an item from your inventory"""
        # Get item
        item = self.get_item(item_id)
        if not item:
            await interaction.response.send_message(f"Item '{item_id}' not found.", ephemeral=True)
            return
        
        # Check if item is useable
        if not item.useable:
            await interaction.response.send_message(f"You can't use {item.name}.", ephemeral=True)
            return
        
        # Check if user has the item
        inventory = self.get_inventory(interaction.user.id)
        if item.id not in inventory or inventory[item.id] <= 0:
            await interaction.response.send_message(f"You don't have any {item.name}.", ephemeral=True)
            return
        
        # Handle different effects
        if item.effect == "fishing_boost":
            # Add fishing boost effect
            expires_at = int(time.time()) + 3600  # 1 hour
            self.update_effect(interaction.user.id, "fishing_boost", expires_at)
            await interaction.response.send_message(
                f"You used {item.name}! Your fishing rewards are increased by 20% for 1 hour."
            )
        
        elif item.effect == "mining_boost":
            # Add mining boost effect
            expires_at = int(time.time()) + 3600  # 1 hour
            self.update_effect(interaction.user.id, "mining_boost", expires_at)
            await interaction.response.send_message(
                f"You used {item.name}! Your mining rewards are increased by 20% for 1 hour."
            )
        
        elif item.effect == "luck_boost":
            # Add luck boost effect
            expires_at = int(time.time()) + 3600  # 1 hour
            self.update_effect(interaction.user.id, "luck_boost", expires_at)
            await interaction.response.send_message(
                f"You used {item.name}! Your chances of success are increased for 1 hour."
            )
        
        elif item.effect == "work_boost":
            # Add work boost effect
            expires_at = int(time.time()) + 3600  # 1 hour
            self.update_effect(interaction.user.id, "work_boost", expires_at)
            await interaction.response.send_message(
                f"You used {item.name}! Your work cooldown is reduced by 50% for 1 hour."
            )
        
        elif item.effect == "name_color":
            # Unlock a random color
            unlocked_color = self.unlock_random_color(interaction.user.id)
            if not unlocked_color:
                await interaction.response.send_message(
                    "You've already unlocked all available colors!",
                    ephemeral=True
                )
                return
                
            await interaction.response.send_message(
                f"You used {item.name} and unlocked the {unlocked_color.title()} color!\n"
                f"Use `/color {unlocked_color}` to apply it."
            )
        
        elif item.effect == "custom_role":
            # Handle custom role
            await interaction.response.send_message(
                "Please contact an admin to get your custom role.",
                ephemeral=True
            )
            return
        
        # Remove one item from inventory
        current_quantity = inventory[item.id]
        self.update_inventory(interaction.user.id, item.id, current_quantity - 1)

async def setup(bot):
    await bot.add_cog(Shop(bot)) 