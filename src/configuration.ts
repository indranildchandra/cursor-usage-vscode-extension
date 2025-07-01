import * as vscode from 'vscode';

const CONFIG_NAMESPACE = 'cursorUsage';

/**
 * Retrieves the user-defined teamId from the extension's settings.
 * @returns The teamId string if it exists, otherwise undefined.
 */
export function getTeamIdFromSettings(): string | undefined {
    return vscode.workspace.getConfiguration(CONFIG_NAMESPACE).get<string>('teamId');
}

/**
 * Retrieves the poll interval in minutes from the extension's settings.
 * Defaults to 30 minutes if not set.
 * @returns The poll interval in minutes.
 */
export function getPollMinutes(): number {
    return vscode.workspace.getConfiguration(CONFIG_NAMESPACE).get<number>('pollMinutes', 30);
} 