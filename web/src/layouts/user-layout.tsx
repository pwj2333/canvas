import type { ReactNode } from "react";

import { AgentPanel } from "@/components/agent/agent-panel";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { YunzhiAuthGate } from "@/components/layout/yunzhi-auth-gate";

export default function UserLayout({ children }: { children: ReactNode }) {
    return (
        <YunzhiAuthGate>
            <div className="flex h-dvh overflow-hidden bg-background text-foreground">
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    <AppTopNav />
                    <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
                </div>
                <AgentPanel />
            </div>
        </YunzhiAuthGate>
    );
}
