/** A pulsing placeholder block. */
export function Bone({ className = '' }: { className?: string }) {
    return <div className={`animate-pulse rounded-lg bg-gray-200/80 ${className}`} />;
}

/** Stand-in for a back-office page (stat cards + a list) while it loads. */
export function PageSkeleton() {
    return (
        <div role="status" aria-label="Loading" className="app-page">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="stat">
                        <Bone className="h-4 w-24" />
                        <Bone className="mt-3 h-7 w-32" />
                    </div>
                ))}
            </div>

            <div className="flex gap-3">
                <Bone className="h-9 flex-1 rounded-lg" />
                <Bone className="hidden h-11 w-40 rounded-xl sm:block" />
                <Bone className="h-9 w-32 rounded-lg" />
            </div>

            <div className="card overflow-hidden">
                <div className="border-b border-gray-100 bg-gray-50 px-6 py-3">
                    <Bone className="h-3 w-48" />
                </div>
                <ul className="divide-y divide-gray-100">
                    {Array.from({ length: 6 }, (_, i) => (
                        <li key={i} className="flex items-center gap-4 px-6 py-4">
                            <Bone className="h-11 w-11 shrink-0" />
                            <div className="flex-1 space-y-2">
                                <Bone className="h-4 w-1/3" />
                                <Bone className="h-3 w-1/5" />
                            </div>
                            <Bone className="hidden h-4 w-20 sm:block" />
                            <Bone className="h-6 w-16 rounded-full" />
                        </li>
                    ))}
                </ul>
            </div>
            <span className="sr-only">Loading…</span>
        </div>
    );
}

/** Stand-in for POS product tiles while the catalog loads. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
    return (
        <>
            {Array.from({ length: count }, (_, i) => (
                <div key={i} role="presentation" className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
                    <Bone className="aspect-[4/3] w-full rounded-none" />
                    <div className="space-y-2 p-3">
                        <Bone className="h-4 w-3/4" />
                        <Bone className="h-4 w-1/2" />
                    </div>
                </div>
            ))}
        </>
    );
}
