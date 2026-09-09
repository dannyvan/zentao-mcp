---
name: zentao-mcp
description: >-
  用 @dannyvan/zentao-mcp 查或改禅道 Bug（MCP / CLI / npx）。
  用户提到禅道、Zentao、查 bug、指派/解决/关闭 bug、配 zentao MCP 时使用。
  不要用官方 zentao-cli。
---

# 禅道 Bug（@dannyvan/zentao-mcp）

只做 Bug。走本包的 MCP 或 CLI，**不要**装官方 `zentao-cli`。

## 启动

MCP：

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

CLI：`npx -y @dannyvan/zentao-mcp <命令>`。无参数或 `serve` 是 MCP stdio。

`ZENTAO_URL` 必填。认证：`ZENTAO_ACCOUNT` + `ZENTAO_PASSWORD`，或 `ZENTAO_TOKEN`。凭证只放 MCP `env` 或环境变量，不写进仓库。

## 读

- `zentao_get_bug`：按 ID，默认含 steps
- `zentao_list_bugs`：按产品分页。`total` 可能不准，以实际列出为准
- `zentao_search_bugs`：当前产品里扫标题 / steps，范围受 `scan_limit`

CLI：`get-bug` / `list-bugs --product` / `search-bugs --product --keyword`

## 写

高风险（resolve / close / activate / confirm / assign）**默认 dry-run**：

- MCP：先不带 `confirm` 看预览，用户确认后再 `confirm=true`
- CLI：先不带 `--confirm`，确认后再加

`zentao_comment_bug` 会报错：禅道 v1 REST 没有独立备注。让用户去网页加。

批量改状态必须**串行逐条**，不要并行。写操作在禅道可见。

## 禁止

- 不装、不调用官方 `zentao-cli`
- 不编造默认禅道地址
- 不把账号密码写进会提交的文件
