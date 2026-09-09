import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function skillPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "skills", "zentao-mcp", "SKILL.md");
}

/** 仓内 / npm 包里那份 skill 全文。 */
export function loadSkillMarkdown(): string {
  return readFileSync(skillPath(), "utf8");
}

/** 去掉 frontmatter，给 MCP instructions / `zentao-mcp skill`。 */
export function skillInstructions(): string {
  return loadSkillMarkdown().replace(/^---[\s\S]*?---\s*/, "").trim();
}
