#!/usr/bin/env node
/**
 * @dannyvan/zentao-mcp
 *
 * 禅道 MCP + CLI，直连 REST API（api.php/v1）。
 * 读：get_bug / list_bugs / search_bugs
 * 写：comment_bug（v1 不支持，会报错）、resolve/close/activate/confirm/assign（默认 dry-run）
 *
 * 认证（环境变量）：
 *   ZENTAO_URL       禅道地址，必填
 *   ZENTAO_ACCOUNT   账号（推荐）
 *   ZENTAO_PASSWORD  密码（推荐）
 *   ZENTAO_TOKEN     或直接给现成 token（临时/测试，会过期）
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { clientFromEnv } from "./zentao-client.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";
import { runCli } from "./cli.js";
import { skillInstructions } from "./skill.js";

function assertUrl(): void {
  if (!process.env.ZENTAO_URL?.trim()) {
    console.error("ERROR: 缺少 ZENTAO_URL。请设置为禅道地址，例如 https://example.com/zentao");
    process.exit(1);
  }
}

function assertAuth(): void {
  const hasToken = !!process.env.ZENTAO_TOKEN;
  const hasUserPass = !!(process.env.ZENTAO_ACCOUNT && process.env.ZENTAO_PASSWORD);
  if (!hasToken && !hasUserPass) {
    console.error(
      "ERROR: 缺少认证。请设置 ZENTAO_TOKEN，或同时设置 ZENTAO_ACCOUNT 与 ZENTAO_PASSWORD。",
    );
    process.exit(1);
  }
}

async function serve(): Promise<void> {
  assertUrl();
  assertAuth();
  const server = new McpServer(
    { name: "zentao-mcp", version: "0.1.3" },
    { instructions: skillInstructions() },
  );
  const client = clientFromEnv();
  registerReadTools(server, client);
  registerWriteTools(server, client);
  await server.connect(new StdioServerTransport());
  console.error("zentao-mcp running via stdio");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "serve") {
    await serve();
    return;
  }
  const needsAuth = !["help", "--help", "-h", "skill", "install-skill"].includes(argv[0]);
  if (needsAuth) {
    assertUrl();
    assertAuth();
  }
  await runCli(argv);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
