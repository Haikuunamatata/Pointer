// Helper utility functions

/**
 * Formats a number with commas for thousands
 * @param {number} num - The number to format
 * @returns {string} - Formatted number
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Calculates the XP needed for the next level
 * @param {number} level - Current level
 * @returns {number} - XP needed for next level
 */
function xpForNextLevel(level) {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

/**
 * Generates a random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Random integer
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Calculates chance of success based on provided probability
 * @param {number} probability - Probability between 0 and 1
 * @returns {boolean} - Whether the action succeeded
 */
function chance(probability) {
  return Math.random() < probability;
}

/**
 * Returns a random element from an array
 * @param {Array} array - The array to pick from
 * @returns {*} - Random element from the array
 */
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Gets a weighted random item from an array of objects with weight property
 * @param {Array} items - Array of objects with weight property
 * @returns {*} - Randomly selected item based on weights
 */
function weightedRandom(items) {
  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  let random = Math.random() * totalWeight;
  
  for (const item of items) {
    random -= (item.weight || 1);
    if (random <= 0) return item;
  }
  
  return items[0]; // Fallback
}

/**
 * Shuffles an array in place
 * @param {Array} array - The array to shuffle
 * @returns {Array} - The shuffled array
 */
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

/**
 * Formats a date to a readable string
 * @param {Date} date - The date to format
 * @returns {string} - Formatted date string
 */
function formatDate(date) {
  return new Date(date).toLocaleString();
}

/**
 * Capitalizes the first letter of a string
 * @param {string} string - The string to capitalize
 * @returns {string} - Capitalized string
 */
function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Checks if a user can perform an action based on cooldown
 * @param {Date} lastActionTime - Time of the last action
 * @param {number} cooldownMinutes - Cooldown in minutes
 * @returns {Object} - { onCooldown: boolean, remainingTime: string }
 */
function checkCooldown(lastActionTime, cooldownMinutes) {
  if (!lastActionTime) return { onCooldown: false, remainingTime: null };
  
  const now = new Date();
  const lastAction = new Date(lastActionTime);
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const timePassed = now - lastAction;
  
  if (timePassed < cooldownMs) {
    const remaining = cooldownMs - timePassed;
    const minutes = Math.floor(remaining / (60 * 1000));
    const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
    return {
      onCooldown: true,
      remainingTime: `${minutes}m ${seconds}s`
    };
  }
  
  return { onCooldown: false, remainingTime: null };
}

module.exports = {
  formatNumber,
  xpForNextLevel,
  randomInt,
  chance,
  randomChoice,
  weightedRandom,
  shuffleArray,
  formatDate,
  capitalize,
  checkCooldown
}; 