import { cp, mkdir, mkdtemp, symlink, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const root = process.cwd();
await mkdir(resolve(root, ".smoke-work"), { recursive: true });
const scratch = await mkdtemp(resolve(root, ".smoke-work/remake-"));
// Explicit source allowlist; no dotenv, authentication, SDKs, credentials or original app.
for (const name of [
  "src/remake",
  "remake",
  "src/lib/booking-time.ts",
  "src/lib/timezones.ts",
  "src/lib/outcomes.ts",
  "src/lib/phone.ts",
]) {
  await mkdir(resolve(scratch, name, ".."), { recursive: true });
  await cp(resolve(root, name), resolve(scratch, name), { recursive: true });
}
await symlink(resolve(root, "node_modules"), join(scratch, "node_modules"), "dir");
const child = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/vite/bin/vite.js"),
    ...(process.argv.includes("--build") || process.argv.includes("--export") ? ["build"] : []),
    "--config",
    "remake/vite.config.ts",
  ],
  {
    cwd: scratch,
    env: {
      PATH: process.env.PATH,
      NODE_ENV:
        process.argv.includes("--build") || process.argv.includes("--export")
          ? "production"
          : "development",
    },
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", async (code) => {
  process.exitCode = code ?? 1;
  if (code !== 0) return;
  if (process.argv.includes("--build") || process.argv.includes("--export"))
    console.log(`Isolated build: ${join(scratch, "dist/remake")}`);
  if (!process.argv.includes("--export")) return;
  try {
    const output = join(scratch, "dist/remake");
    let html = await readFile(join(output, "remake/index.html"), "utf8");
    const script = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
    const stylesheet = html.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);
    if (!script || !stylesheet)
      throw new Error("Unexpected build entry: standalone export not created.");
    const js = await readFile(join(output, script[1].replace(/^\//, "")), "utf8");
    const css = await readFile(join(output, stylesheet[1].replace(/^\//, "")), "utf8");
    html = html
      .replace(
        script[0],
        () => `<script type="module">${js.replaceAll("</script", "<\\/script")}</script>`,
      )
      .replace(stylesheet[0], () => `<style>${css}</style>`)
      .replace(
        "<head>",
        "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'\">",
      );
    const destination = resolve(root, ".smoke-work/callboard-preview.html");
    await writeFile(destination, html);
    console.log(`Standalone preview: ${destination}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
});
