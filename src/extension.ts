import * as vscode from "vscode";
import * as crypto from "crypto";
import * as api from "./api";
import * as statusBar from "./statusBar";
import * as config from "./configuration";
import {
  TeamMemberSpend,
  UserUsageResponse,
  UserMeResponse,
  TeamsResponse,
  TeamDetails,
} from "./models";

// Define an interface for Notification state object for type safety
interface NotificationState {
  date: string;
  attempts: number;
  sent: boolean;
}

const NOTIFICATION_STATE_KEY = "dailyNotificationState";
const NOTIFICATION_AUTO_CLOSE_TIME = 30000;
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
let refreshTimer: NodeJS.Timeout | undefined;

// Cache-related constants
const LAST_KNOWN_COOKIE_HASH_KEY = "lastKnownCookieHash";
const LAST_KNOWN_TEAM_ID_KEY = "lastKnownTeamId";

/**
 * Interface for cached data with timestamp
 */
interface CachedData<T> {
  data: T;
  timestamp: number;
}

/**
 * Gets cached data if it exists and is still valid (within 24 hours)
 * @param context VS Code extension context
 * @param key Cache key
 * @returns Cached data or null if not found or expired
 */
async function getCached<T>(
  context: vscode.ExtensionContext,
  key: string,
): Promise<T | null> {
  const cached = context.globalState.get<CachedData<T>>(key);
  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (now - cached.timestamp > CACHE_EXPIRY_MS) {
    // Cache expired, remove it
    await context.globalState.update(key, undefined);
    return null;
  }

  return cached.data;
}

/**
 * Sets data in cache with current timestamp
 * @param context VS Code extension context
 * @param key Cache key
 * @param data Data to cache
 */
async function setCached<T>(
  context: vscode.ExtensionContext,
  key: string,
  data: T,
): Promise<void> {
  const cachedData: CachedData<T> = {
    data,
    timestamp: Date.now(),
  };
  await context.globalState.update(key, cachedData);
}

/**
 * Clears multiple cache keys
 * @param context VS Code extension context
 * @param keys Array of cache keys to clear
 */
async function clearCached(
  context: vscode.ExtensionContext,
  keys: string[],
): Promise<void> {
  await Promise.all(
    keys.map((key) => context.globalState.update(key, undefined)),
  );
}

/**
 * Creates a SHA-256 hash of the cookie for change detection
 * @param cookie Cookie string to hash
 * @returns SHA-256 hash as hex string
 */
function hashCookie(cookie: string): string {
  return crypto.createHash("sha256").update(cookie).digest("hex");
}

/**
 * Calculates the next reset date based on the start of month date.
 * @param startOfMonth ISO date string representing when the current cycle started
 * @returns Object containing reset date and days remaining
 */
export function calculateResetInfo(startOfMonth: string): {
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
 * Checks for authentication changes (cookie or team ID) and clears cache if needed.
 * This handles re-login scenarios and IDE relaunches.
 * @param context VS Code extension context
 */
async function checkAndClearCacheOnAuthChange(
  context: vscode.ExtensionContext,
): Promise<void> {
  const cookie = await context.secrets.get("cursor.cookie");
  if (!cookie) {
    return; // No cookie to check
  }

  const currentCookieHash = hashCookie(cookie);
  const lastKnownCookieHash = context.globalState.get<string>(
    LAST_KNOWN_COOKIE_HASH_KEY,
  );
  const lastKnownTeamId = context.globalState.get<number>(
    LAST_KNOWN_TEAM_ID_KEY,
  );

  // Check if cookie has changed
  if (lastKnownCookieHash && lastKnownCookieHash !== currentCookieHash) {
    console.log("[Cursor Usage] Cookie changed - clearing caches");
    await clearAllCaches(context);
  }

  // Check if team ID has changed (via settings)
  const currentTeamId = config.getTeamIdFromSettings();
  const currentTeamIdNum =
    currentTeamId && !isNaN(parseInt(currentTeamId, 10))
      ? parseInt(currentTeamId, 10)
      : undefined;

  if (lastKnownTeamId !== currentTeamIdNum) {
    console.log(
      "[Cursor Usage] Team ID changed - clearing team-related caches",
    );
    await clearTeamCaches(context);
  }

  // Update stored values for next check
  await context.globalState.update(
    LAST_KNOWN_COOKIE_HASH_KEY,
    currentCookieHash,
  );
  await context.globalState.update(LAST_KNOWN_TEAM_ID_KEY, currentTeamIdNum);
}

/**
 * Clears all caches
 * @param context VS Code extension context
 */
async function clearAllCaches(context: vscode.ExtensionContext): Promise<void> {
  const allCacheKeys = ["cachedUserMe", "cachedTeams"];
  await clearCached(context, allCacheKeys);

  // Clear team-specific caches (we don't know team IDs, so clear pattern)
  const allKeys = context.globalState.keys();
  const teamCacheKeys = allKeys.filter((key) =>
    key.startsWith("cachedTeamDetails_"),
  );
  await clearCached(context, teamCacheKeys);
}

/**
 * Clears only team-related caches
 * @param context VS Code extension context
 */
async function clearTeamCaches(
  context: vscode.ExtensionContext,
): Promise<void> {
  const teamCacheKeys = ["cachedTeams"];
  await clearCached(context, teamCacheKeys);

  // Clear team-specific caches (we don't know team IDs, so clear pattern)
  const allKeys = context.globalState.keys();
  const teamDetailCacheKeys = allKeys.filter((key) =>
    key.startsWith("cachedTeamDetails_"),
  );
  await clearCached(context, teamDetailCacheKeys);
}

/**
 * This is the main activation function for the extension.
 * It's called by VS Code when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext) {
  console.log("[Cursor Usage] Extension is now active.");

  statusBar.createStatusBarItem();

  // Check for authentication changes and clear cache if needed
  checkAndClearCacheOnAuthChange(context);

  // Register all commands and add them to subscriptions
  const insertCookieCommand = vscode.commands.registerCommand(
    "cursorUsage.insertCookie",
    () => insertCookie(context),
  );
  const refreshCommand = vscode.commands.registerCommand(
    "cursorUsage.refresh",
    () => refreshUsage(context),
  );
  const openSettingsCommand = vscode.commands.registerCommand(
    "cursorUsage.openSettings",
    openSettings,
  );
  const forceRefreshCommand = vscode.commands.registerCommand(
    "cursorUsage.forceRefresh",
    () => forceRefresh(context),
  );
  const setTeamIdCommand = vscode.commands.registerCommand(
    "cursorUsage.setTeamId",
    () => setTeamId(context),
  );
  const setPollMinutesCommand = vscode.commands.registerCommand(
    "cursorUsage.setPollMinutes",
    setPollMinutes,
  );
  const testNotificationCommand = vscode.commands.registerCommand(
    "cursorUsage.testNotification",
    () => testNotification(context),
  );
  context.subscriptions.push(
    statusBar.getStatusBarItem(),
    insertCookieCommand,
    refreshCommand,
    openSettingsCommand,
    forceRefreshCommand,
    setTeamIdCommand,
    setPollMinutesCommand,
    testNotificationCommand,
  );

  // Initial refresh and setup the timer for periodic refreshes.
  refreshUsage(context);
  setupRefreshTimer(context);
  initializeNotificationService(context);

  // Initialize notification cleanup system
  initializeNotificationCleanup();

  // Listen for configuration changes to update the refresh timer interval.
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    async (event) => {
      let shouldRefresh = false;

      if (event.affectsConfiguration("cursorUsage.pollMinutes")) {
        setupRefreshTimer(context);
      }

      if (event.affectsConfiguration("cursorUsage.teamId")) {
        // Team ID changed, clear the cached one if it exists and clear team-related caches
        const teamId = config.getTeamIdFromSettings();
        if (teamId) {
          context.workspaceState.update("cursor.teamId", undefined);
        }
        console.log(
          "[Cursor Usage] Clearing team caches on team ID configuration change",
        );
        await clearTeamCaches(context);
        shouldRefresh = true;
      }

      if (shouldRefresh) {
        refreshUsage(context);
      }
    },
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

    setInterval(
      () => {
        checkAndSendNotification(context);
      },
      24 * 60 * 60 * 1000,
    ); // 24 hours
  }, timeUntilNextNineAM);
}

export async function checkAndSendNotification(
  context: vscode.ExtensionContext,
  testTime?: Date, // Optional parameter for testing
) {
  const now = testTime || new Date();
  const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD format

  let state = context.globalState.get<NotificationState>(
    NOTIFICATION_STATE_KEY,
  );

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
      // Show both Cursor and OS notifications
      showSystemNotification(usageStats);

      // Mark as sent ONLY on success
      state.sent = true;
      console.log("Daily usage notification sent successfully.");
    } else {
      console.log(
        "Could not retrieve valid usage stats. Skipping notification.",
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
  context: vscode.ExtensionContext,
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

  // Return the EXACT same text as shown in status bar (no custom formatting)
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

      // Clear all caches on cookie update
      console.log("[Cursor Usage] Clearing caches on cookie change");
      await clearAllCaches(context);

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
    "@ext:cursor-usage.cursor-usage",
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
        'Cursor cookie not found. Use "Cursor Usage Extension: Insert cookie value" command to set it.',
      );
      return;
    }

    // Get user information for reset date (with caching)
    let userMe = await getCached<UserMeResponse>(context, "cachedUserMe");
    if (!userMe) {
      userMe = await api.fetchUserMe(cookie);
      await setCached(context, "cachedUserMe", userMe);
      console.log(
        `[Cursor Usage] Fetched and cached user info for: ${userMe.email}`,
      );
    } else {
      console.log(`[Cursor Usage] Using cached user info for: ${userMe.email}`);
    }

    // Get user usage data for reset date information with partial failure handling
    let userUsage: UserUsageResponse | null = null;
    try {
      userUsage = await api.fetchUserUsage(userMe.sub, cookie);
      console.log(`[Cursor Usage] Fetched usage data for user: ${userMe.sub}`);
    } catch (usageError: any) {
      console.warn(
        `[Cursor Usage] Failed to fetch user usage data: ${usageError.message}. Using basic user info only.`,
      );
    }

    // Two-tier approach: try team data first, fallback to individual data
    // This supports both team users and individual users without teams
    const teamId = await getTeamId(context, cookie);
    let mySpend: TeamMemberSpend | undefined;
    let maxRequests = userUsage
      ? userUsage["gpt-4"].maxRequestUsage || 500
      : 500;

    // TEAM FLOW: Try to get team-based usage data if user has related team from api/sets a team ID manually
    // If we couldn't get team spend data, we'll show a simplified view with just the individual user data
    if (teamId) {
      try {
        // Try to get team details from cache first
        const cacheKey = `cachedTeamDetails_${teamId}`;
        let userDetails = await getCached<TeamDetails>(context, cacheKey);
        if (!userDetails) {
          userDetails = await api.fetchTeamDetails(teamId, cookie);
          await setCached(context, cacheKey, userDetails);
          console.log(
            `[Cursor Usage] Fetched and cached team details for team ${teamId}`,
          );
        } else {
          console.log(
            `[Cursor Usage] Using cached team details for team ${teamId}`,
          );
        }

        const spendData = await api.fetchTeamSpend(teamId, cookie);

        mySpend = spendData.teamMemberSpend.find(
          (member) => member.userId === userDetails.userId,
        );
      } catch (teamError: any) {
        console.warn(
          `[Cursor Usage] Failed to fetch team data: ${teamError.message}`,
        );
      }
    }

    // Determine usage data source and calculate values
    let usedRequests = 0; // Initialize with default value
    let spendCents: number | undefined;
    let hardLimitDollars: number | undefined;
    let bothApisFailed = false;

    if (!userUsage) {
      // USER USAGE FAILED: This is complete failure - let error handling take over
      // User usage is required, team usage is optional
      console.log(
        "[Cursor Usage] User usage API failed - using existing error handling (complete failure)",
      );
      bothApisFailed = true;
    } else if (!mySpend || typeof mySpend.fastPremiumRequests !== "number") {
      // PARTIAL FAILURE: User usage succeeds but team API fails
      // Show individual user data only
      const gpt4Usage = userUsage["gpt-4"];
      usedRequests = gpt4Usage.numRequests;
      spendCents = undefined; // Individual users don't have spending data in team API
      hardLimitDollars = undefined;
    } else {
      // FULL SUCCESS: Both user and team usage available
      // Use team-based data when available (may be more accurate)
      usedRequests = mySpend.fastPremiumRequests;
      spendCents = mySpend.spendCents;
      hardLimitDollars = mySpend.hardLimitOverrideDollars;
    }

    // Only update status bar if we have valid data to show
    if (!bothApisFailed) {
      // Calculate final values and update status bar
      const remainingRequests = Math.max(0, maxRequests - usedRequests);
      const resetInfo = userUsage
        ? calculateResetInfo(userUsage.startOfMonth)
        : calculateResetInfo(new Date().toISOString().split("T")[0]); // Use current month as fallback

      statusBar.updateStatusBar(
        remainingRequests,
        maxRequests,
        spendCents,
        hardLimitDollars,
        resetInfo,
      );

      let logMessage = `[Cursor Usage] Successfully updated status bar. Remaining requests: ${remainingRequests}/${maxRequests}, Resets in ${resetInfo.daysRemaining} days`;
      if (spendCents !== undefined && hardLimitDollars !== undefined) {
        const spendDollars = (spendCents / 100).toFixed(2);
        logMessage += `, spend: $${spendDollars}/$${hardLimitDollars.toFixed(2)}`;
      }
      console.log(logMessage);
    } else {
      // Both APIs failed - let the existing error handling take over by not updating status bar
      console.log(
        "[Cursor Usage] Both APIs failed - not updating status bar, letting error handling work",
      );
    }
  } catch (error: any) {
    statusBar.setStatusBarError("Refresh Failed");
    console.error(
      `[Cursor Usage] Failed to refresh Cursor usage: ${error.message}`,
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
  cookie: string,
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
    "[Cursor Usage] Team ID not in settings or cache, attempting to fetch automatically.",
  );
  try {
    // Try to get teams from cache first
    let response = await getCached<TeamsResponse>(context, "cachedTeams");
    if (!response) {
      response = await api.fetchTeams(cookie);
      await setCached(context, "cachedTeams", response);
      console.log("[Cursor Usage] Fetched and cached teams data");
    } else {
      console.log("[Cursor Usage] Using cached teams data");
    }

    if (response && response.teams && response.teams.length > 0) {
      const teamId = response.teams[0].id;
      console.log(
        `[Cursor Usage] Automatically detected and cached Team ID: ${teamId}`,
      );
      // Cache the detected team ID
      await context.workspaceState.update("cursor.teamId", teamId);
      return teamId;
    }
    console.warn("[Cursor Usage] No teams found for this user.");
    return undefined;
  } catch (error: any) {
    console.error(
      `[Cursor Usage] Failed to auto-detect Team ID: ${error.message}`,
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

  // Clear all caches
  console.log("[Cursor Usage] Clearing all caches on force refresh");
  await clearAllCaches(context);

  // Clear cached data
  await context.workspaceState.update("cursor.teamId", undefined);
  console.log("[Cursor Usage] Cleared cached Team ID.");

  // Reset and setup timer
  setupRefreshTimer(context);

  // Refresh usage data
  await refreshUsage(context);
  vscode.window.showInformationMessage(
    "Cursor Usage extension has been re-initialized.",
  );
}

/**
 * Shows an input box to let the user set their Team ID.
 */
async function setTeamId(context: vscode.ExtensionContext) {
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
      `Cursor Team ID set to: ${teamId || "auto"}`,
    );

    // Clear team-related caches on team ID change
    console.log("[Cursor Usage] Clearing team caches on team ID change");
    await clearTeamCaches(context);
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
        vscode.ConfigurationTarget.Global,
      );
    vscode.window.showInformationMessage(
      `Cursor poll interval set to: ${pollMinutes} minutes.`,
    );
  }
}

/**
 * Test command to manually trigger the notification for testing purposes.
 * This allows you to see how the notification looks without waiting for the scheduled time.
 */
export async function testNotification(context: vscode.ExtensionContext) {
  console.log("[Cursor Usage] Testing notification manually...");

  try {
    // Get the full tooltip message (detailed usage information)
    const fullMessage = getFullTooltipMessage();

    console.log("Testing notification with full message:", fullMessage);

    // Send Cursor notification first (simple text only)
    sendCursorNotification(fullMessage);
    console.log("Cursor notification sent");

    // Send OS notification with Cursor IDE icon and full message
    sendOSNotification(fullMessage);
    console.log("OS notification sent with Cursor IDE icon");

    console.log(
      "Test notifications completed - check console for detailed logs",
    );
  } catch (error) {
    console.error("Failed to send test notification:", error);
    vscode.window.showErrorMessage(
      `Failed to send test notification: ${error}`,
    );
  }
}

/**
 * Shows notifications in both Cursor notification tray and OS system tray.
 * Uses full tooltip content and Cursor IDE icon for consistency.
 */
export function showSystemNotification(message: string) {
  // Get the full tooltip content (detailed usage information)
  const fullMessage = getFullTooltipMessage();

  // 1. Send Cursor notification (appears in Cursor notification tray) - simple text only
  sendCursorNotification(fullMessage);

  // 2. Send OS system notification (appears in OS notification center) - with click behavior
  sendOSNotification(fullMessage);
}

/**
 * Gets the full tooltip message (detailed usage information) without "Click to refresh"
 */
function getFullTooltipMessage(): string {
  const statusBarItem = require("./statusBar").getStatusBarItem();
  if (statusBarItem && statusBarItem.tooltip) {
    // Return tooltip content without the "Click to refresh" part
    const tooltip = statusBarItem.tooltip as string;
    const lines = tooltip.split("\n");

    // Remove the last line if it's "Click to refresh" or empty lines at the end
    while (
      lines.length > 0 &&
      (lines[lines.length - 1].trim() === "" ||
        lines[lines.length - 1].includes("Click to refresh"))
    ) {
      lines.pop();
    }

    // Identify specific lines
    let resetLine = "";
    let warningLine = "";
    let requestsLine = "";
    let spendingLine = "";
    let budgetLine = "";

    lines.forEach((line: string) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("Resets in")) {
        resetLine = trimmed;
      } else if (trimmed.startsWith("⚠️")) {
        warningLine = trimmed;
      } else if (trimmed.startsWith("Fast Premium Requests:")) {
        requestsLine = trimmed;
      } else if (trimmed.startsWith("Spending:")) {
        spendingLine = trimmed;
      } else if (trimmed.startsWith("Remaining budget:")) {
        budgetLine = trimmed;
      }
    });

    // Reorder: requests > spending > budget > reset > warning (if present)
    const orderedLines = [];
    if (requestsLine) orderedLines.push(requestsLine);
    if (spendingLine) orderedLines.push(spendingLine);
    if (budgetLine) orderedLines.push(budgetLine);
    if (resetLine) orderedLines.push(resetLine);
    if (warningLine) orderedLines.push(warningLine);

    console.log("Ordered lines for notification:", orderedLines.join("\n"));
    return orderedLines.join("\n");
  }
  return "Usage information not available";
}

/**
 * Sends a notification to the Cursor notification tray with simple text only.
 * No buttons, just clean information display.
 */
function sendCursorNotification(message: string) {
  // Create single-line message with separators for tray readability
  const separatedMessage = message
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join(" |-----| ");

  vscode.window.showInformationMessage(separatedMessage);

  // Track for cleanup after 6 hours
  trackNotificationForCleanup(separatedMessage); // Track for cleanup

  console.log(
    "Cursor notification sent - will be cleaned from history after 6 hours",
  );
}

/**
 * Tracks notifications for cleanup from VS Code / Cursor's notification history
 * Removes notifications from our internal tracking after 6 hours
 */
function trackNotificationForCleanup(message: string) {
  const NOTIFICATION_HISTORY_KEY = "cursorNotificationHistory";
  const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

  try {
    // Get current notification history
    const config = vscode.workspace.getConfiguration();
    const history = config.get(NOTIFICATION_HISTORY_KEY, []) as Array<{
      message: string;
      timestamp: number;
    }>;

    console.log(
      `Tracking notification - current history count: ${history.length}`,
    );

    // Add new notification
    history.push({
      message: message,
      timestamp: Date.now(),
    });

    // Clean up old notifications (older than 6 hours)
    const sixHoursAgo = Date.now() - CLEANUP_INTERVAL_MS;
    const filteredHistory = history.filter(
      (item) => item.timestamp > sixHoursAgo,
    );

    // Only update if there were actually old notifications to clean
    if (filteredHistory.length !== history.length) {
      config.update(
        NOTIFICATION_HISTORY_KEY,
        filteredHistory,
        vscode.ConfigurationTarget.Global,
      );
      console.log(
        `Cleaned up ${history.length - filteredHistory.length} old notifications`,
      );
    }

    console.log(
      `Notification tracked successfully - total in history: ${filteredHistory.length}`,
    );

    // Set up immediate cleanup check
    setTimeout(
      () => {
        cleanupOldNotifications();
      },
      1000 * 60 * 5,
    ); // Check in 5 minutes for immediate feedback
  } catch (error) {
    console.error("Failed to track notification for cleanup:", error);
  }
}

/**
 * Cleans up old notifications from VS Code's notification history
 */
function cleanupOldNotifications() {
  const NOTIFICATION_HISTORY_KEY = "cursorNotificationHistory";
  const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

  try {
    const config = vscode.workspace.getConfiguration();
    const history = config.get(NOTIFICATION_HISTORY_KEY, []) as Array<{
      message: string;
      timestamp: number;
    }>;

    console.log(
      `Cleanup check - current notification count: ${history.length}`,
    );

    const sixHoursAgo = Date.now() - CLEANUP_INTERVAL_MS;
    const filteredHistory = history.filter(
      (item) => item.timestamp > sixHoursAgo,
    );

    if (filteredHistory.length !== history.length) {
      const cleanedCount = history.length - filteredHistory.length;
      config.update(
        NOTIFICATION_HISTORY_KEY,
        filteredHistory,
        vscode.ConfigurationTarget.Global,
      );

      console.log(
        `Cleaned up ${cleanedCount} old notifications from history (older than 6 hours)`,
      );

      // Log some details about what was cleaned
      const oldNotifications = history.filter(
        (item) => item.timestamp <= sixHoursAgo,
      );
      if (oldNotifications.length > 0) {
        console.log(
          `Oldest notification was from ${new Date(oldNotifications[0].timestamp).toLocaleString()}`,
        );
      }
    } else {
      console.log("No old notifications to clean up");
    }
  } catch (error) {
    console.error("Failed to cleanup old notifications:", error);
  }
}

/**
 * Initializes the notification cleanup system that runs periodically
 */
function initializeNotificationCleanup() {
  try {
    console.log("Initializing notification cleanup system...");

    // Run initial cleanup immediately
    cleanupOldNotifications();

    // Set up periodic cleanup every hour
    const cleanupInterval = setInterval(
      () => {
        console.log("Running scheduled notification cleanup...");
        cleanupOldNotifications();
      },
      60 * 60 * 1000,
    ); // Check every hour

    console.log(
      "Notification cleanup system initialized - will clean notifications older than 6 hours",
    );

    // Return cleanup function for potential cleanup
    return () => {
      clearInterval(cleanupInterval);
      console.log("Notification cleanup system stopped");
    };
  } catch (error) {
    console.error("Failed to initialize notification cleanup system:", error);
  }
}

/**
 * Sends a system notification to the OS notification tray.
 */
function sendOSNotification(message: string) {
  console.log("Attempting to send OS notification with Cursor IDE icon...");

  // Transform message to bulleted list
  const bulletedMessage = message
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => `  - ${line}`)
    .join("\n");

  // Try multiple methods to send OS notifications with Cursor IDE icon
  const methods = [
    // Method 1: node-notifier with Cursor IDE icon
    () => sendWithNodeNotifier(bulletedMessage),
    // Method 2: macOS Notification Center with Cursor app icon
    () => sendWithNotificationCenterCheck(bulletedMessage),
    // Method 3: macOS terminal-notifier via osascript with Cursor app
    () => sendWithTerminalNotifier(bulletedMessage),
  ];

  let success = false;
  for (const method of methods) {
    try {
      if (method()) {
        success = true;
        break;
      }
    } catch (error) {
      console.log("Method failed:", error);
    }
  }

  if (!success) {
    console.log(
      "All OS notification methods failed, but Cursor notification is still working",
    );
  }
}

function sendWithNodeNotifier(message: string): boolean {
  try {
    const notifier = require("node-notifier");
    const path = require("path");
    const fs = require("fs");

    // Try multiple icon paths for different scenarios
    // VS Code extension context has different path resolution than standalone Node.js
    const possibleIconPaths = [
      // Method 1: Try to find the extension's assets directory (works in development)
      (() => {
        // Try different possible locations for the assets folder
        const possibleAssetPaths = [
          path.join(__dirname, "../../../assets/logo.png"), // Development path
          path.join(__dirname, "../../assets/logo.png"), // Alternative dev path
          path.join(__dirname, "../assets/logo.png"), // Bundled path
          path.join(__dirname, "assets/logo.png"), // Direct path
        ];

        for (const assetPath of possibleAssetPaths) {
          if (fs.existsSync(assetPath)) {
            return assetPath;
          }
        }
        return null;
      })(),
      // Method 2: Cursor app icons (may be restricted in extension context)
      "/Applications/Cursor.app/Contents/Resources/cursor.png", // PNG version (more compatible)
      "/Applications/Cursor.app/Contents/Resources/cursor.icns", // ICNS version (native but may be blocked)
    ].filter(Boolean); // Remove null entries

    let iconPath = null;
    for (const testPath of possibleIconPaths) {
      if (fs.existsSync(testPath)) {
        iconPath = testPath;
        console.log(
          "Found icon at:",
          testPath,
          "- Size:",
          fs.statSync(testPath).size,
          "bytes - Extension:",
          path.extname(testPath),
        );
        console.log(
          "Extension context path resolution: __dirname =",
          __dirname,
        );

        // If we found an ICNS file, try to use it directly
        // ICNS should work with node-notifier, but if it doesn't, we have PNG fallbacks
        if (path.extname(testPath) === ".icns") {
          console.log("Using ICNS icon (native format for macOS)");
        } else {
          console.log("Using PNG icon (more compatible format)");
        }
        break;
      }
    }

    // If no icon found, try to use a fallback approach
    if (!iconPath) {
      console.log(
        "No icon found in any of the expected paths. Will send notification without icon.",
      );
    }

    const notificationOptions = {
      title: "Cursor",
      message: `Cursor Usage Summary: \n${message}`,
      icon: iconPath, // Use found icon or null
      sound: false,
      wait: false,
      timeout: NOTIFICATION_AUTO_CLOSE_TIME, // timeout for OS notifications
      actions: ["Open Cursor", "Close"], // Click options
    };

    console.log("Sending OS notification with options:", {
      title: notificationOptions.title,
      message: notificationOptions.message,
      icon: notificationOptions.icon,
      hasIcon: !!iconPath,
      iconSize: iconPath ? fs.statSync(iconPath).size : 0,
      iconExtension: iconPath ? path.extname(iconPath) : "none",
    });

    // Try asynchronous call with error handling
    notifier.notify(
      notificationOptions,
      (err: any, response: any, metadata: any) => {
        if (err) {
          // Filter out terminal-notifier errors as they're just fallback attempts
          if (
            err.code === "ENOENT" &&
            err.path &&
            err.path.includes("terminal-notifier")
          ) {
            console.log(
              "OS notification sent via node-notifier (terminal-notifier fallback not available, but notification sent)",
            );
          } else {
            console.log(
              "OS notification sent via node-notifier with Cursor icon",
            );
          }

          // Handle click actions if notification succeeded
          if (metadata && metadata.activationType === "clicked") {
            // User clicked the notification
            if (metadata.activationValue === "Open Cursor") {
              // Try to bring Cursor to front
              require("child_process").exec(
                'open -a "Cursor"',
                (error: any) => {
                  if (error) {
                    console.log("Could not open Cursor:", error);
                  }
                },
              );
            }
          }
        } else {
          console.log(
            "OS notification sent via node-notifier with Cursor icon",
          );
          if (metadata && metadata.activationType === "clicked") {
            // User clicked the notification
            if (metadata.activationValue === "Open Cursor") {
              // Try to bring Cursor to front
              require("child_process").exec(
                'open -a "Cursor"',
                (error: any) => {
                  if (error) {
                    console.log("Could not open Cursor:", error);
                  }
                },
              );
            }
          }
        }
      },
    );

    console.log("OS notification sent via node-notifier (async)");
    return true;
  } catch (error) {
    console.log("node-notifier failed:", error);
    return false;
  }
}

function sendWithVSCodeSystem(message: string): boolean {
  try {
    // VS Code doesn't have a direct OS notification API, but we can use showInformationMessage
    // which will at least show in the system if VS Code is configured that way
    vscode.window.showInformationMessage(`${message} (System)`, "OK");
    console.log("OS notification sent via VS Code system");
    return true;
  } catch (error) {
    console.log("VS Code system notification failed:", error);
    return false;
  }
}

function sendWithNotificationCenterCheck(message: string): boolean {
  try {
    const { exec } = require("child_process");

    // Escape the full message for shell command
    const escapedMessage = message.replace(/"/g, '\\"').replace(/'/g, "\\'");

    // Send notification directly with Cursor app reference
    const cursorAppPath = "/Applications/Cursor.app";
    const fullMessage = `Cursor Usage Summary: \n${escapedMessage}`;
    const notificationCommand = `osascript -e 'tell application "${cursorAppPath}" to display notification "${fullMessage}" with title "Cursor" subtitle "Usage Update"'`;

    console.log(
      "Executing notification center command with Cursor app:",
      notificationCommand,
    );

    exec(
      notificationCommand,
      (notifError: any, notifStdout: any, notifStderr: any) => {
        if (notifError) {
          console.log(
            "Notification center notification failed:",
            notifError.message,
          );
          console.log("stderr:", notifStderr);

          // Try fallback without app reference
          const fallbackFullMessage = `/* The above code is a comment in TypeScript. It is using a
        multi-line comment syntax to provide a summary of the usage of
        the "Cursor" in the code. */
        Cursor Usage Summary: \n${escapedMessage}`;
          const fallbackCommand = `osascript -e 'display notification "${fallbackFullMessage}" with title "Cursor" subtitle "Usage Update"'`;
          exec(
            fallbackCommand,
            (fbError: any, fbStdout: any, fbStderr: any) => {
              if (fbError) {
                console.log(
                  "Fallback notification center also failed:",
                  fbError.message,
                );
              } else {
                console.log(
                  "OS notification sent via fallback Notification Center",
                );
              }
            },
          );
        } else {
          console.log(
            "OS notification sent via Notification Center with Cursor app",
          );
        }
      },
    );

    return true;
  } catch (error) {
    console.log("Notification center check not available:", error);
    return false;
  }
}

function sendWithTerminalNotifier(message: string): boolean {
  try {
    // Try using the macOS terminal-notifier command if available
    const { exec } = require("child_process");

    // Escape quotes in message for shell command
    const escapedMessage = message.replace(/"/g, '\\"').replace(/'/g, "\\'");

    // Use AppleScript display notification with Cursor app icon
    const cursorAppPath = "/Applications/Cursor.app";
    const fullMessage = `Cursor Usage Summary: \n${escapedMessage}`;
    const command = `osascript -e 'tell application "${cursorAppPath}" to display notification "${fullMessage}" with title "Cursor" subtitle "Usage Update"'`;

    console.log(
      "Executing macOS notification command with Cursor app:",
      command,
    );

    exec(command, (error: any, stdout: any, stderr: any) => {
      if (error) {
        console.log("macOS notification failed:", error.message);
        console.log("stderr:", stderr);

        // Try alternative AppleScript syntax without app reference
        const altFullMessage = `Cursor Usage Summary: \n${escapedMessage}`;
        const altCommand = `osascript -e 'display notification "${altFullMessage}" with title "Cursor" subtitle "Usage Update"'`;
        exec(altCommand, (altError: any, altStdout: any, altStderr: any) => {
          if (altError) {
            console.log(
              "Alternative AppleScript also failed:",
              altError.message,
            );
          } else {
            console.log("OS notification sent via alternative AppleScript");
          }
        });
      } else {
        console.log(
          "OS notification sent via macOS AppleScript with Cursor app",
        );
      }
    });

    return true;
  } catch (error) {
    console.log("macOS notification not available:", error);
    return false;
  }
}
