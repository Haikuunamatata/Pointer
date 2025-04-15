import discord
from discord import app_commands
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get bot token and guild ID from environment variables
TOKEN = os.getenv('DISCORD_TOKEN')
GUILD_ID = int(os.getenv('GUILD_ID'))

class DeleteCommandsBot(discord.Client):
    def __init__(self):
        super().__init__(intents=discord.Intents.default())
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self):
        # Sync commands with Discord
        await self.tree.sync()
        # Sync guild-specific commands
        await self.tree.sync(guild=discord.Object(id=GUILD_ID))

async def delete_commands():
    # Create bot instance
    bot = DeleteCommandsBot()

    try:
        # Start the bot
        await bot.start(TOKEN)
        
        # Delete all global commands
        await bot.tree.clear_commands(guild=None)
        print('Successfully deleted all global commands.')
        
        # Delete all guild-specific commands
        await bot.tree.clear_commands(guild=discord.Object(id=GUILD_ID))
        print('Successfully deleted all guild commands.')
        
    except Exception as e:
        print(f'An error occurred: {e}')
    finally:
        # Close the bot connection
        await bot.close()

# Run the deletion process
if __name__ == "__main__":
    import asyncio
    asyncio.run(delete_commands()) 