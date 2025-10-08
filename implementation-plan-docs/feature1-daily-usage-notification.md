# **Feature Implementation Plan: Daily Usage Notification**

## **NOTICE: This Document is Superseded**

**This original implementation plan has been superseded by the more comprehensive fault tolerance and caching implementation documented in:**

- `implementation-plan-docs/fault-tolerance-and-caching-spec.md` - Core implementation specification
- `implementation-plan-docs/comprehensive-test-cases.md` - Complete test coverage documentation

The actual implementation evolved significantly beyond this original plan to include retry mechanisms, caching, enhanced error handling, and status bar timestamp features.

---

## **1. Introduction**

This document outlines the **original** plan to implement a new feature in the `cursor-usage-vscode-extension`. The feature will provide users with a daily notification displaying their current Cursor usage statistics --> and display the exact message that they see in the Status Bar.

This final plan incorporates a robust delivery logic:

* The notification will only be sent **after 9 am local time**.
* It includes a "catch-up" feature for users who open their IDE after 9 am.
* To prevent spam, it will **not attempt** to deliver the notification **more than 3 times** in a single day.

***

## **2. High-Level Design**

The core of this feature is a stateful checking mechanism that decides when to trigger a notification.

* **State Management**: We will use a single object in VS Code's `globalState` to track notification status. This object will store the date, the number of delivery attempts for that day, and whether the notification was successfully sent.
* **Logic Encapsulation**: A single function, `checkAndSendNotification`, will contain all the conditional logic:
* Has the notification for today already been sent?
* Have we exceeded the daily attempt limit (3 tries)?
* Is it currently after 9 am?

* **Scheduling & Activation**: A simple scheduler, `initializeNotificationService`, will run the `checkAndSendNotification` function both immediately upon extension activation and on a recurring daily schedule. This ensures all user scenarios (IDE always on, IDE started late, etc.) are covered.

***

## **3. Detailed Implementation Plan**

1. **Define a State Interface**: Create a TypeScript interface for our `globalState` object to ensure type safety. It will look like this:

    ```typescript
    interface NotificationState {
      date: string;       // The date of the last attempt, e.g., "2025-09-25"
      attempts: number;   // Number of delivery attempts for that date
      sent: boolean;      // True if the notification was successfully sent
    }
    ```

2. **Refactor `checkAndSendNotification`**: This function will be the brain of the operation.
    * On execution, it will fetch the current `NotificationState` and the current date.
    * If the stored date is not today, it will reset the state for the new day (`attempts: 0`, `sent: false`).
    * It will then execute a series of checks. It will stop and do nothing if any of the following are true:
        * `state.sent` is `true`.
        * `state.attempts` is `3` or more.
        * The current time is **before 9 am**.
    * If all checks pass, it will increment the `attempts` count and `try` to send the notification.
    * If sending is successful, it will set `sent` to `true`.
    * Finally, it will save the updated state object back to `globalState`.

3. **Keep the Scheduler Simple**: The `initializeNotificationService` function's role remains the same:
    * Call `checkAndSendNotification` once **immediately on startup**.
    * Schedule future checks to run every day at 9 am using `setTimeout` and `setInterval`.

***

## **4. File Changes**

The following file will need to be modified:

* `src/extension.ts`

***

## **5. Code Snippets**

Here is the complete, final code reflecting the robust logic:

```typescript
// src/extension.ts
import * as vscode from 'vscode';

// Define an interface for our state object for type safety
interface NotificationState {
    date: string;
    attempts: number;
    sent: boolean;
}

const NOTIFICATION_STATE_KEY = 'dailyNotificationState';

export function activate(context: vscode.ExtensionContext) {
    // ... existing code

    initializeNotificationService(context);
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

async function checkAndSendNotification(context: vscode.ExtensionContext) {
    const now = new Date();
    const todayStr = now.toLocaleDateString();

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
        const usageStats = await getUsageStats();
        vscode.window.showInformationMessage(`Cursor Daily Usage: ${usageStats}`);
        
        // Mark as sent ONLY on success
        state.sent = true; 
        console.log('Daily usage notification sent successfully.');

    } catch (error) {
        console.error('Failed to send daily usage notification:', error);
    } finally {
        // ALWAYS update the state to save attempt count and sent status
        context.globalState.update(NOTIFICATION_STATE_KEY, state);
    }
}

async function getUsageStats(): Promise<string> {
    // Placeholder for the actual logic to get usage stats
    return "Fast GPT-4: 10/100, Slow GPT-4: 50/500";
}

// ... rest of the file
```

***

## **6. Testing**

Thorough testing is crucial for this logic:

**Time-Gate Test**:

1. Set your system clock to **8:55 am**.
2. Start the extension. **No notification** should appear.
3. Wait until the clock passes **9:00 am**. The notification **should appear**.

**Catch-Up Test**:

1. Set your system clock to **2:00 pm**.
2. Start the extension. The notification **should appear immediately**.
3. Restart the extension. **No new notification** should appear.

**Attempt Limit Test**:

1. Modify getUsageStats()to **always throw an error**.
2. Start the extension after 9 am. No notification will appear, but check theglobalState(or logs) to seeattemptsis1.
3. Restart the extension two more times. After the third restart, attemptsshould be3.
4. On the fourth restart, confirm that the delivery logic is no longer attempted.
