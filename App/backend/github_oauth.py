import os
import json
import requests
from typing import Optional, Dict
from fastapi import HTTPException

class GitHubOAuth:
    def __init__(self):
        # Get client ID from environment or use a default public one
        self.client_id = requests.get('https://pointerapi.f1shy312.com/github/client_id').json()['client_id']
        self.redirect_uri = 'http://localhost:23816/github/callback'
        # Server URL for token exchange
        self.server_url = os.getenv('OAUTH_SERVER_URL', 'https://pointerapi.f1shy312.com')
        
        # Check if server is available
        try:
            response = requests.get(f"{self.server_url}/health")
            if response.status_code != 200:
                print("Warning: OAuth server is not responding. GitHub OAuth will not work.")
                print("Please ensure the OAuth server is running.")
        except Exception as e:
            print(f"Warning: Could not connect to OAuth server: {str(e)}")
            print("Please ensure the OAuth server is running.")

    def get_authorization_url(self) -> str:
        """Generate GitHub OAuth authorization URL."""
        return f"https://github.com/login/oauth/authorize?client_id={self.client_id}&redirect_uri=http://localhost:23816/github/callback&scope=repo&state=pointer_oauth"

    async def get_access_token(self, code: str) -> Dict[str, str]:
        try:
            response = requests.post(
                f"{self.server_url}/exchange-token",
                json={"code": code},
                headers={'Accept': 'application/json'}
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to get access token")
                
            return response.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    def save_token(self, token: str) -> bool:
        """Save the access token to settings."""
        try:
            settings_dir = "C:/ProgramData/Pointer/data/settings"
            os.makedirs(settings_dir, exist_ok=True)
            
            token_path = os.path.join(settings_dir, "github_token.json")
            with open(token_path, 'w') as file:
                json.dump({"token": token}, file)
            return True
        except Exception as e:
            print(f"Error saving GitHub token: {str(e)}")
            return False

    def get_token(self) -> Optional[str]:
        """Get the saved access token."""
        try:
            token_path = os.path.join("C:/ProgramData/Pointer/data/settings", "github_token.json")
            if os.path.exists(token_path):
                with open(token_path, 'r') as file:
                    data = json.load(file)
                    return data.get('token')
            return None
        except Exception:
            return None

    def validate_token(self, token: str) -> bool:
        """Validate the access token with GitHub API."""
        try:
            response = requests.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"token {token}",
                    "Accept": "application/vnd.github.v3+json"
                }
            )
            return response.status_code == 200
        except Exception:
            return False 