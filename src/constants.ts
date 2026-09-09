/** 共享常量 */

/** 单次响应字符上限，超出则截断并提示分页。 */
export const CHARACTER_LIMIT = 25000;

/** 解决方案枚举（禅道 bug resolution）。 */
export const RESOLUTIONS = [
  "bydesign", // 设计如此
  "duplicate", // 重复 bug
  "external", // 外部原因
  "fixed", // 已解决
  "notrepro", // 无法重现
  "postponed", // 延期处理
  "willnotfix", // 不予解决
  "tostory", // 转为需求
] as const;

/** bug 状态枚举。 */
export const BUG_STATUSES = ["active", "resolved", "closed"] as const;
