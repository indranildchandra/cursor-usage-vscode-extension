import * as vscode from "vscode";

let statusBarItem: vscode.StatusBarItem;
const TOTAL_REQUESTS = 500;

/**
 * Creates and displays the status bar item.
 */
export function createStatusBarItem() {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "cursorUsage.refresh";
  statusBarItem.tooltip = "Remaining Cursor fast-premium requests";
  statusBarItem.text = "$(zap) Loading...";
  statusBarItem.show();
}

/**
 * Updates the status bar with the remaining requests and appropriate color/icon.
 * @param remainingRequests The number of requests left.
 */
export function updateStatusBar(remainingRequests: number) {
  if (!statusBarItem) {
    return;
  }

  const warningThreshold = TOTAL_REQUESTS * 0.1; // 10%
  let icon = "$(zap)";

  // Reset background color before setting it.
  statusBarItem.backgroundColor = undefined;

  if (remainingRequests <= 0) {
    icon = "$(error)";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground"
    );
  } else if (remainingRequests <= warningThreshold) {
    icon = "$(warning)";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  }

  statusBarItem.text = `${icon} ${remainingRequests}`;
}

/**
 * Sets the status bar to a generic error state.
 * @param message The message to display. If not provided, a default message is used.
 */
export function setStatusBarError(message?: string) {
  if (!statusBarItem) {
    return;
  }
  const displayMessage = message || "Error";
  statusBarItem.text = `$(error) ${displayMessage}`;
  statusBarItem.backgroundColor = new vscode.ThemeColor(
    "statusBarItem.errorBackground"
  );

  if (displayMessage === "Team ID?") {
    statusBarItem.command = "cursorUsage.openSettings";
    statusBarItem.tooltip = "Click to set your Team ID in settings";
  } else {
    statusBarItem.command = "cursorUsage.refresh";
    statusBarItem.tooltip = "Click to refresh usage data";
  }
}

/**
 * Sets the status bar to a generic warning state.
 * @param message The message to display.
 */
export function setStatusBarWarning(message: string) {
  if (!statusBarItem) {
    return;
  }
  statusBarItem.text = `$(warning) ${message}`;
  statusBarItem.backgroundColor = new vscode.ThemeColor(
    "statusBarItem.warningBackground"
  );

  // If the warning is about setting the cookie, make the status bar item clickable
  // to trigger the cookie insertion command.
  if (message === "Set Cookie") {
    statusBarItem.command = "cursorUsage.insertCookie";
    statusBarItem.tooltip = "Click to set your Cursor session cookie";
  } else {
    // Reset to default refresh command if the warning is something else
    statusBarItem.command = "cursorUsage.refresh";
    statusBarItem.tooltip = "Click to refresh usage data";
  }
}

/**
 * Returns the created status bar item instance.
 * @returns The StatusBarItem instance.
 */
export function getStatusBarItem(): vscode.StatusBarItem {
  return statusBarItem;
}
