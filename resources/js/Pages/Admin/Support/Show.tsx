import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import SupportThread, { SupportMessage, UploadRules } from '@/Components/SupportThread';
import { Badge } from '@/Components/ui';
import AdminLayout from '@/Layouts/AdminLayout';
import { PageProps } from '@/types';
import { Head, Link } from '@inertiajs/react';

type Store = { id: number; name: string; slug: string; owner: string | null; is_active: boolean; pro: boolean };

export default function SupportShow({ store, messages, upload }: PageProps<{ store: Store; messages: SupportMessage[]; upload: UploadRules }>) {
    return (
        <AdminLayout header={<PageHeader title={store.name} subtitle={store.owner ?? store.slug} />}>
            <Head title={`Support · ${store.name}`} />

            <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2 sm:px-6">
                    <Link href={route('admin.support.index')} className="btn btn-ghost btn-sm -ms-2.5">
                        <Icon name="chevronLeft" className="h-3.5 w-3.5" />
                        All conversations
                    </Link>
                    <span className="ms-auto flex items-center gap-2">
                        <Badge tone={store.pro ? 'brand' : 'gray'}>{store.pro ? 'Pro' : 'Free'}</Badge>
                        {!store.is_active && <Badge tone="red">Suspended</Badge>}
                        <Link href={route('admin.stores.show', store.id)} className="btn btn-secondary btn-sm">
                            Open store
                        </Link>
                    </span>
                </div>
                <div className="min-h-0 flex-1 bg-surface">
                    <SupportThread
                        messages={messages}
                        postTo={route('admin.support.store', store.id)}
                        mine="admin"
                        upload={upload}
                        placeholder={`Reply to ${store.name}…`}
                        emptyTitle="No messages yet"
                        emptyText="This store has not written to support."
                    />
                </div>
            </div>
        </AdminLayout>
    );
}
