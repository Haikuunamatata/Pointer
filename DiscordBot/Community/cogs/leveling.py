import discord
from discord.ext import commands
from discord import app_commands
import random
import time
from typing import Optional, Literal
import os

from utils.db import Database
from utils.helpers import create_embed, create_progress_bar, send_dm, calculate_xp_for_level


class LeaderboardView(discord.ui.View):
    """View for switching between XP and coin leaderboards"""
    
    def __init__(self, bot, current_type: str):
        super().__init__(timeout=300)  # 5 minute timeout
        self.bot = bot
        self.current_type = current_type
        
        # Get emoji IDs from environment variables
        xp_emoji_id = os.getenv("XP_ICON_ID")
        coin_emoji_id = os.getenv("COIN_ICON_ID")
        
        # Extract numeric IDs from emoji strings
        def extract_emoji_id(emoji_str):
            if not emoji_str:
                return None
            # Extract the numeric ID from the emoji string
            # Format: <:name:id> or <a:name:id>
            try:
                return int(emoji_str.split(":")[-1].rstrip(">"))
            except (ValueError, IndexError):
                return None
        
        # Get emojis from IDs or use default
        xp_id = extract_emoji_id(xp_emoji_id)
        coin_id = extract_emoji_id(coin_emoji_id)
        
        self.xp_emoji = self.bot.get_emoji(xp_id) if xp_id else "📊"
        self.coin_emoji = self.bot.get_emoji(coin_id) if coin_id else "💰"
        
        # Add buttons
        self.xp_button = discord.ui.Button(
            label="Leaderboard",
            emoji=self.xp_emoji,
            style=discord.ButtonStyle.primary if current_type == "xp" else discord.ButtonStyle.secondary,
            custom_id="xp"
        )
        self.coins_button = discord.ui.Button(
            label="Leaderboard",
            emoji=self.coin_emoji,
            style=discord.ButtonStyle.primary if current_type == "coins" else discord.ButtonStyle.secondary,
            custom_id="coins"
        )
        
        self.xp_button.callback = self.switch_leaderboard
        self.coins_button.callback = self.switch_leaderboard
        
        self.add_item(self.xp_button)
        self.add_item(self.coins_button)
    
    async def switch_leaderboard(self, interaction: discord.Interaction):
        """Switch between XP and coin leaderboards"""
        # Get the new type from the button's custom_id
        new_type = interaction.data["custom_id"]
        
        # Update button styles
        self.xp_button.style = discord.ButtonStyle.primary if new_type == "xp" else discord.ButtonStyle.secondary
        self.coins_button.style = discord.ButtonStyle.primary if new_type == "coins" else discord.ButtonStyle.secondary
        
        # Get the new leaderboard embed
        embed = await self.get_leaderboard_embed(new_type)
        
        # Update the message
        await interaction.response.edit_message(embed=embed, view=self)
    
    async def get_leaderboard_embed(self, type: str):
        """Get the appropriate leaderboard embed"""
        if type == "xp":
            # Get level data
            level_data = Database.load_data("data/levels.json")
            
            # Sort users by XP
            sorted_users = sorted(level_data.items(), key=lambda x: x[1]["xp"], reverse=True)
            
            # Get top 10
            top_users = sorted_users[:10]
            
            # Create embed
            embed = create_embed(
                title="📊 XP Leaderboard",
                description="Top 10 users by XP",
                color=discord.Color.gold()
            )
            
            # No users case
            if not top_users:
                embed.description = "No users have earned XP yet!"
                return embed
            
            # Add fields for each user
            for i, (user_id, data) in enumerate(top_users, 1):
                try:
                    # Try to fetch user
                    user = await self.bot.fetch_user(int(user_id))
                    username = user.name
                except:
                    # Use placeholder if user not found
                    username = f"User {user_id}"
                
                level = data["level"]
                xp = data["xp"]
                
                embed.add_field(
                    name=f"{i}. {username}",
                    value=f"Level {level} ({xp} XP)",
                    inline=False
                )
            
            return embed
        
        else:  # coins
            # Get economy data
            economy_data = Database.load_data("data/economy.json")
            
            # Sort users by balance
            sorted_users = sorted(economy_data.items(), key=lambda x: x[1]["balance"], reverse=True)
            
            # Get top 10
            top_users = sorted_users[:10]
            
            # Get coin emoji
            coin_emoji = self.bot.get_cog("Economy").coin_emoji if self.bot.get_cog("Economy") else "🪙"
            
            # Create embed
            embed = create_embed(
                title="💰 Coin Leaderboard",
                description="Top 10 richest users",
                color=discord.Color.gold()
            )
            
            # No users case
            if not top_users:
                embed.description = "No users have earned coins yet!"
                return embed
            
            # Add fields for each user
            for i, (user_id, data) in enumerate(top_users, 1):
                try:
                    # Try to fetch user
                    user = await self.bot.fetch_user(int(user_id))
                    username = user.name
                except:
                    # Use placeholder if user not found
                    username = f"User {user_id}"
                
                balance = data["balance"]
                
                embed.add_field(
                    name=f"{i}. {username}",
                    value=f"{balance} {coin_emoji}",
                    inline=False
                )
            
            return embed


class Leveling(commands.Cog):
    """Leveling commands and listeners for XP system"""

    def __init__(self, bot):
        self.bot = bot
        self.xp_per_message = 15  # Base XP for each message
        self.xp_cooldown = 30  # Seconds between XP gains
        self.user_last_message = {}  # {user_id: timestamp}
    
    @commands.Cog.listener()
    async def on_message(self, message):
        """Listen for messages to award XP"""
        # Skip if message is from a bot or is a command
        if message.author.bot or message.content.startswith("!") or message.content.startswith("/"):
            return
        
        # Skip if in DMs
        if not message.guild:
            return
        
        # Skip if message is too short
        if len(message.content) < 5:
            return
        
        user_id = message.author.id
        current_time = time.time()
        
        # Check cooldown
        if user_id in self.user_last_message:
            time_since_last = current_time - self.user_last_message[user_id]
            if time_since_last < self.xp_cooldown:
                return
        
        # Get random XP amount (range around base value)
        xp_earned = random.randint(self.xp_per_message - 5, self.xp_per_message + 5)
        
        # Add bonus XP for longer messages
        message_length = len(message.content)
        if message_length > 50:
            xp_earned += int(message_length / 10)  # 1 XP per 10 characters over 50
        
        # Update user XP
        new_level = Database.update_user_xp(user_id, xp_earned, current_time)
        
        # Update last message time
        self.user_last_message[user_id] = current_time
        
        # If user leveled up, send a notification
        if new_level:
            # Get level data
            level_data = Database.get_user_level_data(user_id)
            
            # Send level up message
            level_up_embed = create_embed(
                title="🎉 Level Up!",
                description=f"Congratulations {message.author.mention}! You reached Level **{new_level}**!",
                color=discord.Color.green()
            )
            
            try:
                # Try to send DM first
                dm_sent = await send_dm(message.author, embed=level_up_embed)
                
                # If DM failed or is disabled, send in the channel
                if not dm_sent:
                    await message.channel.send(embed=level_up_embed)
            except:
                # If any error occurs, send in the channel
                await message.channel.send(embed=level_up_embed)
            
            # Award coins for leveling up (optional)
            coins_reward = new_level * 50  # Reward scales with level
            Database.update_user_balance(user_id, coins_reward, "add")
    
    @app_commands.command(name="rank", description="Check your or another user's rank")
    async def rank(self, interaction: discord.Interaction, user: Optional[discord.User] = None):
        """Display a user's rank and XP"""
        target_user = user or interaction.user
        
        # Get level data
        level_data = Database.get_user_level_data(target_user.id)
        current_level = level_data["level"]
        current_xp = level_data["xp"]
        
        # Calculate XP for next level
        xp_needed_for_current = calculate_xp_for_level(current_level)
        xp_needed_for_next = calculate_xp_for_level(current_level + 1)
        
        # Calculate progress to next level
        level_progress = current_xp - xp_needed_for_current
        level_total = xp_needed_for_next - xp_needed_for_current
        
        # Create progress bar
        progress_bar = create_progress_bar(level_progress, level_total)
        
        # Create embed
        embed = create_embed(
            title=f"{target_user.name}'s Rank",
            color=discord.Color.blue(),
            thumbnail=target_user.display_avatar.url
        )
        
        # Add level info
        embed.add_field(
            name=f"Level {current_level}",
            value=f"{progress_bar} {level_progress}/{level_total} XP",
            inline=False
        )
        
        # Add total XP
        embed.add_field(
            name="Total XP",
            value=current_xp,
            inline=True
        )
        
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="leaderboard", description="View XP leaderboard or coin leaderboard")
    async def leaderboard(self, interaction: discord.Interaction):
        """Display XP or coin leaderboard with toggle buttons"""
        # Acknowledge the command
        await interaction.response.defer()
        
        # Create view and get initial embed
        view = LeaderboardView(self.bot, "xp")
        embed = await view.get_leaderboard_embed("xp")
        
        # Send the message with the view
        await interaction.followup.send(embed=embed, view=view)
    
    @app_commands.command(name="setxp", description="Set XP for a user (Admin only)")
    @app_commands.default_permissions(administrator=True)
    async def setxp(self, interaction: discord.Interaction, user: discord.User, amount: int):
        """Set a user's XP (Admin only)"""
        # Check permissions
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
            return
        
        # Validate amount
        if amount < 0:
            await interaction.response.send_message("Amount must be non-negative.", ephemeral=True)
            return
        
        # Load level data
        level_data = Database.load_data("data/levels.json")
        user_id = str(user.id)
        
        # Create user entry if not exists
        if user_id not in level_data:
            level_data[user_id] = {"xp": 0, "level": 0, "last_message_time": 0}
        
        # Update XP
        level_data[user_id]["xp"] = amount
        
        # Calculate new level
        level_data[user_id]["level"] = int(amount / 100)  # Simple level calculation
        
        # Save data
        Database.save_data("data/levels.json", level_data)
        
        # Send confirmation
        await interaction.response.send_message(f"Set {user.mention}'s XP to {amount} (Level {level_data[user_id]['level']}).", ephemeral=True)
    
    @app_commands.command(name="resetxp", description="Reset XP for a user (Admin only)")
    @app_commands.default_permissions(administrator=True)
    async def resetxp(self, interaction: discord.Interaction, user: discord.User):
        """Reset a user's XP (Admin only)"""
        # Check permissions
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
            return
        
        # Load level data
        level_data = Database.load_data("data/levels.json")
        user_id = str(user.id)
        
        # Check if user exists
        if user_id not in level_data:
            await interaction.response.send_message(f"{user.mention} has no XP data.", ephemeral=True)
            return
        
        # Reset XP
        level_data[user_id] = {"xp": 0, "level": 0, "last_message_time": 0}
        
        # Save data
        Database.save_data("data/levels.json", level_data)
        
        # Send confirmation
        await interaction.response.send_message(f"Reset {user.mention}'s XP.", ephemeral=True)
    
    @app_commands.command(name="settings", description="Configure leveling settings (Admin only)")
    @app_commands.default_permissions(administrator=True)
    async def settings(self, interaction: discord.Interaction, xp_per_message: Optional[int] = None, xp_cooldown: Optional[int] = None):
        """Configure leveling settings (Admin only)"""
        # Check permissions
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
            return
        
        changes_made = False
        
        # Update XP per message if provided
        if xp_per_message is not None:
            if xp_per_message < 1:
                await interaction.response.send_message("XP per message must be at least 1.", ephemeral=True)
                return
            
            self.xp_per_message = xp_per_message
            changes_made = True
        
        # Update XP cooldown if provided
        if xp_cooldown is not None:
            if xp_cooldown < 10:
                await interaction.response.send_message("XP cooldown must be at least 10 seconds.", ephemeral=True)
                return
            
            self.xp_cooldown = xp_cooldown
            changes_made = True
        
        # Create embed with current settings
        embed = create_embed(
            title="Leveling Settings",
            color=discord.Color.blue()
        )
        
        embed.add_field(name="XP Per Message", value=f"{self.xp_per_message} (±5)", inline=True)
        embed.add_field(name="XP Cooldown", value=f"{self.xp_cooldown} seconds", inline=True)
        
        # Send response
        if changes_made:
            await interaction.response.send_message("Settings updated.", embed=embed, ephemeral=True)
        else:
            await interaction.response.send_message("Current settings:", embed=embed, ephemeral=True)


async def setup(bot):
    await bot.add_cog(Leveling(bot)) 