# 禅道 MCP 公开化 + npx

**日期**：2026-09-09
**状态**：实施中
**范围**：把私有源仓的 Bug 能力拷成公开包，可用 `npx` 安装。不扩需求 / 任务 / 项目 / 附件。

## 背景

私有源仓直连禅道 REST API v1，MCP + CLI 双门面，写操作默认 dry-run。装法是 clone 后 `node dist/index.js`，不能 `npx`。

官方 `zentao-cli` 与 npm 上已有的 `zentao-mcp` / `zentao-mcp-server` 都不替代这份：前者分页和 stdout 仍有问题；后者一个标 18.13、写操作没有按次 dry-run，一个只是通用 `call(path)` 代理。

无作用域名 `zentao-mcp`、`zentao-mcp-server` 已被别人占用。

## 已定

| 项 | 值 |
|---|---|
| 做法 | 新建干净仓，不带私有仓历史 |
| 本机目录 | `/Users/fanxiaokang/Work/Codes/github.com/zentao-mcp`（与 `dsh-*` 同级，不套组织目录） |
| GitHub | 公开仓 `dannyvan/zentao-mcp` |
| npm | `@dannyvan/zentao-mcp`，从 `0.1.0` 起 |
| 启动 | `npx -y @dannyvan/zentao-mcp` |
| 功能 | 与源仓相同的 Bug 读 / 写；写默认 dry-run |
| 私有源仓 | 不动 |

## 硬规矩

约束将来动作，不只是这次拷贝。

1. **公开仓与 npm 包不得出现内网主机名、私有 Git 路径、默认实例 URL。** 源码 / README / 注释 / package 字段按公司内网域名扫一遍，命中即未完成。本文件也不写那些字面量。
2. **`ZENTAO_URL` 必填。** 缺地址或缺少 `ZENTAO_TOKEN` /（`ZENTAO_ACCOUNT` + `ZENTAO_PASSWORD`）直接非零退出。禁止再写团队默认实例。
3. **凭证不进本仓任何会提交的文件。** 只保留占位符示例。真实值只在使用者本地的 MCP `env` 或环境变量。
4. **不改私有源仓。** 那边继续给内网用，默认实例可以留。
5. **第一版不扩对象。** 需求 / 任务 / 项目 / 执行 / 附件不进本仓。要扩另开一轮设计。
6. **本机新公开仓放在 `Work/Codes/github.com/` 下，不套组织目录。** 与现有 `dsh-*` 一致。
7. **Skill 分发走公开通道**（2026-09-09 定）：仓内 `skills/zentao-mcp/SKILL.md`，使用者 `npx skills add dannyvan/zentao-mcp -g` 或本包 `install-skill`。由 Skills CLI 识别本机 agent 并询问装哪几家。本仓文档与代码不写任何使用者机器上的私有安装器。

## 架构

从源仓拷这些文件，再改包名与默认地址：

- `src/index.ts` / `src/cli.ts` / `src/zentao-client.ts` / `src/constants.ts` / `src/tools/read.ts` / `src/tools/write.ts`
- `test-smoke.mjs`（没凭证则跳过真连）
- `.env.example` / `.gitignore` / `tsconfig.json`

行为保持：

- 无参数或 `serve` → MCP stdio
- 其余参数 → CLI，输出 JSON
- 高风险写：MCP 要 `confirm=true`，CLI 要 `--confirm`

`constants.ts` 不再提供默认 URL。`clientFromEnv` 在 `ZENTAO_URL` 为空时失败。

## 包与发布

`package.json` 要点：

- `name`: `@dannyvan/zentao-mcp`
- `bin`: `{ "zentao-mcp": "bin/zentao-mcp" }`（薄包装，保证本仓目录里 `npx` 也能找到命令）
- `files`: `["dist", "README.md"]`
- `publishConfig.access`: `public`
- `prepublishOnly`: `npm run build`
- `engines.node`: `>=18`
- 许可证：MIT（与同账号其他公开包一致）

MCP 配置形态：

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

发布顺序：本机建目录 → 拷源并消毒 → `npm run build` 能过 → `gh repo create dannyvan/zentao-mcp --public` → 首推 `main` 建仓（空仓没有可审基线，不空转 PR）→ 使用者 `npm login` → `npm publish --access public`。不设 GitHub Actions。

`npm login` 与 `npm publish` 是对外写入，动手前单独确认。作用域 `@dannyvan` 必须对应 npm 上的同名用户或组织，对不上就停，不改发到别的 scope。

## 错误处理

- 缺 `ZENTAO_URL`：stderr 说明要设地址，退出码非 0
- 缺认证：沿用现文案（token 或账号密码二选一）
- 禅道 API 错误：沿用现有中文映射，不提内网主机名

## 测试

本地：`npm run build` 成功；`node dist/index.js help` 打出 CLI 用法。缺 `ZENTAO_URL` 时 `get-bug` 非零退出。

发布后（需已 publish）：

```bash
npm view @dannyvan/zentao-mcp name version bin
```

有包名、版本、bin 即发布成功。不在文档里写死版本号。

真连禅道的 smoke 不作为本版必过项：公开包不带实例凭证，也不得把凭证写进 CI。

## 刻意不做

- 不扩需求 / 任务 / 项目 / 附件
- 不把 `dist` 提交进 git
- 不设 CI 自动 publish
- 不改私有源仓
