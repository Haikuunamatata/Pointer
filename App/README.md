## GitHub Integration Setup

To use GitHub features in Pointer, you'll need to set up your own GitHub OAuth App:

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the following details:
   - Application name: "Pointer"
   - Homepage URL: `http://localhost:23816`
   - Authorization callback URL: `http://localhost:23816/github/callback`
   - Description: "Pointer IDE GitHub Integration"
4. Click "Register application"
5. You'll get a Client ID and Client Secret
6. Create a `.env` file in the `backend` directory with:
   ```
   GITHUB_CLIENT_SECRET=your_client_secret_here
   ```
   Note: The Client ID is already configured in the application.

The application will use your OAuth credentials for GitHub integration. Make sure to keep your Client Secret secure and never commit it to version control.

## Running the OAuth Server

The GitHub OAuth integration requires a separate server to handle token exchange securely. The server is hosted at `https://pointerapi.f1shy312.com`.

For local development, you can run the server locally:

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Start the server:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 4999 --reload
   ```

The server will run on port 4999 by default. Make sure it's running before using GitHub features in Pointer.

Note: The production server is already set up and running at `https://pointerapi.f1shy312.com`. You only need to run the server locally if you're developing or testing the OAuth integration. 