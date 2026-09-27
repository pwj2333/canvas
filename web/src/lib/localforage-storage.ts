import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

let activeUserId = "";
const databases = new Map<string, ReturnType<typeof localforage.createInstance>>();

export function setLocalDataUser(userId: string) {
    activeUserId = userId;
}

export function deactivateLocalData() {
    activeUserId = "";
}

export function hasLocalDataUser() {
    return Boolean(activeUserId);
}

export function userDataStore(storeName: string) {
    if (!activeUserId) throw new Error("User data is unavailable before login");
    const key = `${activeUserId}:${storeName}`;
    let database = databases.get(key);
    if (!database) {
        database = localforage.createInstance({ name: `infinite-canvas-user-${activeUserId}`, storeName });
        databases.set(key, database);
    }
    return database;
}

export async function activateLocalData(userId: string) {
    setLocalDataUser(userId);
    const legacy = localforage.createInstance({ name: "infinite-canvas", storeName: "app_state" });
    const claim = await legacy.getItem<string>("yunzhi-canvas:legacy-owner");
    if (!claim) {
        // ponytail: legacy data is claimed by the first signed-in account in this browser; old stores remain as backup.
        for (const storeName of ["app_state", "image_files", "image_previews", "media_files", "image_generation_logs", "video_generation_logs"]) {
            const source = localforage.createInstance({ name: "infinite-canvas", storeName });
            const target = userDataStore(storeName);
            const entries: Array<[string, unknown]> = [];
            await source.iterate((value, key) => { if (key !== "yunzhi-canvas:legacy-owner") entries.push([key, value]); });
            for (const [key, value] of entries) {
                if (await target.getItem(key) === null) await target.setItem(key, value);
            }
        }
        await legacy.setItem("yunzhi-canvas:legacy-owner", userId);
    }
}

localforage.config({
    name: "infinite-canvas",
    storeName: "app_state",
});

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        if (name === "infinite-canvas:canvas_store" || name === "infinite-canvas:asset_store") {
            if (!activeUserId) return null;
            return (await userDataStore("app_state").getItem<string>(name)) || null;
        }
        try {
            return (await localforage.getItem<string>(name)) || null;
        } catch {
            return window.localStorage.getItem(name);
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        if (name === "infinite-canvas:canvas_store" || name === "infinite-canvas:asset_store") {
            if (!activeUserId) return;
            await userDataStore("app_state").setItem(name, value);
            return;
        }
        try {
            await localforage.setItem(name, value);
        } catch {
            window.localStorage.setItem(name, value);
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        if (name === "infinite-canvas:canvas_store" || name === "infinite-canvas:asset_store") {
            if (!activeUserId) return;
            await userDataStore("app_state").removeItem(name);
            return;
        }
        try {
            await localforage.removeItem(name);
        } catch {
            window.localStorage.removeItem(name);
        }
    },
};
