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