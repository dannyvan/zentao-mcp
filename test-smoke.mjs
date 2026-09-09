// 冒烟：有凭证时直连禅道验证读路径。无 ZENTAO_URL / 认证则跳过。
import { writeFileSync } from "fs";
import { ZentaoClient } from "./dist/zentao-client.js";

const url = process.env.ZENTAO_URL;
const token = process.env.ZENTAO_TOKEN;
const account = process.env.ZENTAO_ACCOUNT;
const password = process.env.ZENTAO_PASSWORD;
const bugId = Number(process.env.ZENTAO_SMOKE_BUG_ID || 0);
const productId = Number(process.env.ZENTAO_SMOKE_PRODUCT_ID || 0);

if (!url || (!token && !(account && password))) {
  console.error("跳过：请设置 ZENTAO_URL，以及 ZENTAO_TOKEN 或 ZENTAO_ACCOUNT+ZENTAO_PASSWORD。");
  process.exit(0);
}
if (!bugId || !productId) {
  console.error("跳过：请设置 ZENTAO_SMOKE_BUG_ID 与 ZENTAO_SMOKE_PRODUCT_ID。");
  process.exit(0);
}

const c = new ZentaoClient({
  baseUrl: url,
  token,
  account,
  password,
});
const out = {};

try {
  const bug = await c.getBug(bugId);
  out.getBug = {
    id: bug.id,
    title: bug.title,
    status: bug.status,
    steps_len: String(bug.steps || "").length,
    openedBy: typeof bug.openedBy === "object" ? bug.openedBy?.account : bug.openedBy,
  };
} catch (e) {
  out.getBug_err = String(e?.message || e);
}

try {
  const list = await c.listProductBugs(productId, { limit: 3 });
  out.list = {
    total: list.total,
    n: Array.isArray(list.bugs) ? list.bugs.length : 0,
    first_id: list.bugs?.[0]?.id,
  };
} catch (e) {
  out.list_err = String(e?.message || e);
}

const dest = process.env.ZENTAO_SMOKE_OUT || "smoke-out.json";
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(dest);
