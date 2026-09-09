/**
 * 写 tools。分级把关：
 *  - 评论：v1 不支持，调用即报错
 *  - 状态流转：默认 dry-run，带 confirm=true 才真写
 * 写操作在禅道可见。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ZentaoClient, formatZentaoError } from "../zentao-client.js";
import { RESOLUTIONS } from "../constants.js";

function errResult(e: unknown) {
  return { content: [{ type: "text" as const, text: formatZentaoError(e) }], isError: true };
}
function okResult(text: string, structured: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text }], structuredContent: structured };
}

const HIGH_RISK = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

async function highRiskOp(
  client: ZentaoClient,
  id: number,
  confirm: boolean,
  previewLine: (bug: any) => string,
  exec: () => Promise<unknown>,
  okLine: string,
) {
  const bug: any = await client.getBug(id);
  const preview = previewLine(bug);
  if (!confirm) {
    return okResult(
      `[预览·未执行]\n${preview}\n\n确认无误后带 confirm=true 再次调用以真正提交。⚠️ 该操作在禅道可见。`,
      { dryRun: true, bug: { id: bug.id, title: bug.title, status: bug.status }, preview },
    );
  }
  const result = await exec();
  return okResult(okLine, { dryRun: false, result });
}

export function registerWriteTools(server: McpServer, client: ZentaoClient): void {
  server.registerTool(
    "zentao_comment_bug",
    {
      title: "给 Bug 加备注（禅道 v1 REST 不支持，会报错）",
      description: `⚠️ 禅道 v1 REST API **不支持**为 Bug 添加独立备注（实测：editBug 的 comment 字段被静默丢弃，
且无 /comment 动作端点）。调用本工具会**直接返回错误**，不会假装成功。
如需加备注：请在禅道 Web UI 手工操作，或改用旧版 session API（?m=action&f=comment）。
Args: id (number), comment (string)`,
      inputSchema: {
        id: z.number().int().positive().describe("Bug ID"),
        comment: z.string().min(1).describe("备注内容"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ id, comment }) => {
      try {
        const result = await client.commentBug(id, comment);
        return okResult(`✅ 已给 Bug #${id} 添加备注。`, { dryRun: false, result });
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    "zentao_resolve_bug",
    {
      title: "解决 Bug（状态流转）",
      description: `把 Bug 标记为已解决。高风险：默认只预览，带 confirm=true 才真正提交。
Args: id, resolution(${RESOLUTIONS.join("/")}), resolvedBuild?(默认 trunk), comment?, confirm(默认 false)`,
      inputSchema: {
        id: z.number().int().positive().describe("Bug ID"),
        resolution: z
          .enum(RESOLUTIONS as unknown as [string, ...string[]])
          .describe("解决方案：fixed/postponed/willnotfix/duplicate/external/notrepro/bydesign/tostory"),
        resolvedBuild: z.string().optional().describe("解决版本，默认 trunk"),
        comment: z.string().optional().describe("备注"),
        confirm: z.boolean().default(false).describe("false=仅预览；true=真正提交"),
      },
      annotations: HIGH_RISK,
    },
    async ({ id, resolution, resolvedBuild, comment, confirm }) => {
      try {
        return await highRiskOp(
          client,
          id,
          confirm,
          (b) =>
            `解决 Bug #${id}「${b.title}」：${b.status} → resolved，resolution=${resolution}，build=${resolvedBuild ?? "trunk"}${comment ? `，备注：${comment}` : ""}`,
          () => client.resolveBug(id, { resolution, resolvedBuild: resolvedBuild ?? "trunk", comment }),
          `✅ 已解决 Bug #${id}（resolution=${resolution}）。`,
        );
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    "zentao_close_bug",
    {
      title: "关闭 Bug（状态流转）",
      description: `关闭一个已解决的 Bug。高风险：默认预览，confirm=true 才执行。
Args: id, comment?, confirm(默认 false)`,
      inputSchema: {
        id: z.number().int().positive().describe("Bug ID"),
        comment: z.string().optional().describe("备注"),
        confirm: z.boolean().default(false).describe("false=仅预览；true=真正提交"),
      },
      annotations: HIGH_RISK,
    },
    async ({ id, comment, confirm }) => {
      try {
        return await highRiskOp(
          client,
          id,
          confirm,
          (b) => `关闭 Bug #${id}「${b.title}」：${b.status} → closed${comment ? `，备注：${comment}` : ""}`,
          () => client.closeBug(id, { comment }),
          `✅ 已关闭 Bug #${id}。`,
        );
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    "zentao_activate_bug",
    {
      title: "激活 Bug（状态流转）",
      description: `重新激活一个已解决/关闭的 Bug。高风险：默认预览，confirm=true 才执行。
Args: id, assignedTo?(重新指派给谁), comment?, confirm(默认 false)`,
      inputSchema: {
        id: z.number().int().positive().describe("Bug ID"),
        assignedTo: z.string().optional().describe("重新指派给的 account"),
        comment: z.string().optional().describe("备注"),
        confirm: z.boolean().default(false).describe("false=仅预览；true=真正提交"),
      },
      annotations: HIGH_RISK,
    },
    async ({ id, assignedTo, comment, confirm }) => {
      try {
        return await highRiskOp(
          client,
          id,
          confirm,
          (b) =>
            `激活 Bug #${id}「${b.title}」：${b.status} → active${assignedTo ? `，指派给 ${assignedTo}` : ""}${comment ? `，备注：${comment}` : ""}`,
          () => client.activateBug(id, { assignedTo, comment }),
          `✅ 已激活 Bug #${id}。`,
        );
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    "zentao_confirm_bug",
    {
      title: "确认 Bug（状态流转）",
      description: `确认一个 Bug（is_confirmed=1）。高风险：默认预览，confirm=true 才执行。
Args: id, assignedTo?, confirm(默认 false)`,
      inputSchema: {
        id: z.number().int().positive().describe("Bug ID"),
        assignedTo: z.string().optional().describe("确认后指派给的 account"),
        confirm: z.boolean().default(false).describe("false=仅预览；true=真正提交"),
      },
      annotations: HIGH_RISK,
    },
    async ({ id, assignedTo, confirm }) => {
      try {
        return await highRiskOp(
          client,
          id,
          confirm,
          (b) => `确认 Bug #${id}「${b.title}」${assignedTo ? `，指派给 ${assignedTo}` : ""}`,
          () => client.confirmBug(id, { assignedTo }),
          `✅ 已确认 Bug #${id}。`,
        );
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    "zentao_assign_bug",
    {
      title: "指派 Bug（状态流转）",
      description: `把 Bug 指派给某人（走 PUT /bugs/{id} editBug）。高风险：默认预览，confirm=true 才执行。
⚠️ 禅道 v1 REST 无独立指派端点，comment 无法经此记录（会被丢弃），仅指派本身生效。
Args: id, assignedTo(account), comment?(不生效), confirm(默认 false)`,
      inputSchema: {
        id: z.number().int().positive().describe("Bug ID"),
        assignedTo: z.string().min(1).describe("指派给的 account"),
        comment: z.string().optional().describe("备注"),
        confirm: z.boolean().default(false).describe("false=仅预览；true=真正提交"),
      },
      annotations: HIGH_RISK,
    },
    async ({ id, assignedTo, comment, confirm }) => {
      try {
        return await highRiskOp(
          client,
          id,
          confirm,
          (b) =>
            `指派 Bug #${id}「${b.title}」给 ${assignedTo}（原指派 ${b.assignedTo?.account ?? b.assignedTo ?? "—"}）${comment ? `，备注：${comment}` : ""}`,
          () => client.assignBug(id, { assignedTo, comment }),
          `✅ 已把 Bug #${id} 指派给 ${assignedTo}。`,
        );
      } catch (e) {
        return errResult(e);
      }
    },
  );
}
