import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import { Badge, Card, EmptyState } from '@/Components/ui';
import AdminLayout from '@/Layouts/AdminLayout';
import { formatDateTime } from '@/lib/format';
import { PageProps } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { useEffect } from 'react';

type Thread = {
    store_id: number;
    store: string;
    slug: string;
    owner: string | null;
    is_active: boolean;
    unread: number;
    last_from_admin: boolean;
    last_body: string;
    last_at: string;
};

export default function SupportIndex({ threads }: PageProps<{ threads: Thread[] }>) {
    useEffect(() => {
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                router.reload({ only: ['threads', 'auth'] });
            }
        }, 10000);

        return () => window.clearInterval(timer);
    }, []);

    const waiting = threads.filter((t) => t.unread > 0).length;

    return (
        <AdminLayout header={<PageHeader title="Support" subtitle={waiting ? `${waiting} store(s) waiting for a reply` : 'Every store is answered'} />}>
            <Head title="Support" />

            <div className="app-page">
                <Card>
                    {threads.length === 0 ? (
                        <EmptyState title="No messages yet" icon={<Icon name="chat" className="h-6 w-6" />}>
                            Stores write to you from their Support page. Conversations show up here.
                        </EmptyState>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {threads.map((t) => (
                                <li key={t.store_id}>
                                    <Link
                                        href={route('admin.support.show', t.store_id)}
                                        className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 sm:px-5"
                                    >
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold uppercase text-white">
                                            {t.store.slice(0, 1)}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className={`truncate text-sm ${t.unread ? 'font-semibold text-gray-950' : 'font-medium text-gray-800'}`}>{t.store}</p>
                                                {!t.is_active && <Badge tone="red">Suspended</Badge>}
                                                {t.unread > 0 && <Badge tone="brand">{t.unread} new</Badge>}
                                            </div>
                                            {t.owner && <p className="truncate text-xs text-gray-500">{t.owner}</p>}
                                            <p className={`mt-1 truncate text-sm ${t.unread ? 'text-gray-900' : 'text-gray-500'}`}>
                                                {t.last_from_admin ? 'You: ' : ''}
                                                {t.last_body}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-xs text-gray-400">{formatDateTime(t.last_at)}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </AdminLayout>
    );
}
