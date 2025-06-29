"use client";

import { CallView } from "@/components/amigo-talk/call-view";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export default function CallPage() {
    const params = useParams();
    const callId = Array.isArray(params.callId) ? params.callId[0] : params.callId;

    if (!callId) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <div className="flex flex-col items-center space-y-4">
                    <Skeleton className="h-32 w-32 rounded-full" />
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-16 w-64" />
                </div>
            </div>
        );
    }

    return <CallView callId={callId} />;
}
