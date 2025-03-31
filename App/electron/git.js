const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * Checks if a directory is a Git repository by running git status
 * This will work even if the .git folder is hidden
 */
async function isGitRepository(directory) {
  try {
    // Simple method: Try running git status in the directory
    const { stdout, stderr } = await execPromise('git rev-parse --is-inside-work-tree', {
      cwd: directory,
      windowsHide: true  // Prevent showing the command prompt window on Windows
    });
    
    return stdout.trim() === 'true';
  } catch (error) {
    // If the command fails, it's not a git repository
    return false;
  }
}

/**
 * Gets the git status of a repository
 */
async function getGitStatus(directory) {
  try {
    // Check if it's a git repository first
    const isRepo = await isGitRepository(directory);
    if (!isRepo) {
      return { isGitRepo: false, branch: '', changes: { staged: [], unstaged: [], untracked: [] } };
    }

    // Get current branch
    const { stdout: branchOutput } = await execPromise('git branch --show-current', {
      cwd: directory,
      windowsHide: true
    });
    const branch = branchOutput.trim();

    // Get staged changes
    const { stdout: stagedOutput } = await execPromise('git diff --name-only --cached', {
      cwd: directory,
      windowsHide: true
    });
    const staged = stagedOutput.trim() ? stagedOutput.trim().split('\n') : [];

    // Get unstaged changes
    const { stdout: unstagedOutput } = await execPromise('git diff --name-only', {
      cwd: directory,
      windowsHide: true
    });
    const unstaged = unstagedOutput.trim() ? unstagedOutput.trim().split('\n') : [];

    // Get untracked files
    const { stdout: untrackedOutput } = await execPromise('git ls-files --others --exclude-standard', {
      cwd: directory,
      windowsHide: true
    });
    const untracked = untrackedOutput.trim() ? untrackedOutput.trim().split('\n') : [];

    return {
      isGitRepo: true,
      branch,
      changes: {
        staged,
        unstaged,
        untracked
      }
    };
  } catch (error) {
    console.error('Error getting git status:', error);
    return { isGitRepo: false, branch: '', changes: { staged: [], unstaged: [], untracked: [] } };
  }
}

/**
 * Initializes a new Git repository
 */
async function initRepo(directory) {
  try {
    const { stdout, stderr } = await execPromise('git init', {
      cwd: directory,
      windowsHide: true
    });

    if (stderr && !stderr.includes('Initialized empty Git repository')) {
      return { success: false, data: '', error: stderr };
    }

    return { success: true, data: stdout };
  } catch (error) {
    return { success: false, data: '', error: error.message };
  }
}

// Export functions to be used in API endpoints
module.exports = {
  isGitRepository,
  getGitStatus,
  initRepo
}; 