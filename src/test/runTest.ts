import * as path from "path";
// @ts-ignore - @vscode/test-electron doesn't have proper type definitions
const { runTests } = require("@vscode/test-electron");

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Try to use Cursor first, fall back to VS Code
    let vscodeExecutablePath;
    try {
      // Check if Cursor is installed
      const { execSync } = require("child_process");
      vscodeExecutablePath = execSync("which cursor", { encoding: "utf8" }).trim();
      console.log("Using Cursor for testing:", vscodeExecutablePath);
    } catch (error) {
      // Fall back to VS Code
      try {
        const { execSync } = require("child_process");
        vscodeExecutablePath = execSync("which code", { encoding: "utf8" }).trim();
        console.log("Using VS Code for testing:", vscodeExecutablePath);
      } catch (error2) {
        console.log("Using system VS Code/Cursor installation");
      }
    }

    // Use the system's VS Code/Cursor installation with verbose output
    console.log("Starting test suite...");
    console.log("Extension path:", extensionDevelopmentPath);
    console.log("Test files:", extensionTestsPath);
    console.log("Using:", vscodeExecutablePath || "System VS Code/Cursor");

    // For CI/headless environments, we can run without launching GUI
    // But for local development, we want to see the debug output
    const isCI = process.env.CI === 'true';
    const shouldLaunchGUI = !isCI;

    if (isCI) {
      console.log("Running in CI mode - using headless testing");
    } else {
      console.log("Running with GUI - check the launched Cursor / VS Code instance for detailed test output");
    }

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      // Use a shorter user data directory to avoid path length issues
      launchArgs: [
        "--user-data-dir",
        "./.vscode-test/user-data",
        "--extensions-dir",
        "./.vscode-test/extensions"
      ]
    });

    if (isCI) {
      console.log("All tests completed successfully in CI mode!");
    } else {
      console.log("All tests completed successfully!");
      console.log("Check the launched Cursor/VS Code instance's Debug Console for detailed test results");
    }
  } catch (err) {
    console.error("Failed to run tests:", err);
    process.exit(1);
  }
}

main();
