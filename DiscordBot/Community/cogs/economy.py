import discord
from discord.ext import commands
from discord import app_commands
import random
import asyncio
import os
import time
import datetime
from typing import Optional

from utils.db import Database
from utils.helpers import get_coin_emoji, create_embed, chance, random_amount, send_dm, create_progress_bar


class Economy(commands.Cog):
    """Economy commands for managing Pointer Coins"""

    def __init__(self, bot):
        self.bot = bot
        self.coin_emoji = get_coin_emoji()
        self.last_daily = {}  # {user_id: timestamp}
        self.last_work = {}   # {user_id: timestamp}
        self.last_beg = {}    # {user_id: timestamp}
        self.last_rob = {}    # {user_id: timestamp}
        
    async def get_profile_embed(self, user_id):
        """Get a user's profile embed"""
        # Get user object
        user = self.bot.get_user(int(user_id))
        if not user:
            try:
                user = await self.bot.fetch_user(int(user_id))
            except discord.NotFound:
                return create_embed("Profile Not Found", "User not found.", color=discord.Color.red())
        
        # Get user data
        balance = Database.get_user_balance(user_id)
        level_data = Database.get_user_level_data(user_id)
        level = level_data["level"]
        xp = level_data["xp"]
        next_level_xp = (level + 1) * 100
        current_level_xp = level * 100
        xp_progress = xp - current_level_xp
        xp_needed = next_level_xp - current_level_xp
        
        # Get job data
        job_data = Database.get_user_job(user_id)
        job_text = "Unemployed"
        if job_data:
            job_id = job_data["job_id"]
            for job in Database.get_all_jobs():
                if job["id"] == job_id:
                    job_text = f"{job['name']} (Pays {job['pay_rate']} {self.coin_emoji} every {job['pay_interval']} minutes)"
                    break
        
        # Create progress bar for XP
        progress_bar = create_progress_bar(xp_progress, xp_needed)
        
        # Create profile embed
        embed = create_embed(
            title=f"{user.name}'s Profile",
            color=discord.Color.blurple(),
            thumbnail=user.display_avatar.url
        )
        
        # Add balance field
        embed.add_field(
            name="Balance",
            value=f"{balance} {self.coin_emoji}",
            inline=False
        )
        
        # Add level field
        embed.add_field(
            name=f"Level {level}",
            value=f"{progress_bar} {xp_progress}/{xp_needed} XP",
            inline=False
        )
        
        # Add job field
        embed.add_field(
            name="Job",
            value=job_text,
            inline=False
        )
        
        return embed
    
    @app_commands.command(name="balance", description="Check your Pointer Coin balance or another user's balance")
    async def balance(self, interaction: discord.Interaction, user: Optional[discord.User] = None):
        """Check your balance or another user's balance"""
        target_user = user or interaction.user
        balance = Database.get_user_balance(target_user.id)
        
        if target_user == interaction.user:
            await interaction.response.send_message(f"Your balance: {balance} {self.coin_emoji}")
        else:
            await interaction.response.send_message(f"{target_user.name}'s balance: {balance} {self.coin_emoji}")
    
    @app_commands.command(name="pay", description="Pay Pointer Coins to another user")
    async def pay(self, interaction: discord.Interaction, user: discord.User, amount: int):
        """Pay another user"""
        # Check if amount is valid
        if amount <= 0:
            await interaction.response.send_message("Amount must be positive.", ephemeral=True)
            return
        
        # Check if user is trying to pay themselves
        if user.id == interaction.user.id:
            await interaction.response.send_message("You can't pay yourself.", ephemeral=True)
            return
        
        # Check if user has enough balance
        sender_balance = Database.get_user_balance(interaction.user.id)
        if sender_balance < amount:
            await interaction.response.send_message(f"You don't have enough Pointer Coins. Your balance: {sender_balance} {self.coin_emoji}", ephemeral=True)
            return
        
        # Perform the transaction
        Database.update_user_balance(interaction.user.id, amount, "subtract")
        Database.update_user_balance(user.id, amount, "add")
        
        # Send success message
        await interaction.response.send_message(f"You've sent {amount} {self.coin_emoji} to {user.mention}.")
        
        # Send DM to recipient
        embed = create_embed(
            title="Payment Received",
            description=f"You've received {amount} {self.coin_emoji} from {interaction.user.name}.",
            color=discord.Color.green()
        )
        await send_dm(user, embed=embed)
    
    @app_commands.command(name="daily", description="Claim your daily Pointer Coins")
    async def daily(self, interaction: discord.Interaction):
        """Claim daily coins"""
        user_id = interaction.user.id
        current_time = time.time()
        
        # Check if user has already claimed daily reward
        if user_id in self.last_daily:
            last_claim_time = self.last_daily[user_id]
            time_since_last_claim = current_time - last_claim_time
            
            # Check if 24 hours have passed
            if time_since_last_claim < 86400:  # 24 hours in seconds
                time_remaining = 86400 - time_since_last_claim
                hours = int(time_remaining // 3600)
                minutes = int((time_remaining % 3600) // 60)
                
                await interaction.response.send_message(
                    f"You've already claimed your daily reward. Try again in {hours}h {minutes}m.",
                    ephemeral=True
                )
                return
        
        # Give daily reward
        amount = 250  # Daily reward amount
        Database.update_user_balance(user_id, amount, "add")
        self.last_daily[user_id] = current_time
        
        # Calculate streak (this would be more complex in a real implementation)
        # For now, just use a simple message
        streak_text = "Come back tomorrow for another reward!"
        
        # Send success message
        await interaction.response.send_message(
            f"You've claimed your daily reward of {amount} {self.coin_emoji}!\n{streak_text}"
        )
    
    @app_commands.command(name="work", description="Work to earn Pointer Coins")
    async def work(self, interaction: discord.Interaction):
        """Work for coins"""
        user_id = interaction.user.id
        current_time = time.time()
        
        # Check cooldown
        if user_id in self.last_work:
            last_work_time = self.last_work[user_id]
            time_since_last_work = current_time - last_work_time
            
            # Check if 30 minutes have passed
            if time_since_last_work < 1800:  # 30 minutes in seconds
                time_remaining = 1800 - time_since_last_work
                minutes = int(time_remaining // 60)
                seconds = int(time_remaining % 60)
                
                await interaction.response.send_message(
                    f"You need to rest before working again. Try again in {minutes}m {seconds}s.",
                    ephemeral=True
                )
                return
        
        # Generate a random amount
        amount = random_amount(50, 150)
        
        # Add coins
        Database.update_user_balance(user_id, amount, "add")
        self.last_work[user_id] = current_time
        
        # Generate a random work message
        work_messages = [
            f"You've worked as a programmer and earned {amount} {self.coin_emoji}",
            f"You've fixed some bugs and earned {amount} {self.coin_emoji}",
            f"You've helped a customer and earned {amount} {self.coin_emoji}",
            f"You've created a design and earned {amount} {self.coin_emoji}",
            f"You've written documentation and earned {amount} {self.coin_emoji}",
            f"You've optimized some code and earned {amount} {self.coin_emoji}",
            f"You've resolved a merge conflict and earned {amount} {self.coin_emoji}",
            f"You've deployed a new feature and earned {amount} {self.coin_emoji}",
            f"You've tested an application and earned {amount} {self.coin_emoji}",
            f"You've reviewed a pull request and earned {amount} {self.coin_emoji}"
        ]
        
        message = random.choice(work_messages)
        
        # Send success message
        await interaction.response.send_message(message)
    
    @app_commands.command(name="beg", description="Beg for Pointer Coins")
    async def beg(self, interaction: discord.Interaction):
        """Beg for coins"""
        user_id = interaction.user.id
        current_time = time.time()
        
        # Check cooldown
        if user_id in self.last_beg:
            last_beg_time = self.last_beg[user_id]
            time_since_last_beg = current_time - last_beg_time
            
            # Check if 5 minutes have passed
            if time_since_last_beg < 300:  # 5 minutes in seconds
                time_remaining = 300 - time_since_last_beg
                minutes = int(time_remaining // 60)
                seconds = int(time_remaining % 60)
                
                await interaction.response.send_message(
                    f"You've begged too recently. Try again in {minutes}m {seconds}s.",
                    ephemeral=True
                )
                return
        
        # 75% chance of success
        if chance(75):
            # Generate a random amount
            amount = random_amount(10, 50)
            
            # Add coins
            Database.update_user_balance(user_id, amount, "add")
            
            success_messages = [
                f"Someone felt generous and gave you {amount} {self.coin_emoji}",
                f"A stranger took pity on you and gave you {amount} {self.coin_emoji}",
                f"You found {amount} {self.coin_emoji} on the ground",
                f"A rich developer donated {amount} {self.coin_emoji} to your cause",
                f"Your sad face earned you {amount} {self.coin_emoji}"
            ]
            
            message = random.choice(success_messages)
        else:
            fail_messages = [
                "Everyone ignored you. You got nothing.",
                "No one wanted to give you coins today.",
                "Try again later, maybe someone will be more generous.",
                "Your begging technique needs work. You got nothing.",
                "People gave you advice instead of coins. How useful..."
            ]
            
            message = random.choice(fail_messages)
        
        # Update cooldown
        self.last_beg[user_id] = current_time
        
        # Send message
        await interaction.response.send_message(message)
    
    @app_commands.command(name="rob", description="Attempt to rob Pointer Coins from another user")
    async def rob(self, interaction: discord.Interaction, user: discord.User):
        """Rob another user"""
        robber_id = interaction.user.id
        victim_id = user.id
        current_time = time.time()
        
        # Check if user is trying to rob themselves
        if victim_id == robber_id:
            await interaction.response.send_message("You can't rob yourself.", ephemeral=True)
            return
        
        # Check if bot is being robbed
        if victim_id == self.bot.user.id:
            await interaction.response.send_message("You can't rob the bot.", ephemeral=True)
            return
        
        # Check cooldown
        if robber_id in self.last_rob:
            last_rob_time = self.last_rob[robber_id]
            time_since_last_rob = current_time - last_rob_time
            
            # Check if 1 hour has passed
            if time_since_last_rob < 3600:  # 1 hour in seconds
                time_remaining = 3600 - time_since_last_rob
                minutes = int(time_remaining // 60)
                
                await interaction.response.send_message(
                    f"You're on the police's radar. Try again in {minutes} minutes.",
                    ephemeral=True
                )
                return
        
        # Get balances
        victim_balance = Database.get_user_balance(victim_id)
        robber_balance = Database.get_user_balance(robber_id)
        
        # Check if victim has enough coins to be robbed
        if victim_balance < 50:
            await interaction.response.send_message(
                f"{user.name} doesn't have enough coins to be worth robbing.",
                ephemeral=True
            )
            return
        
        # Check if robber has enough coins as collateral for potential fine
        if robber_balance < 50:
            await interaction.response.send_message(
                "You need at least 50 coins to attempt a robbery (potential fine).",
                ephemeral=True
            )
            return
        
        # Update cooldown
        self.last_rob[robber_id] = current_time
        
        # 35% chance of success
        if chance(35):
            # Calculate amount to steal (10-20% of victim's balance)
            steal_percentage = random.uniform(0.1, 0.2)
            amount = int(victim_balance * steal_percentage)
            amount = max(10, min(amount, 500))  # Between 10 and 500 coins
            
            # Update balances
            Database.update_user_balance(victim_id, amount, "subtract")
            Database.update_user_balance(robber_id, amount, "add")
            
            # Send success message
            await interaction.response.send_message(
                f"You successfully robbed {user.name} and got away with {amount} {self.coin_emoji}!"
            )
            
            # Send DM to victim
            embed = create_embed(
                title="You've Been Robbed!",
                description=f"{interaction.user.name} robbed you and stole {amount} {self.coin_emoji}!",
                color=discord.Color.red()
            )
            await send_dm(user, embed=embed)
        else:
            # Calculate fine (10-25% of robber's balance)
            fine_percentage = random.uniform(0.1, 0.25)
            fine = int(robber_balance * fine_percentage)
            fine = max(10, min(fine, 300))  # Between 10 and 300 coins
            
            # Update robber's balance
            Database.update_user_balance(robber_id, fine, "subtract")
            
            # Send failure message
            await interaction.response.send_message(
                f"You were caught attempting to rob {user.name} and had to pay a fine of {fine} {self.coin_emoji}!"
            )
    
    @app_commands.command(name="slots", description="Play the slot machine with Pointer Coins")
    async def slots(self, interaction: discord.Interaction, amount: int):
        """Play the slot machine"""
        user_id = interaction.user.id
        
        # Check if amount is valid
        if amount <= 0:
            await interaction.response.send_message("Bet amount must be positive.", ephemeral=True)
            return
        
        # Check if user has enough balance
        balance = Database.get_user_balance(user_id)
        if balance < amount:
            await interaction.response.send_message(
                f"You don't have enough coins. Your balance: {balance} {self.coin_emoji}",
                ephemeral=True
            )
            return
        
        # Deduct bet amount
        Database.update_user_balance(user_id, amount, "subtract")
        
        # Slot machine symbols
        symbols = ["🍎", "🍊", "🍋", "🍒", "🍇", "7️⃣", "💰", "💎"]
        weights = [20, 20, 20, 15, 10, 8, 5, 2]  # Higher weight = more common
        
        # Spin the slots
        result = random.choices(symbols, weights=weights, k=3)
        
        # Calculate winnings
        winnings = 0
        result_message = ""
        
        # Check for wins
        if result[0] == result[1] == result[2]:
            # All three match - big win
            if result[0] == "💎":
                # Jackpot
                winnings = amount * 10
                result_message = "🎉 JACKPOT! 🎉"
            elif result[0] == "💰":
                winnings = amount * 7
                result_message = "🎉 Big Win! 🎉"
            elif result[0] == "7️⃣":
                winnings = amount * 5
                result_message = "🎉 Lucky Sevens! 🎉"
            else:
                winnings = amount * 3
                result_message = "🎉 Triple Match! 🎉"
        elif result[0] == result[1] or result[1] == result[2] or result[0] == result[2]:
            # Two match - small win
            winnings = amount * 1.5
            result_message = "🎉 Double Match! 🎉"
        else:
            # No match - loss
            result_message = "❌ No Match. Try again! ❌"
        
        # Round winnings to int
        winnings = int(winnings)
        
        # Add winnings if any
        if winnings > 0:
            Database.update_user_balance(user_id, winnings, "add")
        
        # Calculate net change
        net_change = winnings - amount
        net_text = f"(+{net_change} {self.coin_emoji})" if net_change > 0 else f"({net_change} {self.coin_emoji})"
        
        # Create and send embed
        embed = create_embed(
            title="🎰 Slot Machine 🎰",
            description=f"[ {result[0]} | {result[1]} | {result[2]} ]\n\n{result_message}",
            color=discord.Color.gold()
        )
        
        embed.add_field(name="Bet", value=f"{amount} {self.coin_emoji}", inline=True)
        embed.add_field(name="Winnings", value=f"{winnings} {self.coin_emoji}", inline=True)
        embed.add_field(name="Net Change", value=net_text, inline=True)
        
        new_balance = Database.get_user_balance(user_id)
        embed.set_footer(text=f"Your new balance: {new_balance} {self.coin_emoji}")
        
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="gamble", description="Gamble your Pointer Coins (50/50 chance to double)")
    async def gamble(self, interaction: discord.Interaction, amount: int):
        """Gamble coins"""
        # Check if amount is valid
        if amount <= 0:
            await interaction.response.send_message("Amount must be positive.", ephemeral=True)
            return
        
        # Check if user has enough balance
        balance = Database.get_user_balance(interaction.user.id)
        if balance < amount:
            await interaction.response.send_message(f"You don't have enough Pointer Coins. Your balance: {balance} {self.coin_emoji}", ephemeral=True)
            return
        
        # 50/50 chance to win
        if random.random() < 0.5:
            # Win
            Database.update_user_balance(interaction.user.id, amount, "add")
            await interaction.response.send_message(f"🎉 You won {amount} {self.coin_emoji}! Your new balance: {balance + amount} {self.coin_emoji}")
        else:
            # Lose
            Database.update_user_balance(interaction.user.id, amount, "subtract")
            await interaction.response.send_message(f"💔 You lost {amount} {self.coin_emoji}. Your new balance: {balance - amount} {self.coin_emoji}")
    
    @app_commands.command(name="profile", description="View your or another user's profile")
    async def profile(self, interaction: discord.Interaction, user: Optional[discord.User] = None):
        """View a user's profile"""
        target_user = user or interaction.user
        embed = await self.get_profile_embed(target_user.id)
        await interaction.response.send_message(embed=embed)


async def setup(bot):
    await bot.add_cog(Economy(bot)) 