// 回归：在本包根目录跑 `npx -y @dannyvan/zentao-mcp help` 必须能起来。
// 失败形态是 `sh: zentao-mcp: command not found`（本仓有同名 package.json 时，
// npx 走本地 bin，而 .bin 没链上）。
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const result = spawnSync("npx", ["-y", "@dannyvan/zentao-mcp", "help"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "npx failed\n");
  process.exit(result.status ?? 1);
}
if (!result.stdout.includes("zentao-mcp") || !result.stdout.includes("MCP")) {
  process.stderr.write("unexpected help output\n");
  process.exit(1);
}
console.log("npx-from-pkg-root: ok");
