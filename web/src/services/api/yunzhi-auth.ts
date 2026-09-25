import { guessCapability, type ChannelModel } from "@/stores/use-config-store";

export const YUNZHI_BASE_URL = "https://yunzhicode.com";
export const YUNZHI_API_BASE_URL = `${YUNZHI_BASE_URL}/v1`;
const SESSION_TOKEN_KEY = "yunzhi-canvas:access-token";

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

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

export class YunzhiAuthError extends Error {}

function sessionToken() {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
}

function saveSessionToken(token: string) {
    if (typeof window !== "undefined") window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearYunzhiSessionToken() {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
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
    return request<YunzhiUser>("/api/user/self");
}

export async function fetchYunzhiToken() {
    const token = sessionToken();
    if (token) return token;
    const nextToken = await request<string>("/api/user/token");
    if (!nextToken?.trim()) throw new Error("云智服务没有返回 API 令牌");
    saveSessionToken(nextToken.trim());
    return nextToken.trim();
}

export async function fetchYunzhiModels(token: string): Promise<ChannelModel[]> {
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
        .map((name) => ({ name, capability: guessCapability(name) }));
}

export async function logoutYunzhi() {
    try {
        await request("/api/user/logout");
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
    const redirect = typeof window === "undefined" ? "https://canvas.yunzhicode.com/" : window.location.href;
    return `${YUNZHI_BASE_URL}/sign-in?redirect=${encodeURIComponent(redirect)}`;
}

export function toLocalUser(user: YunzhiUser) {
    return {
        id: String(user.id),
        username: user.username || String(user.id),
        displayName: user.display_name || user.displayName || user.username || String(user.id),
        avatarUrl: user.avatar_url || user.avatarUrl || "",
    };
}
