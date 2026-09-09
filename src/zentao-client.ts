/**
 * 禅道 REST API 客户端。
 *
 * 直连 `{baseUrl}/api.php/v1`。
 * 认证：优先用 ZENTAO_TOKEN，否则用 account+password 调 `POST /tokens`，
 * 缓存并在 401 时自动刷新一次。
 */
import axios, { AxiosError, AxiosInstance } from "axios";

export interface ZentaoConfig {
  baseUrl: string;
  account?: string;
  password?: string;
  /** 直接复用的现成 token（跳过 account/password 换取）。 */
  token?: string;
}

/** 把任意错误转成对 agent 友好、可操作的中文消息。 */
export function formatZentaoError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError<any>;
    if (ax.response) {
      const status = ax.response.status;
      const body = ax.response.data;
      const apiMsg =
        typeof body === "object" && body && "error" in body
          ? String((body as any).error)
          : typeof body === "string"
            ? body.slice(0, 200)
            : "";
      switch (status) {
        case 401:
          return `Error 401：认证失败或 token 失效。检查 ZENTAO_ACCOUNT/ZENTAO_PASSWORD 是否正确。${apiMsg}`;
        case 403:
          return `Error 403：无权限。当前禅道账号对该资源没有操作权限。${apiMsg}`;
        case 404:
          return `Error 404：对象不存在。请检查 bug/产品 ID 是否正确。${apiMsg}`;
        case 422:
          return `Error 422：参数校验失败。${apiMsg || "检查必填字段（如 resolution）是否齐全。"}`;
        default:
          return `Error ${status}：请求失败。${apiMsg}`;
      }
    }
    if (ax.code === "ECONNABORTED") return "Error：请求超时，请重试或检查网络。";
    return `Error：网络错误 ${ax.code ?? ""} ${ax.message}`;
  }
  return `Error：${error instanceof Error ? error.message : String(error)}`;
}

export class ZentaoClient {
  private http: AxiosInstance;
  private token: string | null;
  private readonly account?: string;
  private readonly password?: string;

  constructor(cfg: ZentaoConfig) {
    const baseUrl = cfg.baseUrl.replace(/\/$/, "");
    this.account = cfg.account;
    this.password = cfg.password;
    this.token = cfg.token ?? null;
    this.http = axios.create({
      baseURL: `${baseUrl}/api.php/v1`,
      timeout: 30000,
      maxRedirects: 5,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      validateStatus: (s) => s >= 200 && s < 500,
    });
  }

  private async ensureToken(): Promise<string> {
    if (this.token) return this.token;
    if (!this.account || !this.password) {
      throw new Error(
        "缺少认证：请设置 ZENTAO_TOKEN，或同时设置 ZENTAO_ACCOUNT 与 ZENTAO_PASSWORD。",
      );
    }
    const resp = await this.http.post("/tokens", {
      account: this.account,
      password: this.password,
    });
    const token = resp.data?.token;
    if (!token) {
      throw new Error(`换取 token 失败：${resp.data?.error ?? JSON.stringify(resp.data)}`);
    }
    this.token = token;
    return token;
  }

  async request<T = any>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    endpoint: string,
    data?: unknown,
    params?: Record<string, unknown>,
    _retried = false,
  ): Promise<T> {
    const token = await this.ensureToken();
    const resp = await this.http.request<T>({
      method,
      url: endpoint,
      data,
      params,
      headers: { Token: token },
    });
    const status = resp.status;
    if (status === 401 && !_retried && this.account && this.password) {
      this.token = null;
      return this.request<T>(method, endpoint, data, params, true);
    }
    if (status >= 400) {
      const err = new AxiosError(
        `ZenTao API ${status}`,
        String(status),
        undefined,
        undefined,
        { status, data: resp.data, statusText: resp.statusText, headers: resp.headers, config: resp.config } as any,
      );
      throw err;
    }
    return resp.data;
  }

  getBug(id: number) {
    return this.request("GET", `/bugs/${id}`);
  }
  listProductBugs(productId: number, params: Record<string, unknown>) {
    return this.request("GET", `/products/${productId}/bugs`, undefined, params);
  }

  // 禅道 v1 REST 是精选端点集，不是通用 `{module}/{id}/{action}` 动作路由。
  // 实测 `/bugs/{id}/assignto` 一类子路由会 404；指派走 PUT /bugs/{id}（字段合并，未传字段不清空）。
  // resolve/close/activate/confirm 仍走动作子路由；若目标实例 404，改走 PUT 并先在测试单上验证必填字段。
  resolveBug(id: number, body: { resolution: string; resolvedBuild?: string; comment?: string }) {
    return this.request("POST", `/bugs/${id}/resolve`, body);
  }
  closeBug(id: number, body: { comment?: string }) {
    return this.request("POST", `/bugs/${id}/close`, body);
  }
  activateBug(id: number, body: { comment?: string; assignedTo?: string }) {
    return this.request("POST", `/bugs/${id}/activate`, body);
  }
  confirmBug(id: number, body: { assignedTo?: string }) {
    return this.request("POST", `/bugs/${id}/confirm`, body);
  }
  /** 指派：PUT /bugs/{id}。v1 无独立指派端点，comment 无法经此记录。 */
  assignBug(id: number, body: { assignedTo: string; comment?: string }) {
    return this.request("PUT", `/bugs/${id}`, { assignedTo: body.assignedTo });
  }
  /**
   * 加备注：v1 REST 不支持独立备注（editBug 的 comment 被静默丢弃，无 /comment 端点）。
   * 直接抛错，避免返回假成功。
   */
  commentBug(_id: number, _comment: string): never {
    throw new Error(
      "禅道 v1 REST API 不支持为 Bug 添加独立备注/评论（editBug 的 comment 字段被静默丢弃，且无 /comment 动作端点）。请在禅道 Web UI 手工添加备注，或改用旧版 session API（?m=action&f=comment）。",
    );
  }
}

export function clientFromEnv(): ZentaoClient {
  const baseUrl = process.env.ZENTAO_URL?.replace(/\/$/, "") ?? "";
  if (!baseUrl) {
    throw new Error("缺少 ZENTAO_URL。请设置为禅道地址，例如 https://example.com/zentao");
  }
  return new ZentaoClient({
    baseUrl,
    account: process.env.ZENTAO_ACCOUNT,
    password: process.env.ZENTAO_PASSWORD,
    token: process.env.ZENTAO_TOKEN,
  });
}
