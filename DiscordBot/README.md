# Pointer Community Discord Bot

A feature-rich Discord bot for the Pointer community with extensive fishing and economy systems.

## Features

### Fishing Section

- 6 tools (fishing rods) to equip
- 11 different baits
- 42 fish species, all with variant/chroma versions
- 6 NPCs with backstories, quests, and unique personalities
- 5 distinct fishing locations, with seasonal special locations
- Idle fishing functionality
- Skills and skill challenges
- Collection book to track catches
- Leaderboards with daily resets

### Economy Section

- Global user-to-user marketplace
- Virtual pets system (level, breed, care for, and battle with pets)
- 265+ unique items
- 100+ unique skins
- Gambling games (blackjack, slots, and more)
- Farming system (care for crops and sell for profit)
- Adventures with evolving storylines and rewards
- Server event management tools

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- A Discord bot token and application ID

## Setup

1. Clone the repository:
```
git clone <repository-url>
cd DiscordBot
```

2. Install dependencies:
```
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```
DISCORD_TOKEN=your_discord_bot_token
DISCORD_APP_ID=your_discord_application_id
SQLITE_DB_PATH=./src/data/database.sqlite
```

4. Deploy slash commands to Discord:
```
node src/deploy-commands.js
```

5. Start the bot:
```
npm start
```

## Available Commands

### General Commands
- `/help` - Shows information about available commands
- `/profile` - View your profile or another user's profile

### Fishing Commands
- `/fish` - Go fishing to catch fish
- `/locations` - View available fishing locations
- `/collection` - View your fish collection
- `/equip` - Equip fishing tools and bait

### Economy Commands
- `/shop` - Browse and purchase items from the shop
- `/inventory` - View your inventory
- `/balance` - Check your coin balance
- `/market` - Access the global marketplace
- `/farm` - Manage your farm
- `/pet` - Interact with your virtual pets

## Database Structure

The bot uses SQLite to store all data locally. The database includes tables for:

- Users
- Fishing tools, baits, fish, and locations
- Economy items, marketplace listings, and pets
- User inventories and collections

## Contributing

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Commit your changes (`git commit -am 'Add new feature'`)
5. Push to the branch (`git push origin feature/your-feature`)
6. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Discord.js for the Discord API wrapper
- SQLite for the database
- Pointer community members for suggestions and feedback 