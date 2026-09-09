// 本仓 checkout 里，npm 11 不会把根包 bin 链到 node_modules/.bin。
// 装成别人的依赖时脚本位于 node_modules 下，直接退出，不碰宿主目录。
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (root.split(sep).includes("node_modules")) process.exit(0);

const binDir = join(root, "node_modules", ".bin");
const dest = join(binDir, "zentao-mcp");
const src = join(root, "bin", "zentao-mcp");
mkdirSync(binDir, { recursive: true });
rmSync(dest, { force: true });
symlinkSync(relative(binDir, src), dest);
