import { create } from "zustand";
import axios from "axios";

import { clearYunzhiSessionToken, fetchYunzhiModels, fetchYunzhiToken, fetchYunzhiUser, isYunzhiApiUrl, logoutYunzhi, toLocalUser, YunzhiAuthError, yunzhiLoginUrl } from "@/services/api/yunzhi-auth";
import type { ChannelModel } from "@/stores/use-config-store";
import { useConfigStore } from "@/stores/use-config-store";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
};

type UserStore = {
    user: LocalUser | null;
    status: "idle" | "checking" | "authenticated" | "unauthenticated" | "error";
    error: string;
    initialize: () => Promise<void>;
    loginRedirect: () => void;
    logout: () => Promise<void>;
    clearSession: () => void;
};

let initialization: Promise<void> | null = null;

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    status: "idle",
    error: "",
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
                useConfigStore.getState().configureYunzhiChannel(token, models);
                set({ user: toLocalUser(user), status: "authenticated", error: "" });
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
    logout: async () => {
        try {
            await logoutYunzhi();
        } finally {
            clearYunzhiSessionToken();
            useConfigStore.getState().clearYunzhiChannel();
            set({ user: null, status: "unauthenticated", error: "" });
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
