# Contributing to Cursor Usage

We welcome contributions! This guide will help you get your development environment set up and explain how to run the test suite.

## Development Setup

The development setup is straightforward. Please refer to the "Development Setup" section in the main [README.md](README.md) file for instructions on cloning the repository, installing dependencies, and launching the extension in a development host.

## Running Tests

Our test suite uses a "fetch-once, reuse-many" strategy. This means that the first time you run the tests, the suite will make live API calls to Cursor to fetch realistic data. It then caches this data and uses it for all subsequent test runs, making them fast and reliable.

### 1. Test Configuration (`.env` file)

To run the tests, you must provide your Cursor session token in a `.env` file at the root of the project.

#### **Step 1: Create the `.env` file**

Create a file named `.env` in the root of the project directory.

#### **Step 2: Add Your Credentials**

Add the following keys to your `.env` file and fill in the values:

```text
# Your session token from cursor.com
WorkosCursorSessionToken="YOUR_TOKEN_HERE"

# (Optional) The specific team ID to test against.
# If left blank, the test will fall back to the teamId in your VS Code settings.
CursorTeamId="YOUR_TEAM_ID_HERE"
```

* **`WorkosCursorSessionToken`**: This is required. Follow the instructions in the main `README.md` to retrieve this value from your browser.
* **`CursorTeamId`**: This is optional. If you provide a value, the tests will use it. If you leave it blank, the tests will fall back to using the `teamId` configured in your VS Code settings, which is useful for testing the fallback logic.

### 2. Executing the Test Suite

We use the VS Code debugger to run our tests. This is the most stable and reliable method.

1. Go to the **Run and Debug** panel in VS Code (you can click the icon on the left sidebar that looks like a play button with a bug).
2. In the dropdown at the top, select **"Extension Tests"**.
3. Press the green play button to start debugging.

This will perform the following steps:

* Compile all the extension and test files.
* Launch a new "Extension Development Host" window.
* Run the test suite.

You will see the results of the test run in the **Debug Console** of your main editor window.
