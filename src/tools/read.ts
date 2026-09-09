/** 读 tools：查 bug 详情、列产品 bug、搜索。全部 readOnlyHint。 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ZentaoClient, formatZentaoError } from "../zentao-client.js";
import { CHARACTER_LIMIT } from "../constants.js";

function pickAccount(v: unknown): string {
  if (!v) return "";
  if (typeof v === "object") return (v as any).account || (v as any).realname || "";
  return String(v);
}
function pickRealname(v: unknown): string {
  if (!v) return "";
  if (typeof v === "object") return (v as any).realname || (v as any).account || "";
  return String(v);
}
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
function slimBug(bug: any, includeSteps = false) {
  return {
    id: bug.id,
    title: bug.title,
    status: bug.status,
    severity: bug.severity,
    pri: bug.pri,
    product: bug.product,
    branch: bug.branch,
    assignedTo: pickAccount(bug.assignedTo),
    assignedToName: pickRealname(bug.assignedTo),
    openedBy: pickAccount(bug.openedBy),
    openedByName: pickRealname(bug.openedBy),
    openedDate: bug.openedDate,
    resolution: bug.resolution || "",
    resolvedBy: pickAccount(bug.resolvedBy),
    ...(includeSteps ? { steps: stripHtml(String(bug.steps || "")) } : {}),
  };
}

function jsonResult(obj: unknown) {
  let text = JSON.stringify(obj, null, 2);
  if (text.length > CHARACTER_LIMIT) {
    text = text.slice(0, CHARACTER_LIMIT) + "\n…(已截断，请用分页/过滤缩小范围)";
  }
  return { content: [{ type: "text" as const, text }], structuredContent: obj as Record<string, unknown> };
}
function errResult(e: unknown) {
  return { content: [{ type: "text" as const, text: formatZentaoError(e) }], isError: true };
}

export function registerReadTools(server: McpServer, client: ZentaoClient): void {
  server.registerTool(
    "zentao_get_bug",
    {
      title: "获取禅道 Bug 详情",
      description: `按 ID 获取单条禅道 Bug 的完整信息，含重现步骤(steps)。

Args:
  - id (number): Bug 的数字 ID
  - include_steps (boolean): 是否包含 steps 纯文本，默认 true

Returns: { id, title, status, severity, pri, product, assignedTo, openedBy, openedDate, resolution, steps? }

只读，不修改任何数据。`,
      inputSchema: {
        id: z.number().int().positive().describe("Bug 的数字 ID"),
        include_steps: z.boolean().default(true).describe("是否包含重现步骤纯文本"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ id, include_steps }) => {
      try {
        const bug = await client.getBug(id);
        return jsonResult(slimBug(bug, include_steps));
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    "zentao_list_bugs",
    {
      title: "列出产品下的 Bug",
      description: `列出某产品下的 Bug，服务端分页。可选按状态/指派人过滤。

Args:
  - product (number): 产品 ID
  - limit (number): 每页条数 1-200，默认 50
  - page (number): 页码，从 1 开始，默认 1
  - status ('active'|'resolved'|'closed'): 可选
  - assigned_to (string): 可选，按指派人 account 过滤当前页

Returns: { product, page, limit, total, count, bugs: [...], has_more }

只读。禅道返回的 total 可能不准（随 limit 变），以翻页实际列出为准。`,
      inputSchema: {
        product: z.number().int().positive().describe("产品 ID"),
        limit: z.number().int().min(1).max(200).default(50).describe("每页条数"),
        page: z.number().int().min(1).default(1).describe("页码，从 1 开始"),
        status: z
          .enum(["all", "active", "resolved", "closed"])
          .default("all")
          .describe("按状态过滤，默认 all。注意默认不传时禅道只返回很窄的子集"),
        assigned_to: z.string().optional().describe("按指派人 account 过滤"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ product, limit, page, status, assigned_to }) => {
      try {
        const params: Record<string, unknown> = { status, limit, page };
        if (assigned_to) params.assignedTo = assigned_to;
        const data: any = await client.listProductBugs(product, params);
        let bugs: any[] = Array.isArray(data?.bugs) ? data.bugs : [];
        if (assigned_to) bugs = bugs.filter((b) => pickAccount(b.assignedTo) === assigned_to);
        const total = Number(data?.total ?? bugs.length);
        const out = {
          product,
          page,
          limit,
          total,
          count: bugs.length,
          bugs: bugs.map((b) => slimBug(b, false)),
          has_more: total > page * limit,
          ...(total > page * limit ? { next_page: page + 1 } : {}),
        };
        return jsonResult(out);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    "zentao_search_bugs",
    {
      title: "搜索产品下的 Bug",
      description: `在某产品下按关键词搜索 Bug（匹配标题与 steps）。底层拉取分页列表后客户端过滤。

Args:
  - product (number): 产品 ID
  - keyword (string): 关键词
  - scan_limit (number): 最多扫描多少条(分页累加)，默认 200，上限 1000

Returns: { product, keyword, scanned, matched, bugs: [...] }

只读。命中范围受 scan_limit 限制，必要时调大。`,
      inputSchema: {
        product: z.number().int().positive().describe("产品 ID"),
        keyword: z.string().min(1).describe("搜索关键词"),
        scan_limit: z.number().int().min(1).max(1000).default(200).describe("最多扫描条数"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ product, keyword, scan_limit }) => {
      try {
        const pageSize = 100;
        const collected: any[] = [];
        let page = 1;
        let total = Infinity;
        while (collected.length < scan_limit && (page - 1) * pageSize < total) {
          const data: any = await client.listProductBugs(product, { status: "all", limit: pageSize, page });
          total = Number(data?.total ?? 0);
          const bugs: any[] = Array.isArray(data?.bugs) ? data.bugs : [];
          if (bugs.length === 0) break;
          collected.push(...bugs);
          page += 1;
        }
        const scanned = collected.slice(0, scan_limit);
        const kw = keyword.toLowerCase();
        const matched = scanned.filter(
          (b) =>
            String(b.title || "").toLowerCase().includes(kw) ||
            stripHtml(String(b.steps || "")).toLowerCase().includes(kw),
        );
        return jsonResult({
          product,
          keyword,
          scanned: scanned.length,
          total_in_product: total === Infinity ? scanned.length : total,
          matched: matched.length,
          bugs: matched.map((b) => slimBug(b, false)),
        });
      } catch (e) {
        return errResult(e);
      }
    },
  );
}
