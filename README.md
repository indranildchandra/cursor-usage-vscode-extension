# Cursor Usage

> Track your remaining Cursor fast-premium requests directly in your Cursor's status bar.

## What It Gives You

This extension displays your remaining Cursor fast-premium requests count in Cursor's status bar, updating automatically so you never get caught off-guard when you're about to hit your limit. Think of it as your personal AI usage speedometer.

- **Real-time tracking**: See your remaining requests at a glance (e.g., `⚡ 247/500`)
- **Smart color coding**: Visual warnings when you're running low
- **Click to refresh**: Quick manual refresh by clicking the status bar
- **Automatic updates**: Configurable polling to keep data fresh

## How It Works

The extension authenticates with Cursor's Dashboard API using your browser session cookie, fetches your team's usage data, and calculates your remaining fast-premium requests. It's essentially doing what you'd do manually by checking the Cursor dashboard, but automatically and without leaving your editor.

**Visual Status Indicators:**
- 🟢 **Normal**: Plenty of requests remaining
- 🟡 **Warning**: ≤10% remaining (yellow background) 
- 🔴 **Critical**: Maximum requests reached (red background)

*Coming soon: Usage-based spend tracking for when you exceed your included requests*

## Setup Requirements

### 1. Get Your Session Cookie

You'll need to extract your `WorkosCursorSessionToken` cookie from your browser:

1. Open [cursor.com](https://cursor.com) and log in
2. Open your browser's Developer Tools (F12)
3. Navigate to **Application** → **Cookies** → `https://cursor.com`
4. Find `WorkosCursorSessionToken` and copy its value
5. In VS Code, run command: `Cursor Usage Extension: Insert cookie value`
6. Paste the cookie value when prompted

### 2. Team ID (Optional)

If you belong to multiple Cursor teams, you may want to specify which team to track:

1. While logged into Cursor, open Developer Tools
2. Go to **Network** tab and refresh the dashboard
3. Find the `teams` API request and note your desired team's `id`
4. Set `cursorUsage.teamId` in VS Code settings

If you don't set a team ID, the extension will automatically use your first team.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `cursorUsage.pollMinutes` | `30` | How often to refresh the count (in minutes) |
| `cursorUsage.teamId` | `""` | Specific team ID to track (leave empty for auto-detection) |

## Commands

- **Insert cookie value**: Store your authentication cookie securely
- **Refresh remaining requests**: Manually update the request count

*Tip: Click the status bar item to quickly refresh your usage data*

## Security & Privacy

Your security is paramount, so here's exactly what happens with your data:

### Cookie Storage
- Your session cookie is stored using VS Code's **SecretStorage API** — the same secure mechanism used by official extensions
- The cookie never leaves your local machine except for direct API calls to Cursor
- It's encrypted and isolated from other extensions
- No logging or caching of sensitive data

### Data Usage
- **We don't store anything**: Your cookie and usage data never reach us
- **Direct communication**: Extension talks directly to `cursor.com/api/dashboard`
- **Minimal data**: Only fetches essential usage information
- **No tracking**: Zero analytics, telemetry, or data collection

### What Gets Sent
The extension only makes authenticated requests to these Cursor endpoints:
- `/api/dashboard/teams` - to get your team list
- `/api/dashboard/team` - to get your user ID
- `/api/dashboard/get-team-spend` - to get usage data

That's it. No third parties, no external services, no funny business.

## Installation

This extension is available on [Open VSX Registry](https://open-vsx.org/) (not VS Code Marketplace, since it's specifically for Cursor users):

1. Open Cursor
2. Go to Extensions panel
3. Search for "Cursor Usage"
4. Install and follow the setup steps above

## Contributing

We welcome contributions! Here's how to get started:

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/cursor-usage-vscode-extension.git
   cd cursor-usage-vscode-extension
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Start development**
   ```bash
   yarn watch
   ```

4. **Test your changes**
   - Press `F5` in VS Code to launch Extension Development Host
   - Test the extension functionality
   - Check the Debug Console for logs

### Building for Release

```bash
# Compile TypeScript
yarn compile

# Package for distribution
vsce package
```

## Troubleshooting

**Status bar shows "Set Cookie"**
- Your session cookie isn't set or has expired
- Re-run the "Insert cookie value" command

**Status bar shows "Team ID?"**
- Can't auto-detect your team (you might belong to multiple teams)
- Set `cursorUsage.teamId` in settings manually

**Status bar shows "Refresh Failed"**
- Network connectivity issue or Cursor API is down
- Cookie might have expired - try refreshing it

## License

MIT License - feel free to fork, modify, and improve!

---

*Made with ❤️ for the Cursor community. Because knowing your AI limits shouldn't require leaving your editor.*
