import { create } from "zustand";
import axios from "axios";

import { clearYunzhiSessionToken, fetchYunzhiModels, fetchYunzhiPolicy, fetchYunzhiToken, fetchYunzhiUser, isYunzhiApiUrl, logoutYunzhi, saveYunzhiPolicy, toLocalUser, YunzhiAuthError, yunzhiLoginUrl } from "@/services/api/yunzhi-auth";
import type { ChannelModel, YunzhiPolicy } from "@/stores/use-config-store";
import { useConfigStore } from "@/stores/use-config-store";
import { activateLocalData, deactivateLocalData } from "@/lib/localforage-storage";
import { clearImageObjectUrls } from "@/services/image-storage";
import { clearMediaObjectUrls } from "@/services/file-storage";

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
    saveChannelPolicy: (models: ChannelModel[]) => Promise<void>;
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
                const policy = await fetchYunzhiPolicy(token);
                await activateLocalData(String(user.id));
                const [{ useCanvasStore }, { useAssetStore }] = await Promise.all([import("@/stores/canvas/use-canvas-store"), import("@/stores/use-asset-store")]);
                await Promise.all([useCanvasStore.persist.rehydrate(), useAssetStore.persist.rehydrate()]);
                let models: ChannelModel[] = [];
                try {
                    models = await fetchYunzhiModels(token, policy.config);
                } catch (modelError) {
                    if (modelError instanceof YunzhiAuthError) throw modelError;
                    models = [];
                }
                useConfigStore.getState().configureYunzhiChannel(token, models, policy.config);
                set({ user: toLocalUser(user), policy: policy.config, status: "authenticated", error: "" });
            } catch (error) {
                deactivateLocalData();
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
        const models = await fetchYunzhiModels(token, policy.config);
        useConfigStore.getState().configureYunzhiChannel(token, models, policy.config);
        set({ policy: policy.config });
    },
    saveChannelPolicy: async (models) => {
        const token = await fetchYunzhiToken();
        const current = useUserStore.getState().policy;
        if (!current) throw new Error("云智策略尚未加载");
        const modelTypes = { ...current.model_types };
        const enabledModels = { ...current.enabled_models };
        for (const capability of ["text", "image", "video", "audio"] as const) enabledModels[capability] = [];
        for (const model of models) {
            modelTypes[model.name] = model.capability;
            enabledModels[model.capability] = [...enabledModels[model.capability], model.name];
        }
        const response = await saveYunzhiPolicy(token, {
            allow_external_channels: current.allow_external_channels,
            default_groups: current.default_groups,
            enabled_models: enabledModels,
            enabled_models_configured: true,
            model_types: modelTypes,
            default_models: current.default_models,
        });
        set({ policy: response.config });
    },
    logout: async () => {
        try {
            await logoutYunzhi();
        } finally {
            clearYunzhiSessionToken();
            useConfigStore.getState().clearYunzhiChannel();
            deactivateLocalData();
            clearImageObjectUrls();
            clearMediaObjectUrls();
            const [{ useCanvasStore }, { useAssetStore }] = await Promise.all([import("@/stores/canvas/use-canvas-store"), import("@/stores/use-asset-store")]);
            useCanvasStore.setState({ projects: [], deletedProjects: [], hydrated: false });
            useAssetStore.setState({ assets: [], hydrated: false });
            set({ user: null, policy: null, status: "unauthenticated", error: "" });
        }
    },
    clearSession: () => {
        deactivateLocalData();
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
