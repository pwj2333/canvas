import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Checkbox, Col, Empty, Row, Select, Space, Spin, Tag, Typography } from "antd";
import { CheckCircle2, ChevronDown, ChevronUp, RefreshCw, Save, ShieldCheck } from "lucide-react";

import { fetchYunzhiCatalog, fetchYunzhiPolicy, fetchYunzhiModels, getYunzhiSessionToken, saveYunzhiPolicy, type YunzhiCatalog } from "@/services/api/yunzhi-auth";
import { guessCapability, type ModelCapability, type YunzhiPolicy } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

const capabilities: ModelCapability[] = ["text", "image", "video", "audio"];
const labels: Record<ModelCapability, string> = { text: "文本模型", image: "图片模型", video: "视频模型", audio: "音频模型" };
const emptySelection = (): YunzhiPolicy["enabled_models"] => ({ text: [], image: [], video: [], audio: [] });
const emptyDefaults = (): YunzhiPolicy["default_models"] => ({ text: "", image: "", video: "", audio: "" });

function normalizePolicy(policy: YunzhiPolicy): YunzhiPolicy {
    const rawEnabled = policy.enabled_models || {};
    const rawDefaults = policy.default_models || {};
    return {
        ...policy,
        enabled_models: Object.fromEntries(capabilities.map((capability) => [capability, Array.isArray(rawEnabled[capability]) ? rawEnabled[capability] : []])) as YunzhiPolicy["enabled_models"],
        default_models: Object.fromEntries(capabilities.map((capability) => [capability, typeof rawDefaults[capability] === "string" ? rawDefaults[capability] : ""])) as YunzhiPolicy["default_models"],
    };
}

export default function AdminPage() {
    const { message } = App.useApp();
    const user = useUserStore((state) => state.user);
    const refreshPolicy = useUserStore((state) => state.refreshPolicy);
    const [catalog, setCatalog] = useState<YunzhiCatalog | null>(null);
    const [policy, setPolicy] = useState<YunzhiPolicy | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    const load = async (silent = false) => {
        const token = getYunzhiSessionToken();
        if (!token) return;
        if (!silent) setLoading(true);
        try {
            const [nextCatalog, nextPolicy] = await Promise.all([fetchYunzhiCatalog(token), fetchYunzhiPolicy(token)]);
            setCatalog({ models: Array.isArray(nextCatalog.models) ? nextCatalog.models : [], groups: Array.isArray(nextCatalog.groups) ? nextCatalog.groups : [] });
            setPolicy(normalizePolicy(nextPolicy.config));
        } catch (error) {
            if (!silent) message.error(error instanceof Error ? error.message : "读取云智管理配置失败");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    useEffect(() => {
        const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("yunzhi-canvas-config") : null;
        const sync = () => void load(true);
        channel?.addEventListener("message", sync);
        window.addEventListener("storage", sync);
        const timer = window.setInterval(sync, 15_000);
        return () => {
            channel?.removeEventListener("message", sync);
            channel?.close();
            window.removeEventListener("storage", sync);
            window.clearInterval(timer);
        };
    }, []);

    const groupedModels = useMemo(() => {
        const groups = Object.fromEntries(capabilities.map((capability) => [capability, [] as string[]])) as Record<ModelCapability, string[]>;
        for (const name of catalog?.models || []) groups[guessCapability(name)].push(name);
        return groups;
    }, [catalog]);

    if (!user || user.role < 10) {
        return <main className="flex h-full items-center justify-center bg-[#fffaf0] p-6 dark:bg-[#1d1711]"><Empty description="你没有访问云智管理员后台的权限" /></main>;
    }
    if (loading || !policy || !catalog) {
        return <main className="flex h-full items-center justify-center bg-[#fffaf0] dark:bg-[#1d1711]"><Spin /></main>;
    }

    const updateEnabled = (capability: ModelCapability, values: string[]) => {
        const defaults = { ...policy.default_models };
        if (defaults[capability] && values.length && !values.includes(defaults[capability])) defaults[capability] = "";
        setPolicy({ ...policy, enabled_models: { ...policy.enabled_models, [capability]: values }, default_models: defaults });
    };
    const moveModel = (capability: ModelCapability, model: string, delta: -1 | 1) => {
        const values = [...policy.enabled_models[capability]];
        const index = values.indexOf(model);
        const next = index + delta;
        if (index < 0 || next < 0 || next >= values.length) return;
        [values[index], values[next]] = [values[next], values[index]];
        updateEnabled(capability, values);
    };
    const toggleModel = (capability: ModelCapability, models: string[], model: string, checked: boolean) => {
        const current = policy.enabled_models[capability].length ? policy.enabled_models[capability] : models;
        const values = checked ? [...current, model] : current.filter((item) => item !== model);
        updateEnabled(capability, values.length === models.length ? [] : values);
    };
    const save = async () => {
        setSaving(true);
        try {
            const response = await saveYunzhiPolicy(getYunzhiSessionToken(), { default_group: policy.default_group, enabled_models: policy.enabled_models, default_models: policy.default_models });
            setPolicy(normalizePolicy(response.config));
            const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("yunzhi-canvas-config") : null;
            channel?.postMessage({ revision: response.config.revision });
            channel?.close();
            localStorage.setItem("yunzhi-canvas-config-updated", String(response.config.revision));
            await refreshPolicy();
            message.success("云智画布配置已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存云智画布配置失败");
        } finally {
            setSaving(false);
        }
    };
    const testConnection = async () => {
        setTesting(true);
        try {
            await fetchYunzhiModels(getYunzhiSessionToken());
            message.success("云智模型目录连接正常");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "云智模型目录连接失败");
        } finally {
            setTesting(false);
        }
    };

    return (
        <main className="h-full overflow-y-auto bg-[#fffaf0] px-6 py-8 text-[#181818] dark:bg-[#1d1711] dark:text-[#fff8ed]">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div><Tag color="orange" icon={<ShieldCheck className="size-3" />}>管理员空间</Tag><Typography.Title level={2} className="!mb-1 !mt-3">云智画布模型策略</Typography.Title><Typography.Text type="secondary">统一控制模型可见性、默认模型和调用分组。</Typography.Text></div>
                    <Space wrap><Button icon={<RefreshCw className="size-4" />} onClick={() => void load()} loading={loading}>刷新目录</Button><Button icon={<CheckCircle2 className="size-4" />} onClick={() => void testConnection()} loading={testing}>测试连接</Button><Button type="primary" icon={<Save className="size-4" />} onClick={() => void save()} loading={saving}>保存配置</Button></Space>
                </div>
                <Card title="默认调用分组" className="mb-5"><Select className="w-full max-w-sm" value={policy.default_group} options={(catalog.groups || []).map((group) => ({ value: group, label: group === "auto" ? "auto（自动路由）" : group }))} onChange={(value) => setPolicy({ ...policy, default_group: value })} /><Typography.Paragraph type="secondary" className="!mb-0 !mt-2">Canvas 令牌会使用此分组，修改后新请求立即生效。</Typography.Paragraph></Card>
                <Row gutter={[16, 16]}>
                    {capabilities.map((capability) => {
                        const models = groupedModels[capability];
                        const selected = policy.enabled_models[capability];
                        const orderedModels = [...selected, ...models.filter((model) => !selected.includes(model))];
                        return <Col key={capability} xs={24} lg={12}><Card title={labels[capability]} extra={<Tag>{models.length} 个模型</Tag>}><div className="flex max-h-64 flex-col gap-1 overflow-y-auto">{orderedModels.map((model) => { const index = selected.indexOf(model); const checked = selected.length === 0 || index >= 0; return <div key={model} className="flex items-center gap-2"><Checkbox checked={checked} onChange={(event) => toggleModel(capability, models, model, event.target.checked)}>{model}</Checkbox>{index >= 0 ? <span className="ml-auto inline-flex"><Button type="text" size="small" icon={<ChevronUp className="size-3.5" />} disabled={index === 0} onClick={() => moveModel(capability, model, -1)} aria-label="上移" /><Button type="text" size="small" icon={<ChevronDown className="size-3.5" />} disabled={index === selected.length - 1} onClick={() => moveModel(capability, model, 1)} aria-label="下移" /></span> : null}</div>; })}</div><div className="mt-5 border-t border-stone-200 pt-4 dark:border-stone-700"><Typography.Text type="secondary">默认模型</Typography.Text><Select allowClear className="mt-2 w-full" placeholder="未指定时使用第一个可用模型" value={policy.default_models[capability] || undefined} options={(selected.length ? selected : models).map((model) => ({ label: model, value: model }))} onChange={(value) => setPolicy({ ...policy, default_models: { ...policy.default_models, [capability]: value || "" } })} /></div></Card></Col>;
                    })}
                </Row>
                <div className="mt-5 text-xs text-stone-500">配置版本 {policy.revision} · 最后更新 {policy.updated_at ? new Date(policy.updated_at * 1000).toLocaleString() : "尚未更新"}</div>
            </div>
        </main>
    );
}
