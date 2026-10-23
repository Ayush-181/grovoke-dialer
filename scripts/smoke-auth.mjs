import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const scenario = process.argv[2] ?? "auth";
if (!["auth", "leads", "remake", "remake-export", "remake-workflows"].includes(scenario))
  throw new Error("Unknown smoke scenario");
const session = `grovoke-smoke-${scenario}`;
const cli = resolve(".tools/playwright/node_modules/@playwright/cli/playwright-cli.js");
if (!existsSync(cli)) throw new Error("Install the pinned CLI using docs/codex-workflow.md.");
mkdirSync(".playwright-cli", { recursive: true });
function run(args) {
  const result = spawnSync(process.execPath, [cli, `-s=${session}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  process.stdout.write(output);
  if (result.error) throw result.error;
  // CLI may print a tool error while exiting zero.
  if (result.status !== 0 || /^### Error/m.test(output)) throw new Error("Smoke CLI failed");
  return output;
}
let failed = false;
try {
  run(["open", "about:blank", "--config=.playwright/cli.config.json"]);
  const code = readFileSync(
    `scripts/smoke-${scenario === "remake-export" ? "remake" : scenario}.js`,
    "utf8",
  )
    .trim()
    .replace(/;$/, "")
    .replaceAll(
      "127.0.0.1:4174",
      scenario === "remake-export" ? "127.0.0.1:4175" : "127.0.0.1:4174",
    );
  const output = run(["run-code", code]);
  if (scenario.startsWith("remake") && !/^### Result\r?\n"PASS: isolated remake/m.test(output))
    throw new Error("Remake smoke did not return a completed result");
  if (
    !output.includes(
      scenario === "auth"
        ? "PASS: anonymous auth controls"
        : scenario === "leads"
          ? "PASS: synthetic lead workspace"
          : "PASS: isolated remake",
    )
  )
    throw new Error("Smoke assertions did not complete");
} catch (error) {
  failed = true;
  console.error(error.message);
} finally {
  try {
    run(["close"]);
  } catch {
    failed = true;
  }
}
if (failed) process.exitCode = 1;
