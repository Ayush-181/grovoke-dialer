import { cp, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
const root = process.cwd();
await mkdir(resolve(root, ".smoke-work"), { recursive: true });
const scratch = await mkdtemp(resolve(root, ".smoke-work/complete-build-"));
for (const name of [
  "src",
  "public",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "components.json",
])
  await cp(resolve(root, name), join(scratch, name), { recursive: true });
await symlink(resolve(root, "node_modules"), join(scratch, "node_modules"), "dir");
await writeFile(
  join(scratch, "vite.check.config.ts"),
  `import base from './vite.config';
export default async env => { const config=await(typeof base==='function'?base(env):base); return {...config,resolve:{...config.resolve,preserveSymlinks:true}}; };`,
);
const env = {
  NODE_ENV: "production",
  SUPABASE_URL: "http://127.0.0.1:9",
  SUPABASE_PUBLISHABLE_KEY: "smoke-placeholder",
  VITE_SUPABASE_URL: "http://127.0.0.1:9",
  VITE_SUPABASE_PUBLISHABLE_KEY: "smoke-placeholder",
};
for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
  if (process.env[key]) env[key] = process.env[key];
const child = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/vite/bin/vite.js"),
    "build",
    "--config",
    "vite.check.config.ts",
    "--mode",
    "check",
  ],
  { cwd: scratch, env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", async (code) => {
  process.exitCode = code ?? 1;
  if (code === 0) {
    await cp(join(scratch, "src/routeTree.gen.ts"), resolve(root, "src/routeTree.gen.ts"));
    console.log(`Credential-free full build passed: ${scratch}`);
  }
});
