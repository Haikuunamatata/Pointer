const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.SQLITE_DB_PATH || path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
function initializeDatabase() {
  console.log('Initializing database...');
  
  // Users Table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      coins INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      last_daily TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Fishing Tables
  db.run(`
    CREATE TABLE IF NOT EXISTS fishing_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT,
      durability INTEGER,
      price INTEGER,
      power INTEGER,
      image_url TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fishing_baits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT,
      price INTEGER,
      power INTEGER,
      target_fish TEXT,
      image_url TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fish (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      rarity TEXT,
      base_value INTEGER,
      min_size REAL,
      max_size REAL,
      is_variant BOOLEAN DEFAULT 0,
      variant_of INTEGER,
      variant_name TEXT,
      image_url TEXT,
      FOREIGN KEY (variant_of) REFERENCES fish(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fishing_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT,
      fish_types TEXT,
      unlock_level INTEGER,
      is_seasonal BOOLEAN DEFAULT 0,
      season TEXT,
      image_url TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS npcs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT,
      location_id INTEGER,
      dialog TEXT,
      quest_giver BOOLEAN DEFAULT 0,
      vendor BOOLEAN DEFAULT 0,
      image_url TEXT,
      FOREIGN KEY (location_id) REFERENCES fishing_locations(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      item_type TEXT,
      item_id INTEGER,
      quantity INTEGER DEFAULT 1,
      equipped BOOLEAN DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_fish (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      fish_id INTEGER,
      size REAL,
      caught_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      location_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (fish_id) REFERENCES fish(id),
      FOREIGN KEY (location_id) REFERENCES fishing_locations(id)
    )
  `);

  // Economy Tables
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      category TEXT,
      price INTEGER,
      sellable BOOLEAN DEFAULT 1,
      tradeable BOOLEAN DEFAULT 1,
      image_url TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS item_skins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      item_id INTEGER,
      rarity TEXT,
      price INTEGER,
      image_url TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id TEXT,
      item_type TEXT,
      item_id INTEGER,
      quantity INTEGER DEFAULT 1,
      price INTEGER,
      listed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seller_id) REFERENCES users(id)
    )
  `);

  // Level Rewards Table
  db.run(`
    CREATE TABLE IF NOT EXISTS level_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level INTEGER UNIQUE,
      reward_type TEXT,
      reward_id INTEGER,
      reward_amount INTEGER,
      description TEXT,
      role_id TEXT,
      FOREIGN KEY (reward_id) REFERENCES items(id)
    )
  `);

  // Insert default level rewards
  db.run(`
    INSERT OR IGNORE INTO level_rewards (level, reward_type, reward_amount, description) VALUES
    (5, 'coins', 1000, '1000 coins'),
    (10, 'coins', 5000, '5000 coins'),
    (15, 'coins', 10000, '10000 coins'),
    (20, 'coins', 20000, '20000 coins'),
    (25, 'coins', 50000, '50000 coins'),
    (30, 'coins', 100000, '100000 coins'),
    (35, 'coins', 200000, '200000 coins'),
    (40, 'coins', 500000, '500000 coins'),
    (45, 'coins', 1000000, '1000000 coins'),
    (50, 'coins', 2000000, '2000000 coins')
  `);

  // Insert exclusive items
  db.run(`
    INSERT OR IGNORE INTO items (id, name, description, category, price, sellable, tradeable, image_url) VALUES
    (1001, 'Level 10 Badge', 'A special badge showing you reached level 10!', 'badge', 0, 0, 0, 'https://i.imgur.com/example1.png'),
    (1002, 'Level 25 Badge', 'A special badge showing you reached level 25!', 'badge', 0, 0, 0, 'https://i.imgur.com/example2.png'),
    (1003, 'Level 50 Badge', 'A special badge showing you reached level 50!', 'badge', 0, 0, 0, 'https://i.imgur.com/example3.png'),
    (1004, 'Golden Fishing Rod', 'A special fishing rod only available to level 30 players!', 'fishing_tool', 0, 0, 0, 'https://i.imgur.com/example4.png'),
    (1005, 'Diamond Fishing Rod', 'A legendary fishing rod only available to level 50 players!', 'fishing_tool', 0, 0, 0, 'https://i.imgur.com/example5.png'),
    (1006, 'Lucky Charm', 'Increases your chances of catching rare fish!', 'item', 0, 0, 0, 'https://i.imgur.com/example6.png'),
    (1007, 'XP Boost', 'Temporarily increases XP gained from messages!', 'item', 0, 0, 0, 'https://i.imgur.com/example7.png')
  `);

  // Update level rewards to include exclusive items
  db.run(`
    INSERT OR IGNORE INTO level_rewards (level, reward_type, reward_id, reward_amount, description) VALUES
    (10, 'item', 1001, 1, 'Level 10 Badge'),
    (25, 'item', 1002, 1, 'Level 25 Badge'),
    (30, 'item', 1004, 1, 'Golden Fishing Rod'),
    (50, 'item', 1003, 1, 'Level 50 Badge'),
    (50, 'item', 1005, 1, 'Diamond Fishing Rod')
  `);

  // Add special rewards for milestone levels
  db.run(`
    INSERT OR IGNORE INTO level_rewards (level, reward_type, reward_id, reward_amount, description) VALUES
    (20, 'item', 1006, 1, 'Lucky Charm'),
    (40, 'item', 1007, 5, '5x XP Boost')
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      name TEXT,
      species TEXT,
      level INTEGER DEFAULT 1,
      xp INTEGER DEFAULT 0,
      happiness INTEGER DEFAULT 100,
      health INTEGER DEFAULT 100,
      hunger INTEGER DEFAULT 100,
      last_fed TIMESTAMP,
      last_interaction TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS farms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      level INTEGER DEFAULT 1,
      plots INTEGER DEFAULT 4,
      last_harvested TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS farm_plots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farm_id INTEGER,
      crop_id INTEGER,
      planted_at TIMESTAMP,
      growth_stage INTEGER DEFAULT 0,
      ready_to_harvest BOOLEAN DEFAULT 0,
      FOREIGN KEY (farm_id) REFERENCES farms(id)
    )
  `);

  console.log('Database initialization complete.');
}

// Function to run a query with promise support
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Function to get results with promise support
function getResults(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Function to get a single result with promise support
function getSingleResult(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

module.exports = {
  db,
  initializeDatabase,
  runQuery,
  getResults,
  getSingleResult
}; 