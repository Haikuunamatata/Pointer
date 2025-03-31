const git = require('./git');

// Add these Git endpoints
// Endpoint to check if a directory is a Git repository
app.post('/git/is-repo', async (req, res) => {
  try {
    const { directory } = req.body;
    
    if (!directory) {
      return res.status(400).json({ success: false, error: 'Directory path is required' });
    }
    
    const isRepo = await git.isGitRepository(directory);
    res.json({ isGitRepo: isRepo });
  } catch (error) {
    console.error('Error checking if directory is a Git repository:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to get Git status
app.post('/git/status', async (req, res) => {
  try {
    const { directory } = req.body;
    
    if (!directory) {
      return res.status(400).json({ success: false, error: 'Directory path is required' });
    }
    
    const status = await git.getGitStatus(directory);
    res.json(status);
  } catch (error) {
    console.error('Error getting Git status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to initialize a Git repository
app.post('/git/init', async (req, res) => {
  try {
    const { directory } = req.body;
    
    if (!directory) {
      return res.status(400).json({ success: false, error: 'Directory path is required' });
    }
    
    const result = await git.initRepo(directory);
    res.json(result);
  } catch (error) {
    console.error('Error initializing Git repository:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}); 