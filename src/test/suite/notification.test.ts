/* eslint-disable @typescript-eslint/no-var-requires */
import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { afterEach, beforeEach, after, before } from "mocha";
import * as statusBar from "../../statusBar";
import * as api from "../../api";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const extension = require("../../extension");

const TIMEOUT = 20000; // 20-second timeout for all tests

suite("Daily Notification Feature", function () {
  this.timeout(TIMEOUT * 2); // Allow 2x the initial setup timeout for running all the tests

  let clock: sinon.SinonFakeTimers;
  let showInformationMessageStub: sinon.SinonStub;
  let context: any;
  let apiStubs: sinon.SinonStub[] = [];
  let cachedApiData: any = {};

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
    sinon.stub(statusBar, "getStatusBarItem").returns({
      text: "Loading...",
    } as any);

    await extension.checkAndSendNotification(context);

    assert.strictEqual(showInformationMessageStub.called, false);
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
});
