# Cursor Usage

> Track your remaining Cursor fast-premium requests and usage-based spending directly in your Cursor's status bar with intelligent reset tracking and usage analytics.

## What It Gives You

This extension displays your remaining Cursor fast-premium requests count in Cursor's status bar, with usage-based spending information shown when you've exhausted your included requests. It now includes intelligent reset date tracking and daily usage analytics to help you better manage your AI usage. Think of it as your personal AI usage speedometer with financial tracking and predictive insights.

- **Real-time tracking**: See your remaining requests at a glance (e.g., `⚡ 247`)
- **Smart reset tracking**: Know exactly when your quota resets and how many days remain
- **Usage analytics**: Daily usage rate tracking and quota exhaustion predictions
- **Smart transitions**: When requests are exhausted, seamlessly shows spending vs limit (e.g., `$1.52/$150.00`)
- **Smart color coding**: Visual warnings when you're running low on requests or approaching spend limits
- **Enhanced tooltips**: Comprehensive breakdown with reset dates, usage patterns, and predictive warnings
- **Click to refresh**: Quick manual refresh by clicking the status bar
- **Automatic updates**: Configurable polling to keep data fresh
- **Command Palette Access**: All key actions are available via commands.

## How It Works

The extension authenticates with Cursor's API using your browser session cookie and uses a two-tier approach to provide usage insights:

**For Team Users:** Fetches both individual user data (for reset dates and limits) and team usage data (for actual usage counts and spending), then combines them for comprehensive insights.

**For Individual Users:** Uses your personal usage data directly from Cursor's individual user API, showing request counts and reset dates.

The extension gracefully falls back to individual data if team information is unavailable, ensuring it works for all users regardless of their Cursor setup.

**Visual Status Indicators:**

**When showing requests (remainingRequests > 0):**

- 🟢 **Normal**: Plenty of requests remaining (>10%)
- 🟡 **Warning**: Low on requests (≤10% remaining, yellow background)

**When showing spending (0 requests left):**

- 🟢 **Normal**: Spending well below limit (<80%)
- 🟡 **Warning**: Approaching spend limit (≥80%, yellow background)
- 🔴 **Critical**: Spend limit reached or exceeded (red background)

**Status Bar Display Logic:**

- `⚡ 247` - 247 fast-premium requests remaining (normal state)
- `⚠️ 15` - Warning: low requests remaining (≤10%)
- `⚡ $1.52/$150.00` - No requests left, normal spending (green)
- `⚠️ $120.50/$150.00` - No requests left, approaching limit (yellow)
- `❌ $150.00/$150.00` - No requests left, limit reached (red)

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

**For Individual Users:** If you don't belong to any Cursor teams, you can skip this step entirely. The extension will automatically use your individual usage data.

**For Team Users:** If you belong to multiple Cursor teams, you may want to specify which team to track. You can set this via the `Cursor Usage: Set Team ID` command or in your settings.

- To auto-detect, leave the value empty or enter `auto`. The extension will use the first team it finds and cache the ID.
- To specify a team, find its `id` in the `teams` API request in your browser's network tab and enter it.

If you don't set a team ID, the extension will automatically try to use your first team, or fall back to individual data if no teams are found.

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

## Detailed Tooltip Information

Hover over the status bar item to see comprehensive information:

**When you have requests remaining:**

```text
Resets in 23 days (2024-02-15) --> 8.7 requests/day avg

Fast Premium Requests: 247/500 remaining (50.6% used)
Spending: $1.52 of $150.00 limit (1.0% used)
Remaining budget: $148.48
```

**When requests are exhausted:**

```text
Resets in 23 days (2024-02-15) --> 21.7 requests/day avg

Fast Premium Requests: 0/500 remaining (100% used)
Spending: $1.52 of $150.00 limit (1.0% used)
Remaining budget: $148.48
⚠️ No requests remaining
```

**With predictive warnings:**

```text
Resets in 23 days (2024-02-15) --> 25.0 requests/day avg
⚠️ At current rate, quota exhausts in ~10 days

Fast Premium Requests: 250/500 remaining (50.0% used)
Spending: $0.00 of $150.00 limit (0.0% used)
Remaining budget: $150.00
```

**Key tooltip features:**

- **Reset countdown**: Shows exact reset date and days remaining
- **Usage analytics**: Daily average request consumption
- **Predictive warnings**: Alerts if you're likely to exhaust quota before reset
- **Dynamic limits**: Displays your actual plan limits (not hardcoded values)

Additional contextual warnings:

- `⚠️ Low on requests` (≤10% remaining)
- `⚠️ Approaching spend limit` (≥80% of budget used)
- `⚠️ No requests remaining`
- `⚠️ Spend limit reached!`
- `⚠️ At current rate, quota exhausts in ~X days`

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
- **Direct communication**: Extension talks directly to `cursor.com/api`
- **Minimal data**: Only fetches essential usage information
- **No tracking**: Zero analytics, telemetry, or data collection

### What Gets Sent

The extension only makes authenticated requests to these Cursor endpoints:

- `/api/auth/me` - to get your user information
- `/api/usage?user=USER_ID` - to get your individual usage data and reset dates
- `/api/dashboard/teams` - to get your team list
- `/api/dashboard/team` - to get your user ID within teams
- `/api/dashboard/get-team-spend` - to get team usage data

That's it. No third parties, no external services, no funny business.

## Installation

This extension is available on [Open VSX Registry](https://open-vsx.org/extension/yossisa/cursor-usage) (not VS Code Marketplace, since it's specifically for Cursor users).

1. Open Cursor
2. Go to Extensions panel
3. Search for "Cursor Usage"
4. Install and follow the setup steps above

## Contributing

We welcome contributions! For information on how to set up the development environment and run the test suite, please see our [Contributing Guide](CONTRIBUTING.md).

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

### Running Tests

To run the automated tests, use the following command:

```bash
# This will compile the extension and run the test suite
yarn test
```

The test runner will download and cache an instance of VS Code the first time it's run, then use the cached version for subsequent tests. It will then install the extension and execute the test suite.

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

### Status bar shows "Refresh Failed"

- There may be a network connectivity issue or the Cursor API is down.
- Your cookie might have expired; try re-inserting it.
- Run the `Cursor Usage: Force Re-initialize` command.

### Spending information not showing

- **Individual users:** Spending data is only available for team users. Individual users will see request counts and reset dates only.
- **Team users:** Spending data (`spendCents` and `hardLimitOverrideDollars`) may not be available for all teams. Ensure your team has usage-based billing configured.
- The extension gracefully falls back to showing request counts when spending data is unavailable.

## License

MIT License - feel free to fork, modify, and improve!

---

_Made with ❤️ for the Cursor community. Because knowing your AI limits shouldn't require leaving your editor._
