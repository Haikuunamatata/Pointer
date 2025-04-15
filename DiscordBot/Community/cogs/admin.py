import discord
from discord.ext import commands
from discord import app_commands
import asyncio
import os
import json
from typing import Optional, Literal

from utils.db import Database
from utils.helpers import create_embed, get_coin_emoji


class Admin(commands.Cog):
    """Admin commands for server management"""

    def __init__(self, bot):
        self.bot = bot
    
    async def cog_check(self, ctx):
        """Check if user has admin permissions"""
        return ctx.author.guild_permissions.administrator
    
    @app_commands.command(name="addcoins", description="Add coins to a user (Admin only)")
    @app_commands.default_permissions(administrator=True)
    async def addcoins(self, interaction: discord.Interaction, user: discord.User, amount: int):
        """Add coins to a user"""
        # Check permissions
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
            return
        
        # Validate amount
        if amount <= 0:
            await interaction.response.send_message("Amount must be positive.", ephemeral=True)
            return
        
        # Add coins to user
        new_balance = Database.update_user_balance(user.id, amount, "add")
        
        # Get coin emoji
        coin_emoji = get_coin_emoji()
        
        # Send response
        await interaction.response.send_message(
            f"Added {amount} {coin_emoji} to {user.mention}. New balance: {new_balance} {coin_emoji}",
            ephemeral=True
        )
    
    @app_commands.command(name="removecoins", description="Remove coins from a user (Admin only)")
    @app_commands.default_permissions(administrator=True)
    async def removecoins(self, interaction: discord.Interaction, user: discord.User, amount: int):
        """Remove coins from a user"""
        # Check permissions
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
            return
        
        # Validate amount
        if amount <= 0:
            await interaction.response.send_message("Amount must be positive.", ephemeral=True)
            return
        
        # Get current balance
        current_balance = Database.get_user_balance(user.id)
        
        # Check if user has enough coins
        if current_balance < amount:
            await interaction.response.send_message(
                f"{user.mention} only has {current_balance} coins. Cannot remove {amount}.",
                ephemeral=True
            )
            return
        
        # Remove coins from user
        new_balance = Database.update_user_balance(user.id, amount, "subtract")
        
        # Get coin emoji
        coin_emoji = get_coin_emoji()
        
        # Send response
        await interaction.response.send_message(
            f"Removed {amount} {coin_emoji} from {user.mention}. New balance: {new_balance} {coin_emoji}",
            ephemeral=True
        )
    
    @app_commands.command(name="resetcoins", description="Reset a user's coins (Admin only)")
    @app_commands.default_permissions(administrator=True)
    async def resetcoins(self, interaction: discord.Interaction, user: discord.User):
        """Reset a user's coins to 0"""
        # Check permissions
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("You don't have permission to use this command.", ephemeral=True)
            return
        
        # Reset coins
        Database.update_user_balance(user.id, 0, "set")
        
        # Get coin emoji
        coin_emoji = get_coin_emoji()
        
        # Send response
        await interaction.response.send_message(
            f"Reset {user.mention}'s balance to 0 {coin_emoji}",
            ephemeral=True
        )
    
    


async def setup(bot):
    await bot.add_cog(Admin(bot)) 