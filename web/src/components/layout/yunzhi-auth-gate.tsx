import { Button, Result, Spin } from "antd";
import { ArrowRight, LogIn, RotateCw } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

import { useUserStore } from "@/stores/use-user-store";

export function YunzhiAuthGate({ children }: { children: ReactNode }) {
    const status = useUserStore((state) => state.status);
    const error = useUserStore((state) => state.error);
    const initialize = useUserStore((state) => state.initialize);
    const loginRedirect = useUserStore((state) => state.loginRedirect);
    const redirectStarted = useRef(false);
    const localDevelopment = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);

    useEffect(() => {
        if (status === "idle") void initialize();
    }, [initialize, status]);

    useEffect(() => {
        if (status !== "unauthenticated" || localDevelopment || redirectStarted.current) return;
        redirectStarted.current = true;
        window.location.assign("https://yunzhicode.com/sign-in?redirect=" + encodeURIComponent(window.location.href));
    }, [localDevelopment, status]);

    if (status === "authenticated") return <>{children}</>;
    if (status === "checking" || status === "idle") {
        return (
            <main className="flex h-full items-center justify-center bg-[#fffaf0] text-[#646464] dark:bg-[#1d1711] dark:text-[#d6c7b4]">
                <div className="flex items-center gap-3 text-sm"><Spin size="small" />正在连接云智画布</div>
            </main>
        );
    }

    return (
        <main className="relative flex h-full items-center justify-center overflow-hidden bg-[#fffaf0] px-6 py-12 text-[#181818] dark:bg-[#1d1711] dark:text-[#fff8ed]">
            <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(233,107,24,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(233,107,24,.08)_1px,transparent_1px)] [background-size:48px_48px]" />
            <section className="relative w-full max-w-xl border border-[#e9d7bb] bg-[#fffdf8]/90 p-8 shadow-[0_24px_70px_rgba(117,70,24,.12)] backdrop-blur-xl dark:border-[#5b4632] dark:bg-[#281e15]/90 sm:p-12">
                <div className="mb-10 flex items-center gap-3">
                    <img src="https://yunzhicode.com/logo.png" alt="云智 AI" className="size-10 rounded-xl object-contain" />
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b75d13]">YUNZHI AI</div>
                        <div className="mt-1 text-sm text-[#646464] dark:text-[#d6c7b4]">云智画布</div>
                    </div>
                </div>
                <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-[-0.03em]">登录后开始你的 AI 创作工作台</h1>
                <p className="mt-5 max-w-md text-base leading-7 text-[#646464] dark:text-[#d6c7b4]">使用云智账号登录，模型和线路会自动准备好，画布数据仍保存在你的浏览器中。</p>
                    {error ? <p className="mt-5 text-sm text-[#b42318]">{error}</p> : null}
                <div className="mt-9 flex flex-wrap gap-3">
                    <Button type="primary" size="large" icon={<LogIn className="size-4" />} onClick={loginRedirect}>
                        登录云智账号
                    </Button>
                    {error ? <Button size="large" icon={<RotateCw className="size-4" />} onClick={() => void initialize()}>重新连接</Button> : null}
                    <span className="inline-flex items-center gap-1 text-sm text-[#a2632d]">进入后自动返回 <ArrowRight className="size-4" /></span>
                </div>
            </section>
        </main>
    );
}
