import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
const TOTAL_REQUESTS = 500;

/**
 * Creates and displays the status bar item.
 */
export function createStatusBarItem() {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'cursorUsage.refresh';
    statusBarItem.tooltip = 'Remaining Cursor fast-premium requests';
    statusBarItem.text = '$(zap) Loading...';
    statusBarItem.show();
}

/**
 * Updates the status bar with the remaining requests and appropriate color/icon.
 * @param remainingRequests The number of requests left.
 */
export function updateStatusBar(remainingRequests: number) {
    if (!statusBarItem) { return; }

    const warningThreshold = TOTAL_REQUESTS * 0.1; // 10%
    let icon = '$(zap)';
    
    // Reset background color before setting it.
    statusBarItem.backgroundColor = undefined;

    if (remainingRequests <= 0) {
        icon = '$(error)';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (remainingRequests <= warningThreshold) {
        icon = '$(warning)';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    
    statusBarItem.text = `${icon} ${remainingRequests}/${TOTAL_REQUESTS}`;
}

/**
 * Sets the status bar to a generic error state.
 * @param message The message to display. If not provided, a default message is used.
 */
export function setStatusBarError(message?: string) {
    if (!statusBarItem) { return; }
    statusBarItem.text = `$(error) ${message || 'Error'}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
}

/**
 * Sets the status bar to a generic warning state.
 * @param message The message to display.
 */
export function setStatusBarWarning(message: string) {
    if (!statusBarItem) { return; }
    statusBarItem.text = `$(warning) ${message}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
}

/**
 * Returns the created status bar item instance.
 * @returns The StatusBarItem instance.
 */
export function getStatusBarItem(): vscode.StatusBarItem {
    return statusBarItem;
} 