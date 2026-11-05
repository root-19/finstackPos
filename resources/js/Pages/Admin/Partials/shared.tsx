import { Badge } from '@/Components/ui';
import { formatMoney } from '@/lib/money';

export const peso = (cents: number) => formatMoney(cents, 'PHP');

export const shortDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

/** Free / Pro / expiring / ended, always with text. */
export function PlanBadge({
    pro,
    trial = false,
    daysLeft,
    active = true,
}: {
    pro: boolean;
    trial?: boolean;
    daysLeft: number | null;
    active?: boolean;
}) {
    if (!active) {
        return <Badge tone="dark">Suspended</Badge>;
    }
    if (trial) {
        return <Badge tone="blue">Trial</Badge>;
    }
    if (pro) {
        return daysLeft !== null && daysLeft <= 7 ? <Badge tone="amber">Pro · ends soon</Badge> : <Badge tone="green">Pro</Badge>;
    }

    return daysLeft !== null ? <Badge tone="red">Pro ended</Badge> : <Badge>Free</Badge>;
}

/** "23 days left", "ends today", "ended 4 days ago", or "—" for never subscribed. */
export function DaysLeft({ days }: { days: number | null }) {
    if (days === null) {
        return <span className="text-gray-400">—</span>;
    }
    if (days > 0) {
        return (
            <span className={days <= 7 ? 'font-semibold text-amber-700' : 'text-gray-950'}>
                {days} day{days === 1 ? '' : 's'} left
            </span>
        );
    }
    if (days === 0) {
        return <span className="font-semibold text-amber-700">Ends today</span>;
    }

    return (
        <span className="text-red-600">
            Ended {Math.abs(days)} day{days === -1 ? '' : 's'} ago
        </span>
    );
}
