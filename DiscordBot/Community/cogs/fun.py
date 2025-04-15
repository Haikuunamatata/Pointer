import discord
from discord.ext import commands
from discord import app_commands
import random
import asyncio
from typing import Optional

from utils.helpers import create_embed


class Fun(commands.Cog):
    """Fun commands for entertainment"""

    def __init__(self, bot):
        self.bot = bot
    
    @app_commands.command(name="8ball", description="Ask the magic 8-ball a question")
    async def magic_8ball(self, interaction: discord.Interaction, question: str):
        """Ask the magic 8-ball a question"""
        # List of possible responses
        responses = [
            # Positive responses
            "It is certain.",
            "It is decidedly so.",
            "Without a doubt.",
            "Yes – definitely.",
            "You may rely on it.",
            "As I see it, yes.",
            "Most likely.",
            "Outlook good.",
            "Yes.",
            "Signs point to yes.",
            
            # Neutral responses
            "Reply hazy, try again.",
            "Ask again later.",
            "Better not tell you now.",
            "Cannot predict now.",
            "Concentrate and ask again.",
            
            # Negative responses
            "Don't count on it.",
            "My reply is no.",
            "My sources say no.",
            "Outlook not so good.",
            "Very doubtful."
        ]
        
        # Choose a random response
        response = random.choice(responses)
        
        # Create an embed
        embed = create_embed(
            title="🎱 Magic 8-Ball",
            color=discord.Color.purple()
        )
        
        # Add question and answer fields
        embed.add_field(name="Question", value=question, inline=False)
        embed.add_field(name="Answer", value=response, inline=False)
        
        # Send the response
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="roll", description="Roll a random number")
    async def roll(self, interaction: discord.Interaction, maximum: Optional[int] = 100):
        """Roll a random number between 1 and the specified maximum"""
        # Validate maximum
        if maximum <= 0:
            await interaction.response.send_message("Maximum value must be positive.", ephemeral=True)
            return
        
        # Roll a random number
        result = random.randint(1, maximum)
        
        # Create an embed
        embed = create_embed(
            title="🎲 Roll",
            description=f"{interaction.user.mention} rolled a **{result}** (1-{maximum})",
            color=discord.Color.blue()
        )
        
        # Send the response
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="coinflip", description="Flip a coin")
    async def coinflip(self, interaction: discord.Interaction):
        """Flip a coin and get heads or tails"""
        # Flip a coin
        result = random.choice(["Heads", "Tails"])
        
        # Determine emoji
        emoji = "🪙" if result == "Heads" else "🪙"
        
        # Create an embed
        embed = create_embed(
            title=f"{emoji} Coin Flip",
            description=f"{interaction.user.mention} flipped a coin and got **{result}**!",
            color=discord.Color.gold()
        )
        
        # Send the response
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="userinfo", description="Get information about a user")
    async def userinfo(self, interaction: discord.Interaction, user: Optional[discord.User] = None):
        """Get information about a user"""
        # Get target user or self
        target_user = user or interaction.user
        
        # Try to get member object if in a guild
        member = None
        if interaction.guild:
            member = interaction.guild.get_member(target_user.id)
        
        # Create embed
        embed = create_embed(
            title=f"User Info - {target_user.name}",
            color=target_user.accent_color or discord.Color.blurple(),
            thumbnail=target_user.display_avatar.url
        )
        
        # Add basic user info
        embed.add_field(name="Username", value=target_user.name, inline=True)
        embed.add_field(name="User ID", value=target_user.id, inline=True)
        embed.add_field(name="Account Created", value=f"<t:{int(target_user.created_at.timestamp())}:R>", inline=True)
        
        # Add member info if available
        if member:
            # Join date
            embed.add_field(name="Joined Server", value=f"<t:{int(member.joined_at.timestamp())}:R>", inline=True)
            
            # Roles (top 10 sorted alphabetically)
            roles = sorted([role.name for role in member.roles if role.name != "@everyone"][:10])
            if roles:
                embed.add_field(name=f"Roles ({len(roles)})", value=", ".join(roles) or "None", inline=False)
            
            # Presence
            if member.activity:
                activity_type = str(member.activity.type).split(".")[1].title()
                activity_name = member.activity.name
                embed.add_field(name="Activity", value=f"{activity_type} {activity_name}", inline=True)
            
            # Status
            if member.status:
                embed.add_field(name="Status", value=str(member.status).title(), inline=True)
        
        # Send the response
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="avatar", description="Get a user's avatar and banner")
    async def avatar(self, interaction: discord.Interaction, user: Optional[discord.User] = None):
        """Get a user's avatar and banner"""
        # Get target user or self
        target_user = user or interaction.user
        
        # Create embed
        embed = create_embed(
            title=f"{target_user.name}'s Profile",
            color=discord.Color.blue()
        )
        
        # Add avatar
        embed.set_thumbnail(url=target_user.display_avatar.url)
        
        # Add avatar download link
        embed.add_field(
            name="Avatar",
            value=f"[Download]({target_user.display_avatar.url})",
            inline=True
        )
        
        # Try to get banner
        try:
            # Fetch user to get banner
            user = await self.bot.fetch_user(target_user.id)
            if user.banner:
                embed.set_image(url=user.banner.url)
                embed.add_field(
                    name="Banner",
                    value=f"[Download]({user.banner.url})",
                    inline=True
                )
            else:
                embed.add_field(
                    name="Banner",
                    value="No banner set",
                    inline=True
                )
        except:
            embed.add_field(
                name="Banner",
                value="Could not fetch banner",
                inline=True
            )
        
        # Send the response
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="banner", description="Get a user's banner")
    async def banner(self, interaction: discord.Interaction, user: Optional[discord.User] = None):
        """Get a user's banner (alias for /avatar)"""
        # Just call the avatar command
        await self.avatar(interaction, user)
    
    @app_commands.command(name="randomuser", description="Get a random user from the server")
    async def randomuser(self, interaction: discord.Interaction):
        """Get a random user from the server"""
        # Check if in a guild
        if not interaction.guild:
            await interaction.response.send_message("This command can only be used in a server.", ephemeral=True)
            return
        
        # Get a random member
        members = interaction.guild.members
        if not members:
            await interaction.response.send_message("No members found in this server.", ephemeral=True)
            return
        
        random_member = random.choice(members)
        
        # Create embed
        embed = create_embed(
            title="🎯 Random User",
            description=f"The random user is: {random_member.mention}",
            color=discord.Color.random()
        )
        
        # Add user avatar
        embed.set_thumbnail(url=random_member.display_avatar.url)
        
        # Send the response
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="joke", description="Get a random joke")
    async def joke(self, interaction: discord.Interaction):
        """Get a random joke"""
        # List of family-friendly jokes
        jokes = [
            "Why don't scientists trust atoms? Because they make up everything!",
            "Why did the scarecrow win an award? Because he was outstanding in his field!",
            "I told my wife she was drawing her eyebrows too high. She looked surprised.",
            "What do you call a fake noodle? An impasta!",
            "How do you organize a space party? You planet!",
            "Why don't eggs tell jokes? They'd crack each other up!",
            "I'm reading a book about anti-gravity. It's impossible to put down!",
            "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them!",
            "Why did the bicycle fall over? Because it was two tired!",
            "How does a penguin build its house? Igloos it together!",
            "What do you call a bear with no teeth? A gummy bear!",
            "Why did the tomato turn red? Because it saw the salad dressing!",
            "What's orange and sounds like a parrot? A carrot!",
            "How do you make a tissue dance? Put a little boogie in it!",
            "Why did the golfer bring two pairs of pants? In case he got a hole in one!",
            "What do you call a cow with no legs? Ground beef!"
        ]
        
        # Choose a random joke
        joke = random.choice(jokes)
        
        # Create embed
        embed = create_embed(
            title="😂 Random Joke",
            description=joke,
            color=discord.Color.brand_green()
        )
        
        # Send the response
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="rps", description="Play Rock, Paper, Scissors")
    @app_commands.describe(choice="Your choice: rock, paper, or scissors")
    @app_commands.choices(choice=[
        app_commands.Choice(name="Rock", value="rock"),
        app_commands.Choice(name="Paper", value="paper"),
        app_commands.Choice(name="Scissors", value="scissors")
    ])
    async def rock_paper_scissors(self, interaction: discord.Interaction, choice: str):
        """Play Rock, Paper, Scissors"""
        # Get the user's choice
        user_choice = choice.lower()
        
        # Bot makes a choice
        bot_choice = random.choice(["rock", "paper", "scissors"])
        
        # Determine emojis
        choice_emojis = {
            "rock": "🪨",
            "paper": "📄",
            "scissors": "✂️"
        }
        
        user_emoji = choice_emojis.get(user_choice, "❓")
        bot_emoji = choice_emojis.get(bot_choice, "❓")
        
        # Determine the winner
        result = ""
        if user_choice == bot_choice:
            result = "It's a tie!"
            color = discord.Color.yellow()
        elif (
            (user_choice == "rock" and bot_choice == "scissors") or
            (user_choice == "paper" and bot_choice == "rock") or
            (user_choice == "scissors" and bot_choice == "paper")
        ):
            result = "You win!"
            color = discord.Color.green()
        else:
            result = "I win!"
            color = discord.Color.red()
        
        # Create embed
        embed = create_embed(
            title="🎮 Rock, Paper, Scissors",
            description=(
                f"**Your choice:** {user_emoji} {user_choice.title()}\n"
                f"**My choice:** {bot_emoji} {bot_choice.title()}\n\n"
                f"**Result:** {result}"
            ),
            color=color
        )
        
        # Send the response
        await interaction.response.send_message(embed=embed)


async def setup(bot):
    await bot.add_cog(Fun(bot)) 