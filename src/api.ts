import fetch from 'node-fetch';
import { Team, TeamDetails, SpendData } from './models';

const BASE_URL = 'https://www.cursor.com/api/dashboard';

/**
 * A generic and secure wrapper for making POST requests to the Cursor API.
 * It ensures the cookie is only used here and not logged.
 * @param endpoint The API endpoint to hit.
 * @param cookie The user's authentication cookie.
 * @param body The request body.
 * @returns A promise that resolves to the JSON response.
 */
async function post<T>(endpoint: string, cookie: string, body: object): Promise<T> {
    const url = `${BASE_URL}/${endpoint}`;
    console.log(`[Cursor Usage] Fetching data from ${endpoint}`);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': `WorkosCursorSessionToken=${cookie}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        // We avoid logging the response body here as it could contain sensitive information.
        console.error(`[Cursor Usage] API Error on ${endpoint}: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch data from ${endpoint}. Status: ${response.status}`);
    }

    return response.json() as Promise<T>;
}

/** Fetches all teams the user belongs to. */
export async function fetchTeams(cookie: string): Promise<Team[]> {
    return post<Team[]>('teams', cookie, {});
}

/** Fetches details for a specific team, including the user's ID within that team. */
export async function fetchTeamDetails(teamId: number, cookie: string): Promise<TeamDetails> {
    return post<TeamDetails>('team', cookie, { teamId });
}

/** Fetches the spend data for all members of a specific team. */
export async function fetchTeamSpend(teamId: number, cookie: string): Promise<SpendData> {
    return post<SpendData>('get-team-spend', cookie, { teamId });
} 