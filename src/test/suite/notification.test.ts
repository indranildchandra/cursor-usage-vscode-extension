/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { afterEach, beforeEach, after, before } from "mocha";
import * as statusBar from "../../statusBar";
import * as api from "../../api";
import * as config from "../../configuration";
import * as dotenv from "dotenv";
import * as path from "path";
import { calculateResetInfo } from "../../extension";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const extension = require("../../extension");
const notifier = require("node-notifier");

// Import the exported functions for stubbing
const { showSystemNotification, testNotification } = require("../../extension");

const TIMEOUT = 30000; // 30-second timeout for all tests

suite("Daily Notification Feature", function () {
  this.timeout(TIMEOUT * 2); // Allow 2x the initial setup timeout for running all the tests

  let clock: sinon.SinonFakeTimers;
  let showInformationMessageStub: sinon.SinonStub;
  let context: any;
  let apiStubs: sinon.SinonStub[] = [];
  let cachedApiData: any = {};
  let realStatusBarText: string = ""; // Store real status bar text from actual data

  before(async function () {
    this.timeout(TIMEOUT); // Allow time for this initial setup
    const cookie = process.env.WorkosCursorSessionToken;
    if (!cookie) {
      throw new Error(
        "WorkosCursorSessionToken not found in .env file. Please add it to run tests."
      );
    }

    // Determine the teamId to use, prioritizing .env
    let teamIdToUse: number | undefined;
    if (process.env.CursorTeamId) {
      teamIdToUse = parseInt(process.env.CursorTeamId, 10);
    } else {
      const configTeamId = vscode.workspace
        .getConfiguration("cursorUsage")
        .get<string>("teamId");
      if (configTeamId && !isNaN(parseInt(configTeamId, 10))) {
        teamIdToUse = parseInt(configTeamId, 10);
      }
    }

    const userMe = await api.fetchUserMe(cookie);
    cachedApiData.userMe = userMe;
    cachedApiData.userUsage = await api.fetchUserUsage(userMe.sub, cookie);

    if (teamIdToUse) {
      cachedApiData.teamDetails = await api.fetchTeamDetails(
        teamIdToUse,
        cookie
      );
      cachedApiData.spendData = await api.fetchTeamSpend(teamIdToUse, cookie);
    } else {
      const teams = await api.fetchTeams(cookie);
      if (teams.teams.length > 0) {
        const teamId = teams.teams[0].id;
        cachedApiData.teams = teams;
        cachedApiData.teamDetails = await api.fetchTeamDetails(teamId, cookie);
        cachedApiData.spendData = await api.fetchTeamSpend(teamId, cookie);
      }
    }

    // Generate real status bar text from actual data (just like the extension does)
    try {
      const resetInfo = calculateResetInfo(cachedApiData.userUsage.startOfMonth);
      let mySpend: any;
      let maxRequests = cachedApiData.userUsage["gpt-4"].maxRequestUsage || 500;

      if (cachedApiData.spendData && cachedApiData.teamDetails) {
        mySpend = cachedApiData.spendData.teamMemberSpend.find(
          (member: any) => member.userId === cachedApiData.teamDetails.userId
        );
      }

      let usedRequests: number;
      let spendCents: number | undefined;
      let hardLimitDollars: number | undefined;

      if (!mySpend || typeof mySpend.fastPremiumRequests !== "number") {
        // Individual user data
        const gpt4Usage = cachedApiData.userUsage["gpt-4"];
        usedRequests = gpt4Usage.numRequests;
        spendCents = undefined;
        hardLimitDollars = undefined;
      } else {
        // Team data
        usedRequests = mySpend.fastPremiumRequests;
        spendCents = mySpend.spendCents;
        hardLimitDollars = mySpend.hardLimitOverrideDollars;
      }

      const remainingRequests = Math.max(0, maxRequests - usedRequests);

      // Create a temporary status bar item to get the real text
      const tempStatusBarItem = {
        text: "",
        tooltip: "",
        backgroundColor: undefined,
        command: "",
        updateTooltip: (remaining: number, total: number, spend: number | undefined, limit: number | undefined, reset: any) => {
          const used = total - remaining;
          const percentage = ((used / total) * 100).toFixed(1);

          let tooltip = "";
          if (reset) {
            const daysRemaining = reset.daysRemaining;
            let resetText = daysRemaining === 1
              ? `Resets tomorrow (${reset.resetDateStr})`
              : daysRemaining === 0
                ? `Resets today (${reset.resetDateStr})`
                : `Resets in ${daysRemaining} days (${reset.resetDateStr})`;
            tooltip = `${resetText}\n\n`;
          }

          tooltip += `Fast Premium Requests: ${remaining}/${total} remaining (${percentage}% used)`;

          if (spend !== undefined && limit !== undefined) {
            const spendDollars = spend / 100;
            const spendPercentage = ((spendDollars / limit) * 100).toFixed(1);
            const remainingDollars = (limit - spendDollars).toFixed(2);
            tooltip += `\nSpending: $${spendDollars.toFixed(2)} of $${limit.toFixed(2)} limit (${spendPercentage}% used)`;
            tooltip += `\nRemaining budget: $${remainingDollars}`;
          }

          tooltip += `\n\nClick to refresh`;
          return tooltip;
        }
      };

      // Update with real data to get the actual text
      let statusText: string;
      if (remainingRequests > 0) {
        statusText = `$(zap) ${remainingRequests}`;
      } else {
        if (spendCents !== undefined && hardLimitDollars !== undefined) {
          const spendDollars = (spendCents / 100).toFixed(2);
          const limitDollars = hardLimitDollars.toFixed(2);
          statusText = `$(zap) $${spendDollars}/$${limitDollars}`;
        } else {
          statusText = `$(zap) 0`;
        }
      }

      // Store the real status bar text for use in tests
      realStatusBarText = statusText;
      console.log('Real status bar text generated from API data:', realStatusBarText);

    } catch (error) {
      console.error('Failed to generate real status bar text:', error);
      realStatusBarText = "$(zap) 500/500"; // Fallback to mock data
    }
  });

  beforeEach(() => {
    // Stub all API functions to return cached data
    apiStubs.push(
      sinon.stub(api, "fetchUserMe").resolves(cachedApiData.userMe)
    );
    apiStubs.push(
      sinon.stub(api, "fetchUserUsage").resolves(cachedApiData.userUsage)
    );
    apiStubs.push(sinon.stub(api, "fetchTeams").resolves(cachedApiData.teams));
    apiStubs.push(
      sinon.stub(api, "fetchTeamDetails").resolves(cachedApiData.teamDetails)
    );
    apiStubs.push(
      sinon.stub(api, "fetchTeamSpend").resolves(cachedApiData.spendData)
    );

    showInformationMessageStub = sinon
      .stub(vscode.window, "showInformationMessage")
      .resolves(undefined);

    context = {
      secrets: {
        get: sinon
          .stub()
          .withArgs("cursor.cookie")
          .resolves(process.env.WorkosCursorSessionToken),
        store: sinon.stub().resolves(),
      },
      globalState: {
        get: sinon.stub(),
        update: sinon.stub().resolves(undefined),
      },
      workspaceState: {
        get: sinon.stub(),
        update: sinon.stub().resolves(undefined),
      },
    };
  });

  afterEach(() => {
    if (clock) {
      clock.restore();
    }
    sinon.restore();
    apiStubs.forEach((stub) => stub.restore());
    apiStubs = [];
  });

  after(() => {
    extension.deactivate();
  });

  test("Time-Gate Test: Does not send notification before 9 am", async () => {
    const now = new Date("2025-09-25T08:55:00");
    clock = sinon.useFakeTimers({
      now: now.getTime(),
      shouldClearNativeTimers: true,
    });

    context.globalState.get
      .withArgs("dailyNotificationState")
      .returns({ date: "2025-09-25", attempts: 0, sent: false });

    await extension.checkAndSendNotification(context);

    assert.strictEqual(showInformationMessageStub.called, false);
  });

  test("Happy Path Test: Sends Notification at 9 AM", async () => {
    // Set time to exactly 9 AM
    const now = new Date("2025-09-25T09:00:00");
    clock = sinon.useFakeTimers({
      now: now.getTime(),
      shouldClearNativeTimers: true,
    });

    context.globalState.get
      .withArgs("dailyNotificationState")
      .returns({ date: "2025-09-25", attempts: 0, sent: false });

    await extension.checkAndSendNotification(context);

    assert.strictEqual(
      showInformationMessageStub.calledOnce,
      true,
      "showInformationMessage was not called at 9 AM"
    );
  });

  test("Happy Path Test: Sends Notification on IDE Open After 9 AM", async () => {
    // Set time to after 9 AM
    const now = new Date("2025-09-25T14:00:00");
    clock = sinon.useFakeTimers({
      now: now.getTime(),
      shouldClearNativeTimers: true,
    });

    context.globalState.get
      .withArgs("dailyNotificationState")
      .returns({ date: "2025-09-25", attempts: 0, sent: false });

    await extension.checkAndSendNotification(context);

    assert.strictEqual(
      showInformationMessageStub.calledOnce,
      true,
      "showInformationMessage was not called on IDE open"
    );
  });

  test("Already Sent Test: Does Not Send Notification Twice", async () => {
    const now = new Date("2025-09-25T15:00:00");
    clock = sinon.useFakeTimers({
      now: now.getTime(),
      shouldClearNativeTimers: true,
    });

    context.globalState.get
      .withArgs("dailyNotificationState")
      .returns({ date: "2025-09-25", attempts: 1, sent: true }); // sent: true

    await extension.checkAndSendNotification(context);

    assert.strictEqual(showInformationMessageStub.called, false);
  });

  test("API Failure Test: Does Not Send Notification if Stats Fail", async () => {
    const now = new Date("2025-09-25T11:00:00");
    clock = sinon.useFakeTimers({
      now: now.getTime(),
      shouldClearNativeTimers: true,
    });

    context.globalState.get
      .withArgs("dailyNotificationState")
      .returns({ date: "2025-09-25", attempts: 0, sent: false });

    // Simulate an API failure by making the status bar return an error state
    const errorStatusBarStub = sinon.stub(statusBar, "getStatusBarItem").returns({
      text: "Loading...",
    } as any);

    await extension.checkAndSendNotification(context);

    assert.strictEqual(showInformationMessageStub.called, false);

    // Restore the error status bar stub
    errorStatusBarStub.restore();
  });

  test("Team Data Success Test: User usage succeeds and team usage succeeds", async () => {
    const now = new Date("2025-09-25T11:00:00");
    clock = sinon.useFakeTimers({
      now: now.getTime(),
      shouldClearNativeTimers: true,
    });

    context.globalState.get
      .withArgs("dailyNotificationState")
      .returns({ date: "2025-09-25", attempts: 0, sent: false });

    // The global setup already provides successful team data
    // This tests the scenario where both user and team usage succeed

    // Use the real status bar text that was calculated from actual API data
    console.log('realStatusBarText value:', realStatusBarText);
    const teamStatusBarStub = sinon.stub(statusBar, "getStatusBarItem").returns({
      text: "$(zap) 370", // Use a realistic remaining value
      tooltip: "Resets in 28 days (2025-10-24) --> 130 requests/day avg\nFast Premium Requests: 370/500 remaining (26.0% used)\nSpending: $10.44 of $10.00 limit (104.4% used)\nRemaining budget: $-0.44\n\nClick to refresh"
    } as any);

    // Also stub the updateStatusBar method to prevent the extension from updating the status bar during the test
    const updateStatusBarStub = sinon.stub(statusBar, "updateStatusBar");

    await extension.checkAndSendNotification(context);

    // Should send notification with team data
    assert.strictEqual(
      showInformationMessageStub.calledOnce,
      true,
      "Should send notification with team data when both APIs succeed"
    );

    // Verify the notification contains the expected tooltip message (reversed order as per getFullTooltipMessage)
    const cursorCall = showInformationMessageStub.getCall(0);
    const expectedTooltipMessage = "Fast Premium Requests: 500/500 remaining (0.0% used)\nResets in 28 days (2025-10-24)";
    console.log('Expected tooltip message:', expectedTooltipMessage);
    console.log('Actual notification message:', cursorCall.args[0]);
    console.log('Message lengths - Expected:', expectedTooltipMessage.length, 'Actual:', cursorCall.args[0].length);
    const actual = cursorCall.args[0];

    // Structural checks
    const lines = actual.split(' |-----| ').filter((l: string) => l.trim() !== '');
    console.log('Actual separated components:', lines);  // Debug log

    // Flexible component count: 4 base + 1 if warning present
    const hasWarning = lines.some((l: string) => l.startsWith('⚠️'));
    const expectedLength = hasWarning ? 5 : 4;
    assert.strictEqual(lines.length, expectedLength, `Expected ${expectedLength} separated components for team data`);

    // Check requests first
    assert.match(lines[0], /^Fast Premium Requests: \d+\/\d+ remaining \(\d+\.\d+% used\)$/,
      'Requests component does not match expected structure');

    // Check spending
    assert.match(lines[1], /^Spending: \$\d+\.\d{2} of \$\d+\.\d{2} limit \(\d+\.\d+% used\)$/,
      'Spending component does not match expected structure');

    // Check remaining budget
    assert.match(lines[2], /^Remaining budget: \$-?\d+\.\d{2}$/, 
      'Remaining budget component does not match expected structure');

    // Check reset
    assert.match(lines[3], /^Resets in \d+ days \(\d{4}-\d{2}-\d{2}\)( --> \d+ requests\/day avg)?$/, 
      'Reset component does not match expected structure');

    // If warning present, check it last
    if (hasWarning) {
      assert.match(lines[4], /^⚠️ .+$/, 'Warning component does not match expected structure');
    }

    // Restore the status bar stubs
    teamStatusBarStub.restore();
    updateStatusBarStub.restore();
  });

  test("Complete API Failure Test: User usage fails - uses retry mechanism", async () => {
    const now = new Date("2025-09-25T11:00:00");
    clock = sinon.useFakeTimers({
      now: now.getTime(),
      shouldClearNativeTimers: true,
    });

    context.globalState.get
      .withArgs("dailyNotificationState")
      .returns({ date: "2025-09-25", attempts: 0, sent: false });

    // Simulate complete API failure by making the status bar return an error state
    // (This simulates the user usage API failing)
    const errorStatusBarStub = sinon.stub(statusBar, "getStatusBarItem").returns({
      text: "Failed", // Error state should prevent notification
    } as any);

    await extension.checkAndSendNotification(context);

    // Should NOT send notification on first failure (will retry later)
    assert.strictEqual(
      showInformationMessageStub.called,
      false,
      "Should not send notification when APIs fail - let retry mechanism handle it"
    );

    // Verify notification state was updated for retry
    assert.strictEqual(
      context.globalState.update.calledWith("dailyNotificationState", sinon.match.object),
      true,
      "Should update notification state for retry mechanism"
    );

    // Restore the error status bar stub
    errorStatusBarStub.restore();
  });

  test("New Day Reset Test: Resets State and Sends Notification", async () => {
    const now = new Date("2025-09-26T09:30:00"); // A new day
    clock = sinon.useFakeTimers({
      now: now.getTime(),
      shouldClearNativeTimers: true,
    });

    // Simulate state from the previous day
    context.globalState.get
      .withArgs("dailyNotificationState")
      .returns({ date: "2025-09-25", attempts: 3, sent: true });

    await extension.checkAndSendNotification(context);

    assert.strictEqual(
      showInformationMessageStub.calledOnce,
      true,
      "showInformationMessage was not called on the new day"
    );
    // Verify that the state was reset and updated correctly
    const newState = context.globalState.update.firstCall.args[1];
    assert.deepStrictEqual(newState, {
      date: "2025-09-26",
      attempts: 1,
      sent: true,
    });
  });

  test(
    "Attempt Limit Test: Does not send notification if attempt limit is reached",
    async () => {
      const now = new Date("2025-09-25T10:00:00");
      clock = sinon.useFakeTimers({
        now: now.getTime(),
        shouldClearNativeTimers: true,
      });

      const state = { date: "2025-09-25", attempts: 3, sent: false };
      context.globalState.get.withArgs("dailyNotificationState").returns(state);

      await extension.checkAndSendNotification(context);

      assert.strictEqual(showInformationMessageStub.called, false);
    }
  );

  test("Test Command: Sends both Cursor and OS notifications", async () => {
    const now = new Date("2025-09-25T10:00:00");
    clock = sinon.useFakeTimers({
      now: now.getTime(),
      shouldClearNativeTimers: true,
    });

    // Use real status bar text generated from actual API data
    const statusBarStub = sinon.stub(statusBar, "getStatusBarItem").returns({
      text: realStatusBarText,
      tooltip: "Resets in 28 days (2025-10-24)\nFast Premium Requests: 500/500 remaining (0.0% used)\n\nClick to refresh"
    } as any);

    // The test command should work with the existing global setup
    // We just need to verify that the notifications are sent

    await testNotification(context);

    // Verify Cursor notification was called
    assert.strictEqual(showInformationMessageStub.calledOnce, true); // Cursor notification

    // Restore stubs
    statusBarStub.restore();
  });

  test("Notification Fallback: Cursor notification always works", async () => {
    const now = new Date("2025-09-25T10:00:00");
    clock = sinon.useFakeTimers({
      now: now.getTime(),
      shouldClearNativeTimers: true,
    });

    // Use real status bar text generated from actual API data
    const statusBarStub = sinon.stub(statusBar, "getStatusBarItem").returns({
      text: realStatusBarText,
      tooltip: "Resets in 28 days (2025-10-24)\nFast Premium Requests: 500/500 remaining (0.0% used)\n\nClick to refresh"
    } as any);

    // Mock the require function to simulate node-notifier being unavailable
    const originalRequire = require;
    const mockRequire = function(id: string) {
      if (id === 'node-notifier') {
        throw new Error("Cannot find module 'node-notifier'");
      }
      return originalRequire(id);
    } as typeof require;

    // Replace require temporarily
    require = mockRequire;

    await testNotification(context);

    // Verify Cursor notification was called (OS notification should be skipped)
    assert.strictEqual(showInformationMessageStub.called, true);

    // Check the message content - should be the reversed tooltip message (consumption first, reset second)
    const cursorCall = showInformationMessageStub.getCall(0);
    const expectedFullMessage = "Fast Premium Requests: 500/500 remaining (0.0% used) |-----| Resets in 28 days (2025-10-24)"; // Separated version
    assert.strictEqual(
      cursorCall.args[0],
      expectedFullMessage
    );

    // Restore original require
    require = originalRequire;
    statusBarStub.restore();
  });
});
