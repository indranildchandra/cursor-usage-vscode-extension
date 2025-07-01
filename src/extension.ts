import * as vscode from 'vscode';
import * as api from './api';
import * as statusBar from './statusBar';
import * as config from './configuration';

let refreshTimer: NodeJS.Timeout | undefined;

/**
 * This is the main activation function for the extension.
 * It's called by VS Code when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('[Cursor Usage] Extension is now active.');

	statusBar.createStatusBarItem();

	// Register all commands and add them to subscriptions
	const insertCookieCommand = vscode.commands.registerCommand('cursorUsage.insertCookie', () => insertCookie(context));
	const refreshCommand = vscode.commands.registerCommand('cursorUsage.refresh', () => refreshUsage(context));
	context.subscriptions.push(statusBar.getStatusBarItem(), insertCookieCommand, refreshCommand);

	// Initial refresh and setup the timer for periodic refreshes.
	refreshUsage(context);
	setupRefreshTimer(context);

	// Listen for configuration changes to update the refresh timer interval.
	const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('cursorUsage.pollMinutes')) {
			setupRefreshTimer(context);
		}
	});
	context.subscriptions.push(configChangeListener);
}

/**
 * This function is called when the extension is deactivated.
 * It cleans up resources, like clearing the refresh timer.
 */
export function deactivate() {
	console.log('[Cursor Usage] Extension is now deactivated.');
	if (refreshTimer) {
		clearInterval(refreshTimer);
	}
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
			prompt: 'Enter your WorkosCursorSessionToken cookie value',
			placeHolder: 'Paste cookie value here...',
			password: true,
			ignoreFocusOut: true
		});

		if (cookieValue && cookieValue.trim()) {
			// Securely store the cookie.
			await context.secrets.store('cursor.cookie', cookieValue.trim());
			vscode.window.showInformationMessage('Cookie saved successfully!');
			await refreshUsage(context);
		} else {
			vscode.window.showWarningMessage('No cookie value provided.');
		}
	} catch (error: any) {
		console.error(`[Cursor Usage] Failed to save cookie: ${error.message}`);
		vscode.window.showErrorMessage(`Failed to save cookie: ${error.message}`);
	}
}

/**
 * The core logic for fetching usage data and updating the UI.
 */
async function refreshUsage(context: vscode.ExtensionContext): Promise<void> {
	console.log('[Cursor Usage] Attempting to refresh usage...');
	try {
		// The cookie is retrieved from secure storage right before it's used
		// and is never stored in a variable accessible outside this scope.
		const cookie = await context.secrets.get('cursor.cookie');
		if (!cookie) {
			statusBar.setStatusBarWarning('Set Cookie');
			vscode.window.showWarningMessage('Cursor cookie not found. Use "Cursor Usage Extension: Insert cookie value" command to set it.');
			return;
		}

		const teamId = await getTeamId(cookie);
		if (!teamId) {
			statusBar.setStatusBarError('Team ID?');
			vscode.window.showErrorMessage('Could not determine your Cursor Team ID. Please set it in the extension settings.');
			return;
		}

		const userDetails = await api.fetchTeamDetails(teamId, cookie);
		const spendData = await api.fetchTeamSpend(teamId, cookie);

		const mySpend = spendData.teamMemberSpend.find(member => member.userId === userDetails.userId);

		if (!mySpend || typeof mySpend.fastPremiumRequests !== 'number') {
			statusBar.setStatusBarWarning('No Data');
			console.warn(`[Cursor Usage] Could not find spend data for User ID: ${userDetails.userId}`);
			return;
		}

		const totalRequests = 500;
		const usedRequests = mySpend.fastPremiumRequests;
		const remainingRequests = totalRequests - usedRequests;

		statusBar.updateStatusBar(remainingRequests);
		console.log(`[Cursor Usage] Successfully updated status bar. Remaining requests: ${remainingRequests}`);

	} catch (error: any) {
		statusBar.setStatusBarError('Refresh Failed');
		console.error(`[Cursor Usage] Failed to refresh Cursor usage: ${error.message}`);
		vscode.window.showErrorMessage(`Failed to refresh Cursor usage: ${error.message}`);
	}
}

/**
 * Determines the team ID to use, prioritizing user settings over auto-detection.
 * @param cookie The user's authentication cookie.
 * @returns The team ID number or undefined if not found.
 */
async function getTeamId(cookie: string): Promise<number | undefined> {
	const teamIdFromSettings = config.getTeamIdFromSettings();
	if (teamIdFromSettings && !isNaN(parseInt(teamIdFromSettings, 10))) {
		const teamId = parseInt(teamIdFromSettings, 10);
		console.log(`[Cursor Usage] Using Team ID from settings: ${teamId}`);
		return teamId;
	}

	console.log('[Cursor Usage] Team ID not in settings, attempting to fetch automatically.');
	try {
		const teams = await api.fetchTeams(cookie);
		if (teams && teams.length > 0) {
			const teamId = teams[0].id;
			console.log(`[Cursor Usage] Automatically detected Team ID: ${teamId}`);
			return teamId;
		}
		console.warn("[Cursor Usage] No teams found for this user.");
		return undefined;
	} catch (error: any) {
		console.error(`[Cursor Usage] Failed to auto-detect Team ID: ${error.message}`);
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