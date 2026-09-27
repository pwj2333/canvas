import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Checkbox, Col, Empty, Row, Select, Space, Spin, Tag, Typography } from "antd";
import { CheckCircle2, ChevronDown, ChevronUp, RefreshCw, Save, ShieldCheck } from "lucide-react";

import { fetchYunzhiCatalog, fetchYunzhiModels, fetchYunzhiPolicy, getYunzhiSessionToken, saveYunzhiPolicy, type YunzhiCatalog } from "@/services/api/yunzhi-auth";
import { type ModelCapability, type YunzhiPolicy } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

const capabilities: ModelCapability[] = ["text", "image", "video", "audio"];
const labels: Record<ModelCapability, string> = { text: "文本模型", image: "图片模型", video: "视频模型", audio: "音频模型" };
const emptySelection = (): YunzhiPolicy["enabled_models"] => ({ text: [], image: [], video: [], audio: [] });
const emptyDefaults = (): YunzhiPolicy["default_models"] => ({ text: "", image: "", video: "", audio: "" });
const emptyGroups = (): YunzhiPolicy["default_groups"] => ({ text: "auto", image: "auto", video: "auto", audio: "auto" });

function normalizePolicy(policy: YunzhiPolicy): YunzhiPolicy {
    const rawEnabled = policy.enabled_models || {};
    const rawDefaults = policy.default_models || {};
    const rawGroups = policy.default_groups || {};
    return {
        ...policy,
        enabled_models: Object.fromEntries(capabilities.map((capability) => [capability, Array.isArray(rawEnabled[capability]) ? rawEnabled[capability] : []])) as YunzhiPolicy["enabled_models"],
        default_models: Object.fromEntries(capabilities.map((capability) => [capability, typeof rawDefaults[capability] === "string" ? rawDefaults[capability] : ""])) as YunzhiPolicy["default_models"],
        default_groups: Object.fromEntries(capabilities.map((capability) => [capability, typeof rawGroups[capability] === "string" ? rawGroups[capability] : policy.default_group || "auto"])) as YunzhiPolicy["default_groups"],
        model_types: policy.model_types && typeof policy.model_types === "object" ? policy.model_types : {},
        enabled_models_configured: Boolean(policy.enabled_models_configured),
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

    useEffect(() => { void load(); }, []);
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

    const categorized = useMemo(() => {
        const groups = Object.fromEntries(capabilities.map((capability) => [capability, [] as string[]])) as Record<ModelCapability, string[]>;
        const unclassified: string[] = [];
        for (const name of catalog?.models || []) {
            const capability = policy?.model_types[name];
            if (capability && capabilities.includes(capability)) groups[capability].push(name);
            else unclassified.push(name);
        }
        return { groups, unclassified };
    }, [catalog, policy?.model_types]);

    if (!user || user.role < 10) return <main className="flex h-full items-center justify-center bg-[#fffaf0] p-6 dark:bg-[#1d1711]"><Empty description="你没有访问云智管理员后台的权限" /></main>;
    if (loading || !policy || !catalog) return <main className="flex h-full items-center justify-center bg-[#fffaf0] dark:bg-[#1d1711]"><Spin /></main>;

    const effectiveEnabled = (capability: ModelCapability) => policy.enabled_models_configured ? policy.enabled_models[capability] : categorized.groups[capability];
    const materializeEnabled = () => policy.enabled_models_configured ? { ...policy.enabled_models } : Object.fromEntries(capabilities.map((capability) => [capability, categorized.groups[capability]])) as YunzhiPolicy["enabled_models"];
    const setEnabled = (capability: ModelCapability, model: string, enabled: boolean) => {
        const next = materializeEnabled();
        const names = next[capability].filter((name) => name !== model);
        if (enabled) names.push(model);
        next[capability] = names;
        const defaults = { ...policy.default_models };
        if (!enabled && defaults[capability] === model) defaults[capability] = "";
        setPolicy({ ...policy, enabled_models: next, enabled_models_configured: true, default_models: defaults });
    };
    const setModelType = (model: string, value?: ModelCapability) => {
        const previous = policy.model_types[model];
        if (previous === value) return;
        const types = { ...policy.model_types };
        if (value) types[model] = value;
        else delete types[model];
        const next = materializeEnabled();
        const wasEnabled = previous ? next[previous].includes(model) : false;
        if (previous) next[previous] = next[previous].filter((name) => name !== model);
        if (value && wasEnabled) next[value] = [...next[value].filter((name) => name !== model), model];
        const defaults = { ...policy.default_models };
        if (previous && defaults[previous] === model) defaults[previous] = "";
        setPolicy({ ...policy, model_types: types, enabled_models: next, enabled_models_configured: true, default_models: defaults });
    };
    const moveModel = (capability: ModelCapability, model: string, delta: -1 | 1) => {
        const next = materializeEnabled();
        const names = [...next[capability]];
        const index = names.indexOf(model);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= names.length) return;
        [names[index], names[target]] = [names[target], names[index]];
        next[capability] = names;
        setPolicy({ ...policy, enabled_models: next, enabled_models_configured: true });
    };
    const save = async () => {
        setSaving(true);
        try {
            const response = await saveYunzhiPolicy(getYunzhiSessionToken(), {
                default_groups: policy.default_groups,
                enabled_models: policy.enabled_models,
                enabled_models_configured: true,
                model_types: policy.model_types,
                default_models: policy.default_models,
            });
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
            await fetchYunzhiModels(getYunzhiSessionToken(), policy);
            message.success("云智模型目录连接正常");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "云智模型目录连接失败");
        } finally {
            setTesting(false);
        }
    };
    const groupSelect = (capability: ModelCapability) => <Select className="w-full" value={policy.default_groups[capability]} options={catalog.groups.map((group) => ({ value: group, label: group === "auto" ? "auto（自动路由）" : group }))} onChange={(value) => setPolicy({ ...policy, default_groups: { ...policy.default_groups, [capability]: value } })} />;
    const typeSelect = (name: string) => <Select<string> size="small" value={policy.model_types[name] || "unclassified"} options={[{ value: "unclassified", label: "未分类" }, ...capabilities.map((capability) => ({ value: capability, label: labels[capability] }))]} onChange={(value) => setModelType(name, value === "unclassified" ? undefined : value as ModelCapability)} />;
    const modelRows = (capability: ModelCapability) => {
        const enabled = effectiveEnabled(capability);
        const names = [...categorized.groups[capability]].sort((a, b) => {
            const ai = enabled.indexOf(a), bi = enabled.indexOf(b);
            if (ai >= 0 && bi >= 0) return ai - bi;
            if (ai >= 0) return -1;
            if (bi >= 0) return 1;
            return a.localeCompare(b);
        });
        return names.map((name) => {
            const index = enabled.indexOf(name);
            return <div key={name} className="flex min-h-9 items-center gap-2 border-b border-stone-100 py-1.5 last:border-0 dark:border-stone-800">
                <Checkbox checked={index >= 0} onChange={(event) => setEnabled(capability, name, event.target.checked)} aria-label={`启用 ${name}`} />
                <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                {index >= 0 ? <span className="inline-flex shrink-0"><Button type="text" size="small" icon={<ChevronUp className="size-3.5" />} disabled={index === 0} onClick={() => moveModel(capability, name, -1)} aria-label="上移" /><Button type="text" size="small" icon={<ChevronDown className="size-3.5" />} disabled={index === enabled.length - 1} onClick={() => moveModel(capability, name, 1)} aria-label="下移" /></span> : null}
                {typeSelect(name)}
            </div>;
        });
    };

    return <main className="h-full overflow-y-auto bg-[#fffaf0] px-6 py-8 text-[#181818] dark:bg-[#1d1711] dark:text-[#fff8ed]">
        <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div><Tag color="orange" icon={<ShieldCheck className="size-3" />}>管理员空间</Tag><Typography.Title level={2} className="!mb-1 !mt-3">云智画布模型策略</Typography.Title><Typography.Text type="secondary">逐个指定模型类型、启用状态、默认模型和调用分组。</Typography.Text></div>
                <Space wrap><Button icon={<RefreshCw className="size-4" />} onClick={() => void load()} loading={loading}>刷新目录</Button><Button icon={<CheckCircle2 className="size-4" />} onClick={() => void testConnection()} loading={testing}>测试连接</Button><Button type="primary" icon={<Save className="size-4" />} onClick={() => void save()} loading={saving}>保存配置</Button></Space>
            </div>
            <Row gutter={[16, 16]}>
                {capabilities.map((capability) => {
                    const enabled = effectiveEnabled(capability);
                    return <Col key={capability} xs={24} lg={12}><Card title={labels[capability]} extra={<Tag>{categorized.groups[capability].length} 个模型</Tag>}>
                        <div className="mb-4"><Typography.Text type="secondary">默认调用分组</Typography.Text><div className="mt-2">{groupSelect(capability)}</div></div>
                        <div className="max-h-80 overflow-y-auto border-y border-stone-200 dark:border-stone-700">
                            {modelRows(capability)}
                            {categorized.groups[capability].length === 0 ? <div className="py-5 text-center text-sm text-stone-500">还没有分配到此类型的模型</div> : null}
                        </div>
                        <div className="mt-4"><Typography.Text type="secondary">默认模型</Typography.Text><Select allowClear className="mt-2 w-full" placeholder="未指定时使用第一个启用模型" value={policy.default_models[capability] || undefined} options={enabled.map((name) => ({ label: name, value: name }))} onChange={(value) => setPolicy({ ...policy, default_models: { ...policy.default_models, [capability]: value || "" } })} /></div>
                    </Card></Col>;
                })}
                <Col span={24}><Card title="未分类模型" extra={<Tag>{categorized.unclassified.length} 个模型</Tag>}>
                    <Typography.Paragraph type="secondary">新模型需先指定类型，保存后才会出现在用户的模型选择中。</Typography.Paragraph>
                    {categorized.unclassified.length ? <div className="grid gap-x-8 sm:grid-cols-2">{categorized.unclassified.map((name) => <div key={name} className="flex min-h-10 items-center justify-between gap-3 border-b border-stone-100 py-2 dark:border-stone-800"><span className="min-w-0 truncate text-sm">{name}</span>{typeSelect(name)}</div>)}</div> : <div className="py-2 text-sm text-stone-500">所有模型均已指定类型</div>}
                </Card></Col>
            </Row>
            <div className="mt-5 text-xs text-stone-500">配置版本 {policy.revision} · 最后更新 {policy.updated_at ? new Date(policy.updated_at * 1000).toLocaleString() : "尚未更新"}</div>
        </div>
    </main>;
}
