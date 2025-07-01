# Cursor Usage

> Track your remaining Cursor fast-premium requests directly in your Cursor's status bar.

## What It Gives You

This extension displays your remaining Cursor fast-premium requests count in Cursor's status bar, updating automatically so you never get caught off-guard when you're about to hit your limit. Think of it as your personal AI usage speedometer.

- **Real-time tracking**: See your remaining requests at a glance (e.g., `⚡ 247`)
- **Smart color coding**: Visual warnings when you're running low
- **Click to refresh**: Quick manual refresh by clicking the status bar
- **Automatic updates**: Configurable polling to keep data fresh
- **Command Palette Access**: All key actions are available via commands.

## How It Works

The extension authenticates with Cursor's Dashboard API using your browser session cookie, fetches your team's usage data, and calculates your remaining fast-premium requests. It's essentially doing what you'd do manually by checking the Cursor dashboard, but automatically and without leaving your editor.

**Visual Status Indicators:**

- 🟢 **Normal**: Plenty of requests remaining
- 🟡 **Warning**: ≤10% remaining (yellow background)
- 🔴 **Critical**: Maximum requests reached (red background)
  _Coming soon: Usage-based spend tracking for when you exceed your included requests_

## Setup Requirements

### 1. Get Your Session Cookie

You'll need to extract your `WorkosCursorSessionToken` cookie from your browser:

1. Open [cursor.com](https://cursor.com) and log in
2. Open your browser's Developer Tools (F12)
3. Navigate to **Application** → **Cookies** → `https://cursor.com`
4. Find `WorkosCursorSessionToken` and copy its value
5. In VS Code, run command: `Cursor Usage: Insert cookie value`
6. Paste the cookie value when prompted

### 2. Team ID (Optional)

If you belong to multiple Cursor teams, you may want to specify which team to track. You can set this via the `Cursor Usage: Set Team ID` command or in your settings.

- To auto-detect, leave the value empty or enter `auto`. The extension will use the first team it finds and cache the ID.
- To specify a team, find its `id` in the `teams` API request in your browser's network tab and enter it.

If you don't set a team ID, the extension will automatically use your first team.

## Configuration

| Setting                   | Default | Description                                                                 |
| ------------------------- | ------- | --------------------------------------------------------------------------- |
| `cursorUsage.pollMinutes` | `30`    | How often to refresh the count (in minutes).                                |
| `cursorUsage.teamId`      | `""`    | Specific team ID to track. Leave empty or set to `auto` for auto-detection. |

## Commands

All commands are available from the Command Palette (`Cmd+Shift+P`).

| Command               | Description                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `Refresh Usage`       | Manually refreshes the usage data.                                                                       |
| `Insert cookie value` | Prompts you to paste and store your session cookie.                                                      |
| `Set Team ID`         | Opens an input to set your Team ID.                                                                      |
| `Set Poll Interval`   | Opens an input to configure the refresh interval.                                                        |
| `Force Re-initialize` | Resets the extension, clears the cache, and forces a full data refresh. Useful if something seems stuck. |
| `Open Settings`       | Opens the extension's settings UI.                                                                       |

_Tip: Click the status bar item to quickly refresh your usage data._

## Security & Privacy

Your security is paramount, so here's exactly what happens with your data:

### Why We Need Your Cookie

A fair question! Currently, Cursor's API only provides API tokens to users with "Admin" roles. This means that if you're a "Team Member," there's no official way to programmatically check your usage stats.

This extension bridges that gap by using the same session cookie your browser uses to talk to the Cursor dashboard. It's the only way to get you the usage data you need, right in your editor. We keep our fingers crossed that a more direct API will be available for everyone in the future!

### Cookie Storage

- Your session cookie is stored using VS Code's **SecretStorage API** — the same secure mechanism used by official extensions
- The cookie never leaves your local machine except for direct API calls to Cursor
- It's encrypted and isolated from other extensions
- No logging or caching of sensitive data

Don't just take our word for it, though. This extension is fully open-source. Feel free to grab your magnifying glass, put on your detective hat, and inspect the code yourself :)

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

This project uses Node.js v20. If you use `nvm`, you can run `nvm use` to automatically switch to the correct version.

1. **Clone the repository**

   ```bash
   git clone https://github.com/YossiSaadi/cursor-usage-vscode-extension.git
   cd cursor-usage-vscode-extension
   ```

2. **Install dependencies**

   ```bash
   yarn install
   ```

3. **Start the watcher**

   ```bash
   yarn watch
   ```

4. **Launch the debugger**
   - Press `F5` in VS Code to open the **Extension Development Host**.
   - This will run the extension in a new VS Code window, where you can test its functionality.
   - Check the **Debug Console** in your original editor window for logs.

### Building for Release

```bash
# Compile TypeScript
yarn compile

# Package for distribution
vsce package
```

## Troubleshooting

### Status bar shows "Set Cookie"

- Your session cookie isn't set or has expired.
- Re-run the `Cursor Usage: Insert cookie value` command.

### Status bar shows "Team ID?"

- The extension can't auto-detect your team, or the cached ID is invalid.
- Run the `Cursor Usage: Set Team ID` command to set it manually.
- If issues persist, try running `Cursor Usage: Force Re-initialize`.

### Status bar shows "Refresh Failed"

- There may be a network connectivity issue or the Cursor API is down.
- Your cookie might have expired; try re-inserting it.
- Run the `Cursor Usage: Force Re-initialize` command.

## License

MIT License - feel free to fork, modify, and improve!

---

_Made with ❤️ for the Cursor community. Because knowing your AI limits shouldn't require leaving your editor._
