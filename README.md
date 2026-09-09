# @dannyvan/zentao-mcp

禅道（ZenTao）**MCP + CLI**，直连 REST API（`api.php/v1`）。只做 Bug：读详情 / 列表 / 搜索，写评论与状态流转。写操作默认 dry-run。

Agent 查 / 改禅道 Bug 时先读 [`skills/zentao-mcp/SKILL.md`](skills/zentao-mcp/SKILL.md)。

## 安装

```bash
npx -y @dannyvan/zentao-mcp
```

发布到 npm 之前，可在本仓 `npm install && npm run build` 后用 `node dist/index.js`。

## 认证

| 变量 | 说明 |
|---|---|
| `ZENTAO_URL` | **必填**，禅道地址（不含 `/api.php/v1`） |
| `ZENTAO_ACCOUNT` + `ZENTAO_PASSWORD` | 推荐：自动换取并刷新 token |
| `ZENTAO_TOKEN` | 或直接给现成 token（会过期） |

## MCP

```json
{
  "mcpServers": {
    "zentao": {
      "command": "npx",
      "args": ["-y", "@dannyvan/zentao-mcp"],
      "env": {
        "ZENTAO_URL": "https://<禅道域名>/zentao",
        "ZENTAO_ACCOUNT": "<账号>",
        "ZENTAO_PASSWORD": "<密码>"
      }
    }
  }
}
```

**Tools**

- 读：`zentao_get_bug` / `zentao_list_bugs` / `zentao_search_bugs`
- 写：`zentao_comment_bug`（v1 不支持，会报错）/ `resolve` `close` `activate` `confirm` `assign`（默认 dry-run，带 `confirm=true` 才提交）

`zentao_list_bugs` 的 `total` 禅道可能不准，以翻页实际列出为准。

## CLI

```bash
npx -y @dannyvan/zentao-mcp help
npx -y @dannyvan/zentao-mcp get-bug 123
npx -y @dannyvan/zentao-mcp list-bugs --product 1 --limit 50
npx -y @dannyvan/zentao-mcp assign-bug 123 --assigned-to someone
npx -y @dannyvan/zentao-mcp assign-bug 123 --assigned-to someone --confirm
```

无参数或 `serve` 时走 MCP stdio。输出 JSON；出错写 stderr，退出码非 0。

## 安全

- 写操作默认 dry-run（MCP：`confirm=true`；CLI：`--confirm`）
- 批量改状态请串行逐条，不要并行
- 写操作在禅道可见
