import PageHeader from '@/Components/PageHeader';
import { Alert, Card, CardHeader, Field } from '@/Components/ui';
import AdminLayout from '@/Layouts/AdminLayout';
import { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';
import { peso } from './Partials/shared';

type Props = {
    pricing: { price: number; free_product_limit: number; max_months: number; trial_days: number };
    lastChange: { by: string | null; at: string | null } | null;
};

export default function Pricing({ pricing, lastChange }: PageProps<Props>) {
    const form = useForm({
        price: String(pricing.price),
        free_product_limit: pricing.free_product_limit,
        max_months: pricing.max_months,
        trial_days: pricing.trial_days,
    });
    const errors = form.errors;
    const cents = Math.round(Number(form.data.price || 0) * 100);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        form.put(route('admin.pricing.update'), { preserveScroll: true });
    };

    return (
        <AdminLayout header={<PageHeader title="Pricing" subtitle="The Pro price and the free plan's limits" />}>
            <Head title="Pricing" />

            <form onSubmit={submit} className="app-page max-w-3xl">
                <Alert tone="blue">Changes apply to new payments from now on. Months stores already paid for keep their price and end dates.</Alert>

                <Card>
                    <CardHeader title="FinstackPOS Pro" subtitle="What stores pay for Management and unlimited products" />
                    <div className="card-body grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field
                            label="Price per month (₱)"
                            error={errors.price}
                            required
                            hint={`Stores see ${peso(cents)} per month; 12 months = ${peso(cents * 12)}.`}
                        >
                            <input
                                type="number"
                                min="1"
                                step="0.01"
                                required
                                className="input text-lg font-semibold tabular-nums"
                                value={form.data.price}
                                onChange={(e) => form.setData('price', e.target.value)}
                            />
                        </Field>
                        <Field label="Most months in one payment" error={errors.max_months} required>
                            <input
                                type="number"
                                min={1}
                                max={120}
                                required
                                className="input"
                                value={form.data.max_months}
                                onChange={(e) => form.setData('max_months', Number(e.target.value))}
                            />
                        </Field>
                    </div>
                </Card>
                <Card>
                    <CardHeader title="Free trial" subtitle="Every new store gets Pro free for this many days, once" />
                    <div className="card-body">
                        <Field
                            label="Trial length (days)"
                            error={errors.trial_days}
                            required
                            hint="0 turns trials off. Stores already on a trial keep their end date."
                            className="max-w-xs"
                        >
                            <input
                                type="number"
                                min={0}
                                max={90}
                                required
                                className="input"
                                value={form.data.trial_days}
                                onChange={(e) => form.setData('trial_days', Number(e.target.value))}
                            />
                        </Field>
                    </div>
                </Card>

                <Card>
                    <CardHeader title="Free plan" />
                    <div className="card-body">
                        <Field
                            label="Products a free store can have"
                            error={errors.free_product_limit}
                            required
                            hint="Stores already above it keep their products but can't add more."
                            className="max-w-xs"
                        >
                            <input
                                type="number"
                                min={1}
                                required
                                className="input"
                                value={form.data.free_product_limit}
                                onChange={(e) => form.setData('free_product_limit', Number(e.target.value))}
                            />
                        </Field>
                    </div>
                </Card>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">
                        {lastChange?.at
                            ? `Last changed ${new Date(lastChange.at).toLocaleString()}${lastChange.by ? ` by ${lastChange.by}` : ''}`
                            : 'Using the default values.'}
                    </p>
                    <button type="submit" disabled={form.processing || !form.isDirty} className="btn btn-primary">
                        Save pricing
                    </button>
                </div>
            </form>
        </AdminLayout>
    );
}
