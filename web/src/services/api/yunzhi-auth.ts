import type { ChannelModel, ModelCapability } from "@/stores/use-config-store";

export const YUNZHI_BASE_URL = "https://yunzhicode.com";
export const YUNZHI_API_BASE_URL = `${YUNZHI_BASE_URL}/v1`;
const SESSION_TOKEN_KEY = "yunzhi-canvas:access-token";
const SESSION_TOKEN_EXPIRES_KEY = "yunzhi-canvas:access-token-expires";
const SESSION_USER_KEY = "yunzhi-canvas:user";

export type YunzhiUser = {
    id: number | string;
    username: string;
    display_name?: string;
    displayName?: string;
    avatar_url?: string;
    avatarUrl?: string;
    role?: number | string;
    group?: string;
    quota?: number;
    used_quota?: number;
};

export type YunzhiPolicy = {
    revision: number;
    updated_at: number;
    default_group: string;
    default_groups: Record<ModelCapability, string>;
    enabled_models: Record<ModelCapability, string[]>;
    enabled_models_configured: boolean;
    model_types: Record<string, ModelCapability>;
    default_models: Record<ModelCapability, string>;
};

export type YunzhiCatalog = { models: string[]; groups: string[] };

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

export class YunzhiAuthError extends Error {}

function sessionToken() {
    if (typeof window === "undefined") return "";
    const token = window.sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
    const expiresAt = Number(window.sessionStorage.getItem(SESSION_TOKEN_EXPIRES_KEY) || 0);
    if (!token || !expiresAt || expiresAt <= Math.floor(Date.now() / 1000) + 30) {
        clearYunzhiSessionToken();
        return "";
    }
    return token;
}

export function getYunzhiSessionToken() {
    return sessionToken();
}

function saveSession(token: string, expiresAt: number, user: YunzhiUser) {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    window.sessionStorage.setItem(SESSION_TOKEN_EXPIRES_KEY, String(expiresAt));
    window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function clearYunzhiSessionToken() {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    window.sessionStorage.removeItem(SESSION_TOKEN_EXPIRES_KEY);
    window.sessionStorage.removeItem(SESSION_USER_KEY);
}

async function request<T>(path: string, init: RequestInit = {}, token = "") {
    let response: Response;
    try {
        response = await fetch(`${YUNZHI_BASE_URL}${path}`, {
            ...init,
            credentials: "include",
            headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
        });
    } catch {
        throw new Error("无法连接云智服务，请检查网络或 CORS 配置");
    }

    let payload: ApiEnvelope<T> | null = null;
    try {
        payload = (await response.json()) as ApiEnvelope<T>;
    } catch {
        payload = null;
    }
    if (!response.ok || payload?.success === false) {
        if (response.status === 401 || response.status === 403) throw new YunzhiAuthError("云智登录已失效，请重新登录");
        throw new Error(payload?.message || `云智服务请求失败（${response.status}）`);
    }
    return payload?.data as T;
}

export async function fetchYunzhiUser() {
    if (typeof window !== "undefined") {
        const cached = window.sessionStorage.getItem(SESSION_USER_KEY);
        if (cached) {
            try {
                const user = JSON.parse(cached) as YunzhiUser;
                if (user.role === undefined) throw new Error("stale Canvas session");
                return user;
            } catch {
                window.sessionStorage.removeItem(SESSION_USER_KEY);
            }
        }
    }
    throw new YunzhiAuthError("Canvas 登录已失效，请重新登录");
}

export async function fetchYunzhiToken() {
    const token = sessionToken();
    if (token) return token;
    const ticket = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("ticket") || "";
    if (!ticket) throw new YunzhiAuthError("Canvas 登录已失效，请重新登录");
    const exchanged = await request<{ token: string; expires_at: number; user: YunzhiUser }>("/api/canvas/sso/exchange", {
        method: "POST",
        body: JSON.stringify({ ticket }),
    });
    if (!exchanged?.token?.trim() || !exchanged.expires_at || !exchanged.user) throw new Error("Canvas 登录票据兑换失败");
    saveSession(exchanged.token.trim(), exchanged.expires_at, exchanged.user);
    if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("ticket");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    return exchanged.token.trim();
}

export async function fetchYunzhiModels(token: string, policy?: YunzhiPolicy): Promise<ChannelModel[]> {
    let response: Response;
    try {
        response = await fetch(`${YUNZHI_API_BASE_URL}/models`, { credentials: "include", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    } catch {
        throw new Error("无法读取云智模型列表，请检查网络或 CORS 配置");
    }
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new YunzhiAuthError("云智令牌已失效，请重新登录");
        throw new Error(`读取云智模型列表失败（${response.status}）`);
    }
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    return (data?.data || [])
        .map((item) => item.id?.trim() || "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .flatMap((name) => {
            const capability = policy?.model_types?.[name];
            if (!capability) return [];
            if (policy.enabled_models_configured && !policy.enabled_models[capability]?.includes(name)) return [];
            return [{ name, capability }];
        });
}

export async function fetchYunzhiPolicy(token: string) {
    return request<{ config: YunzhiPolicy; groups: string[] }>("/api/canvas/config", {}, token);
}

export async function fetchYunzhiCatalog(token: string) {
    return request<YunzhiCatalog>("/api/canvas/admin/catalog", {}, token);
}

export async function saveYunzhiPolicy(token: string, policy: Pick<YunzhiPolicy, "default_groups" | "enabled_models" | "enabled_models_configured" | "model_types" | "default_models">) {
    return request<{ config: YunzhiPolicy; groups: string[] }>("/api/canvas/config", { method: "PUT", body: JSON.stringify(policy) }, token);
}

export async function logoutYunzhi() {
    try {
        const token = sessionToken();
        if (token) await request("/api/canvas/sso/revoke", { method: "POST" }, token);
    } finally {
        clearYunzhiSessionToken();
    }
}

export function isYunzhiApiUrl(url?: string) {
    if (!url) return false;
    try {
        return new URL(url, window.location.href).hostname === "yunzhicode.com";
    } catch {
        return false;
    }
}

export function yunzhiLoginUrl() {
    const redirect = typeof window === "undefined" ? "https://canvas.yunzhicode.com/sso/callback" : `${window.location.origin}/sso/callback`;
    return `${YUNZHI_BASE_URL}/api/canvas/sso/start?redirect=${encodeURIComponent(redirect)}`;
}

export function toLocalUser(user: YunzhiUser) {
    return {
        id: String(user.id),
        username: user.username || String(user.id),
        displayName: user.display_name || user.displayName || user.username || String(user.id),
        avatarUrl: user.avatar_url || user.avatarUrl || "",
        role: Number(user.role || 0),
        group: user.group || "default",
    };
}
