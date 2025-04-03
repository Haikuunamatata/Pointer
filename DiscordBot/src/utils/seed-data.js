const { db, initializeDatabase } = require('./database');

// Function to seed initial data into the database
async function seedDatabase() {
  console.log('Seeding database with initial data...');
  
  try {
    // Initialize database schema
    initializeDatabase();
    
    // Seed fishing tools (rods)
    const fishingTools = [
      {
        name: 'Basic Rod',
        description: 'A simple wooden fishing rod for beginners.',
        durability: 100,
        price: 50,
        power: 10,
        image_url: null
      },
      {
        name: 'Apprentice Rod',
        description: 'A sturdy rod with improved fishing capabilities.',
        durability: 200,
        price: 250,
        power: 25,
        image_url: null
      },
      {
        name: 'Professional Rod',
        description: 'A high-quality rod used by professional fishermen.',
        durability: 350,
        price: 1000,
        power: 50,
        image_url: null
      },
      {
        name: 'Expert Rod',
        description: 'An expertly crafted rod for catching rare fish.',
        durability: 500,
        price: 5000,
        power: 75,
        image_url: null
      },
      {
        name: 'Master Rod',
        description: 'A legendary rod said to have caught mythical creatures.',
        durability: 1000,
        price: 25000,
        power: 100,
        image_url: null
      },
      {
        name: 'Infinity Rod',
        description: 'A rod forged with magical materials. It never breaks and can catch anything.',
        durability: 9999,
        price: 100000,
        power: 150,
        image_url: null
      }
    ];
    
    // Insert fishing tools
    for (const tool of fishingTools) {
      db.run(`
        INSERT OR IGNORE INTO fishing_tools 
        (name, description, durability, price, power, image_url) 
        VALUES (?, ?, ?, ?, ?, ?)
      `, [tool.name, tool.description, tool.durability, tool.price, tool.power, tool.image_url]);
    }
    
    // Seed fishing baits
    const fishingBaits = [
      {
        name: 'Worm',
        description: 'A common earthworm. Attracts most fish.',
        price: 5,
        power: 5,
        target_fish: null,
        image_url: null
      },
      {
        name: 'Cricket',
        description: 'A lively cricket. Good for surface fishing.',
        price: 10,
        power: 10,
        target_fish: null,
        image_url: null
      },
      {
        name: 'Minnow',
        description: 'A small live fish. Attracts predatory fish.',
        price: 25,
        power: 15,
        target_fish: null,
        image_url: null
      },
      {
        name: 'Spinner',
        description: 'A shiny metal lure that spins in the water.',
        price: 50,
        power: 20,
        target_fish: null,
        image_url: null
      },
      {
        name: 'Fly',
        description: 'An artificial fly for catching surface feeders.',
        price: 75,
        power: 25,
        target_fish: null,
        image_url: null
      },
      {
        name: 'Stink Bait',
        description: 'A smelly concoction that attracts bottom feeders.',
        price: 100,
        power: 30,
        target_fish: null,
        image_url: null
      },
      {
        name: 'Jig',
        description: 'A weighted lure that moves vertically in the water.',
        price: 150,
        power: 35,
        target_fish: null,
        image_url: null
      },
      {
        name: 'Spoon',
        description: 'A curved metal lure that reflects light underwater.',
        price: 200,
        power: 40,
        target_fish: null,
        image_url: null
      },
      {
        name: 'Crankbait',
        description: 'A hard plastic lure with a lip that dives underwater.',
        price: 300,
        power: 45,
        target_fish: null,
        image_url: null
      },
      {
        name: 'Magic Lure',
        description: 'A mysterious lure with enchanted properties.',
        price: 1000,
        power: 50,
        target_fish: null,
        image_url: null
      },
      {
        name: 'Golden Worm',
        description: 'A rare golden worm that attracts legendary fish.',
        price: 5000,
        power: 100,
        target_fish: null,
        image_url: null
      }
    ];
    
    // Insert fishing baits
    for (const bait of fishingBaits) {
      db.run(`
        INSERT OR IGNORE INTO fishing_baits 
        (name, description, price, power, target_fish, image_url) 
        VALUES (?, ?, ?, ?, ?, ?)
      `, [bait.name, bait.description, bait.price, bait.power, bait.target_fish, bait.image_url]);
    }
    
    // Seed fishing locations
    const fishingLocations = [
      {
        name: 'Beginner\'s Pond',
        description: 'A small, calm pond perfect for new fishers.',
        fish_types: '1,2,3,4,5',
        unlock_level: 1,
        is_seasonal: 0,
        season: null,
        image_url: null
      },
      {
        name: 'Forest River',
        description: 'A flowing river surrounded by dense forest.',
        fish_types: '5,6,7,8,9,10',
        unlock_level: 5,
        is_seasonal: 0,
        season: null,
        image_url: null
      },
      {
        name: 'Deep Lake',
        description: 'A vast lake with deep, mysterious waters.',
        fish_types: '11,12,13,14,15,16',
        unlock_level: 10,
        is_seasonal: 0,
        season: null,
        image_url: null
      },
      {
        name: 'Coastal Shore',
        description: 'The sandy shore of a vast ocean.',
        fish_types: '17,18,19,20,21',
        unlock_level: 15,
        is_seasonal: 0,
        season: null,
        image_url: null
      },
      {
        name: 'Open Ocean',
        description: 'The deep blue sea, home to the most challenging catches.',
        fish_types: '22,23,24,25,26,27',
        unlock_level: 20,
        is_seasonal: 0,
        season: null,
        image_url: null
      }
    ];
    
    // Insert fishing locations
    for (const location of fishingLocations) {
      db.run(`
        INSERT OR IGNORE INTO fishing_locations 
        (name, description, fish_types, unlock_level, is_seasonal, season, image_url) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [location.name, location.description, location.fish_types, location.unlock_level, 
          location.is_seasonal, location.season, location.image_url]);
    }
    
    // Seed a few sample fish
    const sampleFish = [
      {
        name: 'Minnow',
        description: 'A tiny silver fish, common in most freshwater environments.',
        rarity: 'Common',
        base_value: 5,
        min_size: 0.1,
        max_size: 0.3,
        is_variant: 0,
        variant_of: null,
        variant_name: null,
        image_url: null
      },
      {
        name: 'Goldfish',
        description: 'A small orange fish popular as pets.',
        rarity: 'Common',
        base_value: 10,
        min_size: 0.2,
        max_size: 0.5,
        is_variant: 0,
        variant_of: null,
        variant_name: null,
        image_url: null
      },
      {
        name: 'Sunfish',
        description: 'A flat, round fish with vibrant colors.',
        rarity: 'Common',
        base_value: 15,
        min_size: 0.3,
        max_size: 1.0,
        is_variant: 0,
        variant_of: null,
        variant_name: null,
        image_url: null
      },
      {
        name: 'Trout',
        description: 'A popular game fish found in clean, cold waters.',
        rarity: 'Uncommon',
        base_value: 30,
        min_size: 1.0,
        max_size: 5.0,
        is_variant: 0,
        variant_of: null,
        variant_name: null,
        image_url: null
      },
      {
        name: 'Bass',
        description: 'A strong, aggressive freshwater fish.',
        rarity: 'Uncommon',
        base_value: 45,
        min_size: 2.0,
        max_size: 8.0,
        is_variant: 0,
        variant_of: null,
        variant_name: null,
        image_url: null
      }
    ];
    
    // Insert sample fish
    for (const fish of sampleFish) {
      db.run(`
        INSERT OR IGNORE INTO fish 
        (name, description, rarity, base_value, min_size, max_size, is_variant, variant_of, variant_name, image_url) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [fish.name, fish.description, fish.rarity, fish.base_value, fish.min_size, fish.max_size,
          fish.is_variant, fish.variant_of, fish.variant_name, fish.image_url]);
    }
    
    // Add variant versions of the fish
    for (let i = 1; i <= 5; i++) {
      db.get(`SELECT * FROM fish WHERE id = ?`, [i], (err, fish) => {
        if (err || !fish) return;
        
        db.run(`
          INSERT OR IGNORE INTO fish 
          (name, description, rarity, base_value, min_size, max_size, is_variant, variant_of, variant_name, image_url) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          fish.name,
          `A rare, chromatic version of the ${fish.name.toLowerCase()}.`,
          fish.rarity === 'Common' ? 'Uncommon' : 
          fish.rarity === 'Uncommon' ? 'Rare' : 
          fish.rarity === 'Rare' ? 'Epic' : 'Legendary',
          fish.base_value * 3,
          fish.min_size,
          fish.max_size * 1.5,
          1,
          i,
          'Chroma',
          null
        ]);
      });
    }
    
    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

// Export the seeding function
module.exports = {
  seedDatabase
}; 