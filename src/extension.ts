import * as vscode from "vscode";
import * as api from "./api";
import * as statusBar from "./statusBar";
import * as config from "./configuration";
import { TeamMemberSpend } from "./models";

// Define an interface for Notification state object for type safety
interface NotificationState {
  date: string;
  attempts: number;
  sent: boolean;
}

const NOTIFICATION_STATE_KEY = "dailyNotificationState";
let refreshTimer: NodeJS.Timeout | undefined;

/**
 * Calculates the next reset date based on the start of month date.
 * @param startOfMonth ISO date string representing when the current cycle started
 * @returns Object containing reset date and days remaining
 */
function calculateResetInfo(startOfMonth: string): {
  resetDate: Date;
  daysRemaining: number;
  resetDateStr: string;
} {
  const startDate = new Date(startOfMonth);

  // Calculate next reset date by adding 1 month
  const resetDate = new Date(startDate);
  resetDate.setMonth(resetDate.getMonth() + 1);

  // Calculate days remaining
  const now = new Date();
  const timeDiff = resetDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

  // Format reset date as YYYY-MM-DD
  const resetDateStr = resetDate.toISOString().split("T")[0];

  return { resetDate, daysRemaining, resetDateStr };
}

/**
 * This is the main activation function for the extension.
 * It's called by VS Code when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext) {
  console.log("[Cursor Usage] Extension is now active.");

  statusBar.createStatusBarItem();

  // Register all commands and add them to subscriptions
  const insertCookieCommand = vscode.commands.registerCommand(
    "cursorUsage.insertCookie",
    () => insertCookie(context)
  );
  const refreshCommand = vscode.commands.registerCommand(
    "cursorUsage.refresh",
    () => refreshUsage(context)
  );
  const openSettingsCommand = vscode.commands.registerCommand(
    "cursorUsage.openSettings",
    openSettings
  );
  const forceRefreshCommand = vscode.commands.registerCommand(
    "cursorUsage.forceRefresh",
    () => forceRefresh(context)
  );
  const setTeamIdCommand = vscode.commands.registerCommand(
    "cursorUsage.setTeamId",
    setTeamId
  );
  const setPollMinutesCommand = vscode.commands.registerCommand(
    "cursorUsage.setPollMinutes",
    setPollMinutes
  );
  context.subscriptions.push(
    statusBar.getStatusBarItem(),
    insertCookieCommand,
    refreshCommand,
    openSettingsCommand,
    forceRefreshCommand,
    setTeamIdCommand,
    setPollMinutesCommand
  );

  // Initial refresh and setup the timer for periodic refreshes.
  refreshUsage(context);
  setupRefreshTimer(context);
  initializeNotificationService(context);

  // Listen for configuration changes to update the refresh timer interval.
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      let shouldRefresh = false;

      if (event.affectsConfiguration("cursorUsage.pollMinutes")) {
        setupRefreshTimer(context);
      }

      if (event.affectsConfiguration("cursorUsage.teamId")) {
        // Team ID changed, clear the cached one if it exists
        const teamId = config.getTeamIdFromSettings();
        if (teamId) {
          context.workspaceState.update("cursor.teamId", undefined);
        }
        shouldRefresh = true;
      }

      if (shouldRefresh) {
        refreshUsage(context);
      }
    }
  );
  context.subscriptions.push(configChangeListener);
}

/**
 * This function is called when the extension is deactivated.
 * It cleans up resources, like clearing the refresh timer.
 */
export function deactivate() {
  console.log("[Cursor Usage] Extension is now deactivated.");
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
}

function initializeNotificationService(context: vscode.ExtensionContext) {
  // 1. Run an immediate check on startup.
  checkAndSendNotification(context);

  // 2. Schedule the recurring check for 9 AM daily.
  const now = new Date();
  const nextNineAM = new Date();
  nextNineAM.setHours(9, 0, 0, 0);

  if (now > nextNineAM) {
    nextNineAM.setDate(nextNineAM.getDate() + 1);
  }

  const timeUntilNextNineAM = nextNineAM.getTime() - now.getTime();

  setTimeout(() => {
    checkAndSendNotification(context);

    setInterval(() => {
      checkAndSendNotification(context);
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, timeUntilNextNineAM);
}

export async function checkAndSendNotification(context: vscode.ExtensionContext) {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD format

  let state = context.globalState.get<NotificationState>(NOTIFICATION_STATE_KEY);

  // If it's a new day, reset the state
  if (!state || state.date !== todayStr) {
    state = { date: todayStr, attempts: 0, sent: false };
  }

  // --- GUARD CLAUSES ---
  // 1. Already sent today? Do nothing.
  if (state.sent) {
    return;
  }
  // 2. Reached attempt limit? Do nothing.
  if (state.attempts >= 3) {
    return;
  }
  // 3. Is it before 9 AM? Do nothing.
  if (now.getHours() < 9) {
    return;
  }

  // If all guards pass, proceed with delivery attempt
  state.attempts++;

  try {
    const usageStats = await getUsageStats(context);
    if (usageStats) {
      vscode.window.showInformationMessage(`Cursor Daily Usage: ${usageStats}`);

      // Mark as sent ONLY on success
      state.sent = true;
      console.log("Daily usage notification sent successfully.");
    } else {
      console.log(
        "Could not retrieve valid usage stats. Skipping notification."
      );
    }
  } catch (error) {
    console.error("Failed to send daily usage notification:", error);
  } finally {
    // ALWAYS update the state to save attempt count and sent status
    context.globalState.update(NOTIFICATION_STATE_KEY, state);
  }
}

export async function getUsageStats(
  context: vscode.ExtensionContext
): Promise<string | null> {
  await refreshUsage(context);
  const statusBarItem = statusBar.getStatusBarItem();

  // Don't show notification for loading, error, or initial setup states.
  if (
    statusBarItem.text.includes("Loading") ||
    statusBarItem.text.includes("Failed") ||
    statusBarItem.text.includes("Set Cookie") ||
    statusBarItem.text.includes("Team ID?")
  ) {
    return null;
  }

  return statusBarItem.text;
}

/**
 * Prompts the user to enter their cookie and stores it securely.
 * We use VS Code's SecretStorage, which is the most secure way to store
 * sensitive information like tokens or cookies in an extension.
 * The stored secret is local to the user's machine and not accessible
 * by other extensions unless they know the specific key.
 */
async function insertCookie(context: vscode.ExtensionContext): Promise<void> {
  try {
    const cookieValue = await vscode.window.showInputBox({
      prompt: "Enter your WorkosCursorSessionToken cookie value",
      placeHolder: "Paste cookie value here...",
      password: true,
      ignoreFocusOut: true,
    });

    if (cookieValue && cookieValue.trim()) {
      // Securely store the cookie.
      await context.secrets.store("cursor.cookie", cookieValue.trim());
      vscode.window.showInformationMessage("Cookie saved successfully!");
      await refreshUsage(context);
    } else {
      vscode.window.showWarningMessage("No cookie value provided.");
    }
  } catch (error: any) {
    console.error(`[Cursor Usage] Failed to save cookie: ${error.message}`);
    vscode.window.showErrorMessage(`Failed to save cookie: ${error.message}`);
  }
}

/**
 * Opens the VS Code settings UI focused on this extension's settings.
 */
function openSettings(): void {
  vscode.commands.executeCommand(
    "workbench.action.openSettings",
    "@ext:cursor-usage.cursor-usage"
  );
}

/**
 * The core logic for fetching usage data and updating the UI using individual user endpoints.
 */
async function refreshUsage(context: vscode.ExtensionContext): Promise<void> {
  console.log("[Cursor Usage] Attempting to refresh usage...");
  try {
    // The cookie is retrieved from secure storage right before it's used
    // and is never stored in a variable accessible outside this scope.
    const cookie = await context.secrets.get("cursor.cookie");
    if (!cookie) {
      statusBar.setStatusBarWarning("Set Cookie");
      vscode.window.showWarningMessage(
        'Cursor cookie not found. Use "Cursor Usage Extension: Insert cookie value" command to set it.'
      );
      return;
    }

    // Get user information for reset date
    const userMe = await api.fetchUserMe(cookie);
    console.log(`[Cursor Usage] Fetched user info for: ${userMe.email}`);

    // Get user usage data for reset date information
    const userUsage = await api.fetchUserUsage(userMe.sub, cookie);
    console.log(`[Cursor Usage] Fetched usage data for user: ${userMe.sub}`);

    // Two-tier approach: try team data first, fallback to individual data
    // This supports both team users and individual users without teams
    const teamId = await getTeamId(context, cookie);
    let mySpend: TeamMemberSpend | undefined;
    let maxRequests = userUsage["gpt-4"].maxRequestUsage || 500;

    // TEAM FLOW: Try to get team-based usage data if user has related team from api/sets a team ID manually
    // If we couldn't get team spend data, we'll show a simplified view with just the individual user data
    if (teamId) {
      try {
        const userDetails = await api.fetchTeamDetails(teamId, cookie);
        const spendData = await api.fetchTeamSpend(teamId, cookie);

        mySpend = spendData.teamMemberSpend.find(
          (member) => member.userId === userDetails.userId
        );
      } catch (teamError: any) {
        console.warn(
          `[Cursor Usage] Failed to fetch team data: ${teamError.message}`
        );
      }
    }

    // Determine usage data source and calculate values
    let usedRequests: number;
    let spendCents: number | undefined;
    let hardLimitDollars: number | undefined;

    if (!mySpend || typeof mySpend.fastPremiumRequests !== "number") {
      // INDIVIDUAL FLOW: Use individual user API data - works for solo users or when team API fails
      const gpt4Usage = userUsage["gpt-4"];
      usedRequests = gpt4Usage.numRequests;
      spendCents = undefined; // Individual users don't have spending data in team API
      hardLimitDollars = undefined;
    } else {
      // TEAM FLOW: Use team-based data when available
      usedRequests = mySpend.fastPremiumRequests;
      spendCents = mySpend.spendCents;
      hardLimitDollars = mySpend.hardLimitOverrideDollars;
    }

    // Calculate final values and update status bar
    const remainingRequests = Math.max(0, maxRequests - usedRequests);
    const resetInfo = calculateResetInfo(userUsage.startOfMonth);

    statusBar.updateStatusBar(
      remainingRequests,
      maxRequests,
      spendCents,
      hardLimitDollars,
      resetInfo
    );

    let logMessage = `[Cursor Usage] Successfully updated status bar. Remaining requests: ${remainingRequests}/${maxRequests}, Resets in ${resetInfo.daysRemaining} days`;
    if (spendCents !== undefined && hardLimitDollars !== undefined) {
      const spendDollars = (spendCents / 100).toFixed(2);
      logMessage += `, spend: $${spendDollars}/$${hardLimitDollars.toFixed(2)}`;
    }
    console.log(logMessage);
  } catch (error: any) {
    statusBar.setStatusBarError("Refresh Failed");
    console.error(
      `[Cursor Usage] Failed to refresh Cursor usage: ${error.message}`
    );
  }
}

/**
 * Determines the team ID to use, prioritizing user settings over auto-detection.
 * @param cookie The user's authentication cookie.
 * @returns The team ID number or undefined if not found.
 */
async function getTeamId(
  context: vscode.ExtensionContext,
  cookie: string
): Promise<number | undefined> {
  const teamIdFromSettings = config.getTeamIdFromSettings();
  if (teamIdFromSettings && teamIdFromSettings.toLowerCase() === "auto") {
    // If set to "auto", clear settings and proceed to auto-detect
    await vscode.workspace
      .getConfiguration("cursorUsage")
      .update("teamId", "", vscode.ConfigurationTarget.Global);
  } else if (teamIdFromSettings && !isNaN(parseInt(teamIdFromSettings, 10))) {
    const teamId = parseInt(teamIdFromSettings, 10);
    console.log(`[Cursor Usage] Using Team ID from settings: ${teamId}`);
    return teamId;
  }

  // Try to get from cache first
  const cachedTeamId = context.workspaceState.get<number>("cursor.teamId");
  if (cachedTeamId) {
    console.log(`[Cursor Usage] Using cached Team ID: ${cachedTeamId}`);
    return cachedTeamId;
  }

  console.log(
    "[Cursor Usage] Team ID not in settings or cache, attempting to fetch automatically."
  );
  try {
    const response = await api.fetchTeams(cookie);
    if (response && response.teams && response.teams.length > 0) {
      const teamId = response.teams[0].id;
      console.log(
        `[Cursor Usage] Automatically detected and cached Team ID: ${teamId}`
      );
      // Cache the detected team ID
      await context.workspaceState.update("cursor.teamId", teamId);
      return teamId;
    }
    console.warn("[Cursor Usage] No teams found for this user.");
    return undefined;
  } catch (error: any) {
    console.error(
      `[Cursor Usage] Failed to auto-detect Team ID: ${error.message}`
    );
    return undefined;
  }
}

/**
 * Sets up the automatic refresh timer based on the user's configuration.
 */
function setupRefreshTimer(context: vscode.ExtensionContext): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  const pollMinutes = config.getPollMinutes();
  const pollIntervalMs = pollMinutes * 60 * 1000;

  refreshTimer = setInterval(() => {
    refreshUsage(context);
  }, pollIntervalMs);

  console.log(`[Cursor Usage] Refresh timer set to ${pollMinutes} minutes.`);
}

/**
 * Resets the extension by clearing the cache, re-initializing the timer, and forcing a refresh.
 * @param context The extension context.
 */
async function forceRefresh(context: vscode.ExtensionContext) {
  console.log("[Cursor Usage] Forcing a full refresh...");
  // Clear cached data
  await context.workspaceState.update("cursor.teamId", undefined);
  console.log("[Cursor Usage] Cleared cached Team ID.");

  // Reset and setup timer
  setupRefreshTimer(context);

  // Refresh usage data
  await refreshUsage(context);
  vscode.window.showInformationMessage(
    "Cursor Usage extension has been re-initialized."
  );
}

/**
 * Shows an input box to let the user set their Team ID.
 */
async function setTeamId() {
  const teamId = await vscode.window.showInputBox({
    prompt:
      "(Optional) Your Cursor Team ID. Leave empty or set to 'auto' to auto-detect.",
    placeHolder: "Enter your Team ID or 'auto'",
    value: config.getTeamIdFromSettings() || "",
  });

  // Undefined means the user cancelled the input box
  if (teamId !== undefined) {
    await vscode.workspace
      .getConfiguration("cursorUsage")
      .update("teamId", teamId, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      `Cursor Team ID set to: ${teamId || "auto"}`
    );
  }
}

/**
 * Shows an input box to let the user set the poll interval.
 */
async function setPollMinutes() {
  const pollMinutes = await vscode.window.showInputBox({
    prompt: "How often to refresh the remaining requests count (in minutes)",
    placeHolder: "Enter a number in minutes",
    value: String(config.getPollMinutes()),
    validateInput: (text) => {
      const num = parseInt(text, 10);
      return isNaN(num) || num <= 0 ? "Please enter a positive number." : null;
    },
  });

  if (pollMinutes !== undefined) {
    await vscode.workspace
      .getConfiguration("cursorUsage")
      .update(
        "pollMinutes",
        parseInt(pollMinutes, 10),
        vscode.ConfigurationTarget.Global
      );
    vscode.window.showInformationMessage(
      `Cursor poll interval set to: ${pollMinutes} minutes.`
    );
  }
}
