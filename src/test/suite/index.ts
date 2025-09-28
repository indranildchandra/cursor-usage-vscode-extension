import * as path from "path";
import Mocha from "mocha";
import glob from "glob";

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    reporter: "list", // Use list reporter for cleaner command-line output
    timeout: 60000, // Increase timeout for integration tests
    grep: process.env.TEST_GREP, // Allow filtering tests via environment variable
  });

  const testsRoot = path.resolve(__dirname, "..");

  return new Promise((c, e) => {
    glob(
      "**/**.test.js",
      { cwd: testsRoot },
      (err: Error | null, files: string[]) => {
        if (err) {
          return e(err);
        }

        // Add files to the test suite
        files.forEach((f) => {
          console.log(`Adding test file: ${f}`);
          mocha.addFile(path.resolve(testsRoot, f));
        });

        try {
          // Run the mocha test with verbose output
          console.log(`\nRunning ${files.length} test files...`);
          console.log("=".repeat(50));

          mocha.run((failures) => {
            console.log("=".repeat(50));
            if (failures > 0) {
              console.error(`${failures} test(s) failed.`);
              console.error("Check the VS Code/Cursor instance that was launched for detailed test output.");
              e(new Error(`${failures} tests failed.`));
            } else {
              console.log("All tests passed successfully!");
              c();
            }
          });
        } catch (err) {
          console.error("Test execution error:", err);
          e(err);
        }
      },
    );
  });
}
