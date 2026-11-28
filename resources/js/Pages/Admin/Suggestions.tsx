import PageHeader from '@/Components/PageHeader';
import Pagination from '@/Components/Pagination';
import { Badge, Card, EmptyState, Field, Stat } from '@/Components/ui';
import AdminLayout from '@/Layouts/AdminLayout';
import { PageProps, Paginated } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { shortDate } from './Partials/shared';

type Plan = 'free' | 'trial' | 'pro';

type Suggestion = {
    id: number;
    store_id: number;
    store: string;
    user: string | null;
    email: string | null;
    plan: Plan;
    category: string;
    title: string;
    details: string | null;
    status: string;
    admin_note: string | null;
    created_at: string;
};

type Filters = { plan: Plan | null; status: string | null; category: string | null };

type Props = {
    suggestions: Paginated<Suggestion>;
    filters: Filters;
    categories: Record<string, string>;
    statuses: Record<string, string>;
    counts: { total: number; new: number; by_plan: Partial<Record<Plan, number>> };
};

const PLAN_LABEL: Record<Plan, string> = { free: 'Free', trial: 'Pro trial', pro: 'Pro' };
const PLAN_TONE: Record<Plan, 'gray' | 'blue' | 'brand'> = { free: 'gray', trial: 'blue', pro: 'brand' };
const STATUS_TONE: Record<string, 'gray' | 'blue' | 'amber' | 'green' | 'red'> = {
    new: 'gray',
    reviewing: 'blue',
    planned: 'amber',
    done: 'green',
    declined: 'red',
};

/** Every store's feature suggestions, with the store's plan when it was sent. */
export default function AdminSuggestions({ suggestions, filters, categories, statuses, counts }: PageProps<Props>) {
    const go = (changes: Partial<Filters>) =>
        router.get(
            route('admin.suggestions.index'),
            Object.fromEntries(Object.entries({ ...filters, ...changes }).filter(([, v]) => v !== null && v !== '')),
            { preserveState: true, preserveScroll: true, replace: true },
        );

    return (
        <AdminLayout header={<PageHeader title="Suggestions" subtitle="Feature ideas from stores, with their plan when they sent them" />}>
            <Head title="Suggestions" />

            <div className="app-page">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <Stat label="All suggestions" value={String(counts.total)} />
                    <Stat label="New" value={String(counts.new)} />
                    <Stat label="From Free" value={String(counts.by_plan.free ?? 0)} />
                    <Stat label="From Pro trial" value={String(counts.by_plan.trial ?? 0)} />
                    <Stat label="From Pro" value={String(counts.by_plan.pro ?? 0)} />
                </div>

                <Card className="p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Field label="Plan">
                            <select className="input" value={filters.plan ?? ''} onChange={(e) => go({ plan: (e.target.value || null) as Plan | null })}>
                                <option value="">All plans</option>
                                {(Object.keys(PLAN_LABEL) as Plan[]).map((p) => (
                                    <option key={p} value={p}>
                                        {PLAN_LABEL[p]}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Status">
                            <select className="input" value={filters.status ?? ''} onChange={(e) => go({ status: e.target.value || null })}>
                                <option value="">All statuses</option>
                                {Object.entries(statuses).map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Topic">
                            <select className="input" value={filters.category ?? ''} onChange={(e) => go({ category: e.target.value || null })}>
                                <option value="">All topics</option>
                                {Object.entries(categories).map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>
                </Card>

                {suggestions.data.length === 0 ? (
                    <Card>
                        <div className="card-body">
                            <EmptyState title="No suggestions here yet">Stores send them from “Suggest a feature” in their sidebar.</EmptyState>
                        </div>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {suggestions.data.map((s) => (
                            <SuggestionCard key={s.id} s={s} categories={categories} statuses={statuses} />
                        ))}
                    </div>
                )}

                <Pagination paginator={suggestions} noun="suggestions" />
            </div>
        </AdminLayout>
    );
}

function SuggestionCard({ s, categories, statuses }: { s: Suggestion; categories: Record<string, string>; statuses: Record<string, string> }) {
    const [status, setStatus] = useState(s.status);
    const [note, setNote] = useState(s.admin_note ?? '');
    const [saving, setSaving] = useState(false);
    const dirty = status !== s.status || note !== (s.admin_note ?? '');

    const save = () => {
        setSaving(true);
        router.patch(route('admin.suggestions.update', s.id), { status, admin_note: note || null }, { preserveScroll: true, onFinish: () => setSaving(false) });
    };

    return (
        <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-lg font-semibold text-gray-900">{s.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                        <Badge tone={PLAN_TONE[s.plan]}>{PLAN_LABEL[s.plan]}</Badge>
                        <Link href={route('admin.stores.show', s.store_id)} className="font-semibold text-gray-900 underline-offset-2 hover:underline">
                            {s.store}
                        </Link>
                        <span>·</span>
                        <span>
                            {s.user ?? 'Deleted user'}
                            {s.email ? ` (${s.email})` : ''}
                        </span>
                        <span>·</span>
                        <span>{categories[s.category] ?? s.category}</span>
                        <span>·</span>
                        <span>{shortDate(s.created_at)}</span>
                    </p>
                </div>
                <Badge tone={STATUS_TONE[s.status] ?? 'gray'}>{statuses[s.status] ?? s.status}</Badge>
            </div>

            {s.details && <p className="mt-3 whitespace-pre-line text-[15px] text-gray-700">{s.details}</p>}

            <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:items-end">
                <Field label="Status">
                    <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                        {Object.entries(statuses).map(([v, l]) => (
                            <option key={v} value={v}>
                                {l}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Note to the store (optional)">
                    <input className="input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Coming in the next update" />
                </Field>
                <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
                    Save
                </button>
            </div>
        </Card>
    );
}
