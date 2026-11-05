import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import Pagination from '@/Components/Pagination';
import { Card, EmptyState, Segmented } from '@/Components/ui';
import AdminLayout from '@/Layouts/AdminLayout';
import { PageProps, Paginated } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { DaysLeft, PlanBadge, shortDate } from '../Partials/shared';

type Store = {
    id: number;
    name: string;
    slug: string;
    owner: string | null;
    is_active: boolean;
    pro: boolean;
    trial: boolean;
    until: string | null;
    days_left: number | null;
    products: number;
    users: number;
    branches: number;
    last_sale_at: string | null;
    created_at: string;
};

type Plan = '' | 'pro' | 'trial' | 'free' | 'expiring' | 'expired' | 'suspended';
type Filters = { search: string; plan: Exclude<Plan, ''> | null; sort: 'newest' | 'expiring' | 'name' };

export default function StoresIndex({ stores, filters }: PageProps<{ stores: Paginated<Store>; filters: Filters }>) {
    const [search, setSearch] = useState(filters.search);
    const go = (changes: Partial<Filters>) =>
        router.get(
            route('admin.stores.index'),
            Object.fromEntries(Object.entries({ ...filters, ...changes }).filter(([, v]) => v !== null && v !== '')),
            { preserveState: true, preserveScroll: true, replace: true },
        );

    useEffect(() => {
        if (search === filters.search) {
            return;
        }
        const t = window.setTimeout(() => go({ search }), 300);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    return (
        <AdminLayout header={<PageHeader title="Stores" subtitle={`${stores.total} store(s)`} />}>
            <Head title="Stores" />

            <div className="app-page">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                    <div className="relative min-w-0 flex-1 lg:max-w-sm">
                        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Store name, slug, or owner email"
                            aria-label="Search stores"
                            className="input pl-9"
                        />
                    </div>
                    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                        <Segmented<Plan>
                            label="Plan"
                            value={filters.plan ?? ''}
                            onChange={(plan) => go({ plan: plan || null })}
                            options={[
                                { value: '', label: 'All' },
                                { value: 'pro', label: 'Paying' },
                                { value: 'trial', label: 'Trial' },
                                { value: 'free', label: 'Free' },
                                { value: 'expiring', label: 'Ending ≤ 7 days' },
                                { value: 'expired', label: 'Ended' },
                                { value: 'suspended', label: 'Suspended' },
                            ]}
                        />
                    </div>
                    <select
                        value={filters.sort}
                        onChange={(e) => go({ sort: e.target.value as Filters['sort'] })}
                        aria-label="Sort"
                        className="input lg:ms-auto lg:w-48"
                    >
                        <option value="newest">Newest first</option>
                        <option value="expiring">Pro ending soonest</option>
                        <option value="name">Name A–Z</option>
                    </select>
                </div>

                <Card className="overflow-hidden">
                    {stores.data.length === 0 ? (
                        <EmptyState title="No stores match" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Store</th>
                                        <th>Plan</th>
                                        <th>Pro until</th>
                                        <th>Time left</th>
                                        <th className="num">Products</th>
                                        <th className="num">Users</th>
                                        <th className="num">Branches</th>
                                        <th>Last sale</th>
                                        <th>Joined</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stores.data.map((s) => (
                                        <tr key={s.id}>
                                            <td>
                                                <Link
                                                    href={route('admin.stores.show', s.id)}
                                                    className="font-medium text-gray-950 hover:text-brand-700"
                                                >
                                                    {s.name}
                                                </Link>
                                                <p className="text-xs text-gray-500">{s.owner ?? s.slug}</p>
                                            </td>
                                            <td>
                                                <PlanBadge pro={s.pro} trial={s.trial} daysLeft={s.days_left} active={s.is_active} />
                                            </td>
                                            <td className="whitespace-nowrap">{shortDate(s.until)}</td>
                                            <td className="whitespace-nowrap">
                                                <DaysLeft days={s.days_left} />
                                            </td>
                                            <td className="num">{s.products}</td>
                                            <td className="num">{s.users}</td>
                                            <td className="num">{s.branches}</td>
                                            <td className="whitespace-nowrap">{shortDate(s.last_sale_at)}</td>
                                            <td className="whitespace-nowrap">{shortDate(s.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pagination paginator={stores} noun="stores" />
                </Card>
            </div>
        </AdminLayout>
    );
}
