import { cp, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve, join } from "node:path";

const root = process.cwd();
await mkdir(resolve(root, ".smoke-work"), { recursive: true });
const scratch = await mkdtemp(resolve(root, ".smoke-work/run-"));
// Explicit allowlist: never copy dotenv, auth state, or credential files.
for (const item of [
  "src",
  "public",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "components.json",
]) {
  await cp(resolve(root, item), join(scratch, item), { recursive: true });
}
await symlink(
  resolve(root, "node_modules"),
  join(scratch, "node_modules"),
  process.platform === "win32" ? "junction" : "dir",
);
await writeFile(
  join(scratch, ".env.smoke"),
  [
    "VITE_SUPABASE_URL=http://127.0.0.1:9",
    "VITE_SUPABASE_PUBLISHABLE_KEY=smoke-placeholder",
    "",
  ].join("\n"),
);
const env = {};
// Keep linked dependencies under the scratch root so Vite uses one React copy.
// Extend the repository config rather than duplicating Lovable's plugins.
await writeFile(
  join(scratch, "vite.smoke.config.ts"),
  `
import base from "./vite.config";
export default async (env) => {
  const config = await (typeof base === "function" ? base(env) : base);
  return {
    ...config,
    resolve: { ...config.resolve, preserveSymlinks: true },
    server: { ...config.server, hmr: false },
  };
};
`,
);
// Do not inherit TWILIO_*, GOOGLE_*, DATABASE_*, SUPABASE_* or VITE_*.
for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"]) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, {
  NODE_ENV: "development",
  SUPABASE_URL: "http://127.0.0.1:9",
  SUPABASE_PUBLISHABLE_KEY: "smoke-placeholder",
  VITE_SUPABASE_URL: "http://127.0.0.1:9",
  VITE_SUPABASE_PUBLISHABLE_KEY: "smoke-placeholder",
});
const child = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/vite/bin/vite.js"),
    "--config",
    "vite.smoke.config.ts",
    "--mode",
    "smoke",
    "--host",
    "127.0.0.1",
    "--port",
    "4173",
    "--strictPort",
  ],
  { cwd: scratch, env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill());
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
