import { create } from "zustand";
import axios from "axios";

import { clearYunzhiSessionToken, fetchYunzhiModels, fetchYunzhiPolicy, fetchYunzhiToken, fetchYunzhiUser, isYunzhiApiUrl, logoutYunzhi, toLocalUser, YunzhiAuthError, yunzhiLoginUrl } from "@/services/api/yunzhi-auth";
import type { ChannelModel, YunzhiPolicy } from "@/stores/use-config-store";
import { useConfigStore } from "@/stores/use-config-store";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    role: number;
    group: string;
};

type UserStore = {
    user: LocalUser | null;
    status: "idle" | "checking" | "authenticated" | "unauthenticated" | "error";
    error: string;
    initialize: () => Promise<void>;
    loginRedirect: () => void;
    logout: () => Promise<void>;
    clearSession: () => void;
    policy: YunzhiPolicy | null;
    refreshPolicy: () => Promise<void>;
};

let initialization: Promise<void> | null = null;

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    status: "idle",
    error: "",
    policy: null,
    initialize: async () => {
        if (initialization) return initialization;
        initialization = (async () => {
            set({ status: "checking", error: "" });
            try {
                const token = await fetchYunzhiToken();
                const user = await fetchYunzhiUser();
                let models: ChannelModel[] = [];
                try {
                    models = await fetchYunzhiModels(token);
                } catch (modelError) {
                    if (modelError instanceof YunzhiAuthError) throw modelError;
                    models = [];
                }
                const policy = await fetchYunzhiPolicy(token);
                useConfigStore.getState().configureYunzhiChannel(token, models, policy.config);
                set({ user: toLocalUser(user), policy: policy.config, status: "authenticated", error: "" });
            } catch (error) {
                clearYunzhiSessionToken();
                set({ user: null, status: error instanceof YunzhiAuthError ? "unauthenticated" : "error", error: error instanceof Error ? error.message : "云智登录状态无效" });
            } finally {
                initialization = null;
            }
        })();
        return initialization;
    },
    loginRedirect: () => {
        window.location.assign(yunzhiLoginUrl());
    },
    refreshPolicy: async () => {
        const token = await fetchYunzhiToken();
        const policy = await fetchYunzhiPolicy(token);
        if (useUserStore.getState().policy?.revision === policy.config.revision) return;
        const models = await fetchYunzhiModels(token);
        useConfigStore.getState().configureYunzhiChannel(token, models, policy.config);
        set({ policy: policy.config });
    },
    logout: async () => {
        try {
            await logoutYunzhi();
        } finally {
            clearYunzhiSessionToken();
            useConfigStore.getState().clearYunzhiChannel();
            set({ user: null, policy: null, status: "unauthenticated", error: "" });
        }
    },
    clearSession: () => {
        clearYunzhiSessionToken();
        set({ user: null, status: "unauthenticated" });
    },
}));

axios.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.status === 401 && isYunzhiApiUrl(error.config?.url)) {
            clearYunzhiSessionToken();
            useConfigStore.getState().clearYunzhiChannel();
            useUserStore.setState({ user: null, status: "unauthenticated", error: "云智登录已失效，请重新登录" });
            if (typeof window !== "undefined") window.location.assign(yunzhiLoginUrl());
        }
        return Promise.reject(error);
    },
);
