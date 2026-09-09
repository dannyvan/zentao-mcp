/**
 * CLI 门面 —— 与 MCP 共用同一套 ZentaoClient 与同一套安全约束。
 *
 * 写操作默认 dry-run，必须显式 --confirm 才真正提交。
 * 输出一律 JSON；出错时 JSON 写 stderr，退出码非 0。
 */
import { ZentaoClient, clientFromEnv, formatZentaoError } from "./zentao-client.js";
import { skillInstructions } from "./skill.js";

const USAGE = `zentao-mcp —— 禅道 CLI / MCP 双门面

用法:
  zentao-mcp                          以 MCP server 启动（stdio，默认）
  zentao-mcp serve                    同上，显式写法
  zentao-mcp skill                    打印给 agent 的用法（无需认证）
  zentao-mcp <命令> [参数]             CLI 模式

读命令（无副作用）:
  get-bug <id>                               查单个 Bug
  list-bugs --product <id> [--status <s>] [--limit <n>]
  search-bugs --product <id> --keyword <kw>

写命令（默认仅预览，加 --confirm 才提交）:
  resolve-bug  <id> --resolution <r> [--comment <c>] [--confirm]
  close-bug    <id> [--comment <c>] [--confirm]
  activate-bug <id> [--assigned-to <a>] [--comment <c>] [--confirm]
  confirm-bug  <id> [--assigned-to <a>] [--confirm]
  assign-bug   <id> --assigned-to <a> [--comment <c>] [--confirm]

认证（环境变量）:
  ZENTAO_URL                                 必填，禅道地址
  ZENTAO_ACCOUNT + ZENTAO_PASSWORD           推荐，自动换取并刷新 token
  ZENTAO_TOKEN                               临时/测试，会过期

⚠️ 写操作在禅道可见。批量改状态请串行逐条执行，不要并行。`;

function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return { positional, flags };
}

function out(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function fail(message: string): never {
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
}

function requireId(positional: string[]): number {
  const id = Number(positional[0]);
  if (!Number.isInteger(id) || id <= 0) fail("缺少或非法的 Bug ID（应为正整数）");
  return id;
}

function requireFlag(flags: Record<string, string | boolean>, name: string): string {
  const v = flags[name];
  if (typeof v !== "string" || !v) fail(`缺少必填参数 --${name}`);
  return v;
}

async function highRisk(
  client: ZentaoClient,
  id: number,
  confirm: boolean,
  preview: (bug: any) => string,
  exec: () => Promise<unknown>,
): Promise<void> {
  const bug: any = await client.getBug(id);
  if (!confirm) {
    out({
      ok: true,
      dryRun: true,
      preview: preview(bug),
      bug: { id: bug.id, title: bug.title, status: bug.status },
      hint: "确认无误后加 --confirm 重新执行以真正提交。⚠️ 该操作在禅道可见。",
    });
    return;
  }
  out({ ok: true, dryRun: false, result: await exec() });
}

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }
  if (command === "skill") {
    console.log(skillInstructions());
    return;
  }

  const { positional, flags } = parseArgs(rest);
  const confirm = flags.confirm === true || flags.confirm === "true";
  const client = clientFromEnv();

  try {
    switch (command) {
      case "get-bug":
        out({ ok: true, bug: await client.getBug(requireId(positional)) });
        return;

      case "list-bugs": {
        const product = Number(requireFlag(flags, "product"));
        const params: Record<string, unknown> = { limit: Number(flags.limit ?? 50) };
        if (typeof flags.status === "string") params.status = flags.status;
        out({ ok: true, result: await client.listProductBugs(product, params) });
        return;
      }

      case "search-bugs": {
        const product = Number(requireFlag(flags, "product"));
        const keyword = requireFlag(flags, "keyword");
        out({ ok: true, result: await client.listProductBugs(product, { keyword, limit: Number(flags.limit ?? 50) }) });
        return;
      }

      case "resolve-bug": {
        const id = requireId(positional);
        const resolution = requireFlag(flags, "resolution");
        const comment = typeof flags.comment === "string" ? flags.comment : undefined;
        await highRisk(
          client,
          id,
          confirm,
          (b) => `将把 Bug #${id}「${b.title}」标记为已解决（resolution=${resolution}），当前状态 ${b.status}`,
          () => client.resolveBug(id, { resolution, comment }),
        );
        return;
      }

      case "close-bug": {
        const id = requireId(positional);
        const comment = typeof flags.comment === "string" ? flags.comment : undefined;
        await highRisk(
          client,
          id,
          confirm,
          (b) => `将关闭 Bug #${id}「${b.title}」，当前状态 ${b.status}`,
          () => client.closeBug(id, { comment }),
        );
        return;
      }

      case "activate-bug": {
        const id = requireId(positional);
        const assignedTo = typeof flags["assigned-to"] === "string" ? (flags["assigned-to"] as string) : undefined;
        const comment = typeof flags.comment === "string" ? flags.comment : undefined;
        await highRisk(
          client,
          id,
          confirm,
          (b) => `将激活 Bug #${id}「${b.title}」，当前状态 ${b.status}${assignedTo ? `，指派给 ${assignedTo}` : ""}`,
          () => client.activateBug(id, { comment, assignedTo }),
        );
        return;
      }

      case "confirm-bug": {
        const id = requireId(positional);
        const assignedTo = typeof flags["assigned-to"] === "string" ? (flags["assigned-to"] as string) : undefined;
        await highRisk(
          client,
          id,
          confirm,
          (b) => `将确认 Bug #${id}「${b.title}」，当前状态 ${b.status}${assignedTo ? `，指派给 ${assignedTo}` : ""}`,
          () => client.confirmBug(id, { assignedTo }),
        );
        return;
      }

      case "assign-bug": {
        const id = requireId(positional);
        const assignedTo = requireFlag(flags, "assigned-to");
        const comment = typeof flags.comment === "string" ? flags.comment : undefined;
        await highRisk(
          client,
          id,
          confirm,
          (b) => `将把 Bug #${id}「${b.title}」指派给 ${assignedTo}，当前状态 ${b.status}`,
          () => client.assignBug(id, { assignedTo, comment }),
        );
        return;
      }

      default:
        fail(`未知命令：${command}\n\n${USAGE}`);
    }
  } catch (e) {
    fail(formatZentaoError(e));
  }
}
