import PageHeader from '@/Components/PageHeader';
import OrdersBoard from '@/Components/TableOrders/OrdersBoard';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { useDeviceBranch } from '@/lib/branch';
import { useTableOrders } from '@/lib/tableOrders';
import { PageProps } from '@/types';
import { Head } from '@inertiajs/react';
import { useState } from 'react';

/**
 * Orders from the tables, for a staff phone or a kitchen tablet. While it's
 * open the customers' menus can take orders, even if the POS is offline.
 */
export default function OrdersIndex({ auth }: PageProps<{ active: boolean }>) {
    const online = useOnlineStatus();
    const deviceBranch = useDeviceBranch(auth.merchant ?? { id: 0, branches: [] }, auth.user);
    const multi = !deviceBranch.locked && deviceBranch.branches.length > 1;
    // Every branch at once unless one is picked (staff tied to a branch: theirs).
    const [follow, setFollow] = useState<number | 'all'>('all');
    // Polls even when ordering is off, so turning it on shows up here by itself.
    const orders = useTableOrders(true, online, multi ? follow : deviceBranch.branchId);
    const waiting = orders.feed?.orders.filter((o) => o.status === 'new').length ?? 0;

    return (
        <AuthenticatedLayout header={<PageHeader title="Table Orders" subtitle="Orders and calls from the table QR codes" />}>
            <Head title={waiting > 0 ? `(${waiting}) Table Orders` : 'Table Orders'} />

            <div className="app-page">
                <div className="mx-auto w-full max-w-6xl space-y-4">
                    {multi && (
                        <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-700">
                            Branch
                            <select
                                value={follow}
                                onChange={(e) => setFollow(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                className="input w-auto py-1.5 pe-8"
                            >
                                <option value="all">All branches</option>
                                {deviceBranch.branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                            <span className="text-xs font-normal text-gray-500">This screen gets the orders of {follow === 'all' ? 'every branch' : 'that branch'}.</span>
                        </label>
                    )}
                    {auth.merchant && <OrdersBoard orders={orders} settings={auth.merchant} online={online} />}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
