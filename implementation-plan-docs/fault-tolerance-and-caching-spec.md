# Cursor Usage Extension: Fault Tolerance and Caching Specification

## 1. Overview

This document provides a detailed technical specification and implementation plan for enhancing fault tolerance in the Cursor Usage VS Code extension. The focus is on handling flaky API responses from Cursor services through:

- Retries for critical metrics-fetching calls.
- Caching for stable non-metrics calls.
- Safeguards to block notifications on complete failures, preventing incorrect data display.

Changes are designed to be minimal and targeted, building on existing code without breaking functionality. The plan ensures abstraction of fault tolerance logic and automatic cache management on key events.

### Key Objectives

- Improve reliability of API calls without increasing latency significantly.
- Prevent sending notifications with invalid or stale data.
- Maintain existing flows (e.g., 3-attempt notification retries) while adding layers of resilience.

### Scope

- Retries: Applied selectively to volatile metrics calls.
- Caching: Applied to stable calls, with event-based invalidation.
- No changes to unrelated components like status bar rendering or OS notifications.
- **Enhanced status bar tooltip** to show "Last updated at: [local timestamp], Click to refresh" for better user feedback.

## 2. Retry Mechanism

### Design Pattern

- **Decorator Wrapper**: Implement a higher-order function `withRetry` in `src/api.ts` to wrap async API functions. This abstracts retry logic into the API layer (data fetching), keeping business logic in `src/extension.ts` clean and focused.
- **Why This Pattern?**: It's non-intrusive, reusable, and separates concerns—retries are "superimposed" on existing fetch logic without rewriting functions.

### Configuration

- **Attempts**: 3 total (1 initial + 2 retries).
- **Delay Between Retries**: 100ms (0.1s) for quick, aggressive retries.
- **Timeout Per Attempt**: 10,000ms (10s).
- **Total Max Time Per Call**: Approximately 20.2s in worst case (but fails fast on quick errors).
- **Error Handling**: On failure, log the attempt and error; delay then retry. If all attempts fail, throw the last error to propagate failure.

### Retry Implementation Details

- Function Signature (in `src/api.ts`):

  ```typescript
  async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 2,
    delayMs: number = 100,
    timeoutMs: number = 10000
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await Promise.race([
          fn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('API timeout')), timeoutMs))
        ]);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[Cursor Usage] API attempt ${attempt} failed: ${lastError.message}. Retrying in ${delayMs}ms...`);
        if (attempt < maxRetries + 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError || new Error('Unknown API failure after retries');
  }
  ```

- **Applied To** (wrapped inside function definitions in `src/api.ts`):
  - `fetchUserUsage`: Metrics call; volatile usage data.
  - `fetchTeamSpend`: Metrics call; team spending data.
- **Skipped**:
  - `fetchUserMe`, `fetchTeams`, `fetchTeamDetails`: Stable; use caching instead.

## 3. Caching Mechanism

### Design

- **Storage**: Use `context.globalState` for persistence across sessions (VS Code's secure key-value store).
- **Validity Check**: Each cache entry includes a timestamp; invalidate if older than 24 hours (86,400,000ms).
- **Usage Flow**:
  - Before API call: Check for valid cache; if present and valid, use on failure.
  - On success: Update cache with response and new timestamp.
- **Clearing Triggers** (to handle changes in auth/team context):
  - **Manual**: On `forceRefresh` command: Clear all caches.
  - **Cookie Update**: On successful `insertCookie`: Clear all caches (new session invalidates user/team data).
  - **Team ID Update**: On `setTeamId` or `onDidChangeConfiguration` for `cursorUsage.teamId`: Clear team-related caches (cachedTeams, cachedTeamDetails).
  - **Re-login or IDE Relaunch**: In `activate`:
    - Compute SHA-256 hash of current cookie (using Node's `crypto` module).
    - Compare with stored "lastKnownCookieHash" and "lastKnownTeamId" from globalState.
    - If mismatch or missing (e.g., cookie changed due to re-login), clear all caches.
    - After successful fetches, update lastKnown values.
  - This implicitly handles relaunches (activate runs on load) and logins (cookie change detection).

### Caching Implementation Details

- **Cache Helpers** (add to `src/extension.ts`):
  - `async function getCached<T>(key: string): Promise<{ data: T; timestamp: number } | null> { ... }` (check validity).
  - `async function setCached<T>(key: string, data: T): Promise<void> { ... }` (store with timestamp).
  - `async function clearCached(keys: string[]): Promise<void> { ... }` (bulk clear).
- **Applied To** (wrap calls in `refreshUsage` and `getTeamId`):
  - `fetchUserMe`: Cache as "cachedUserMe".
  - `fetchTeams`: Cache as "cachedTeams".
  - `fetchTeamDetails`: Cache as "cachedTeamDetails_{teamId}".
- **Hashing**: `import * as crypto from 'crypto';` in `extension.ts`.
  - `function hashCookie(cookie: string): string { return crypto.createHash('sha256').update(cookie).digest('hex'); }`

## 4. Notification Blocking on Failure

- **Logic Enhancement**: In `refreshUsage`, if `userUsage` remains null after retries, ensure status bar shows error and `getUsageStats` returns null.
- **In `checkAndSendNotification`**: If `usageStats === null`, skip both tray and OS sends but increment attempts (for existing retry system).
- **Integration with Retries/Caching**: Failures in cached calls use cache fallback; metrics failures (post-retries) trigger blockage.

## 5. Changes Summary

- **src/api.ts** (New: ~30 lines):
  - Add `withRetry`.
  - Wrap `fetchUserUsage` and `fetchTeamSpend`.
- **src/extension.ts** (Updates: ~50 lines):
  - Import crypto.
  - Add cache helpers and hashing function.
  - Wrap non-metrics calls with caching.
  - Update `activate`, `insertCookie`, `setTeamId`, `forceRefresh`, and config listener for cache clearing.
  - Minor logs (e.g., "Cache hit for userMe", "Clearing caches on cookie change").
- **No Changes**: Tests, statusBar.ts (but run suite post-impl to verify).

## 6. Risks and Mitigations

- **Stale Cache**: Mitigated by 24h expiration, event-based clearing, and manual force refresh.
- **Performance Overhead**: Short retries/caching reduce calls; negligible impact.
- **Crypto Dependency**: Node's built-in; if issues, fallback to no hashing (just compare teamId, skip cookie check).
- **Test Coverage**: After impl, run tests; add stubs for withRetry if mocks fail. Update any failure simulation tests.

## 7. Test Cases

Test cases are documented in [comprehensive-test-cases.md](comprehensive-test-cases.md)
