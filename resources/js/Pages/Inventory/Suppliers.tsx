import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { ConfirmDialog, DialogLayout } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { FormEventHandler, useEffect, useState } from 'react';
import { Card, EmptyState, Field, FieldErrors, inputClass, InventoryNav, peso } from './Partials/shared';

type Supplier = {
    id: number;
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    items_count: number;
    spent_cents: number;
    last_delivery_at: string | null;
};

export default function Suppliers({ suppliers }: PageProps<{ suppliers: Supplier[] }>) {
    // undefined: closed, null: adding
    const [editing, setEditing] = useState<Supplier | null | undefined>();
    const [removing, setRemoving] = useState<Supplier | null>(null);

    const addButton = (
        <button type="button" onClick={() => setEditing(null)} className="btn btn-primary">
            <Icon name="plus" />
            Add supplier
        </button>
    );

    return (
        <AuthenticatedLayout header={<PageHeader title="Inventory" subtitle="Who you buy from and how much" />}>
            <Head title="Suppliers" />

            <div className="app-page">
                <InventoryNav />

                {suppliers.length === 0 ? (
                    <Card>
                        <EmptyState title="No suppliers yet" icon={<Icon name="store" className="h-5 w-5" />} action={addButton}>
                            Add the shops and distributors you buy supplies from.
                        </EmptyState>
                    </Card>
                ) : (
                    <>
                        <div className="flex justify-end">{addButton}</div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {suppliers.map((s) => (
                                <Card key={s.id} className="flex flex-col p-4 sm:p-5">
                                    <h3 className="text-base font-semibold text-gray-950">{s.name}</h3>
                                    <dl className="mt-1.5 flex-1 space-y-1 break-words text-sm text-gray-600">
                                        {s.contact_person && <div>{s.contact_person}</div>}
                                        {s.phone && (
                                            <div>
                                                <a href={`tel:${s.phone}`} className="hover:text-brand-700">
                                                    {s.phone}
                                                </a>
                                            </div>
                                        )}
                                        {s.email && (
                                            <div>
                                                <a href={`mailto:${s.email}`} className="hover:text-brand-700">
                                                    {s.email}
                                                </a>
                                            </div>
                                        )}
                                        {s.address && <div>{s.address}</div>}
                                    </dl>
                                    <div className="mt-4 grid grid-cols-3 divide-x divide-gray-200 rounded-lg border border-gray-200 bg-gray-50/60 py-2.5 text-center text-xs">
                                        <div className="px-1">
                                            <p className="text-gray-500">Items</p>
                                            <p className="mt-0.5 font-semibold tabular-nums text-gray-950">{s.items_count}</p>
                                        </div>
                                        <div className="px-1">
                                            <p className="text-gray-500">Bought</p>
                                            <p className="mt-0.5 font-semibold tabular-nums text-gray-950">{peso(s.spent_cents)}</p>
                                        </div>
                                        <div className="px-1">
                                            <p className="text-gray-500">Last delivery</p>
                                            <p className="mt-0.5 font-semibold text-gray-950">{s.last_delivery_at ?? '—'}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3">
                                        <button type="button" onClick={() => setEditing(s)} className="btn btn-secondary btn-sm flex-1">
                                            <Icon name="pencil" className="h-3.5 w-3.5" />
                                            Edit
                                        </button>
                                        <button type="button" onClick={() => setRemoving(s)} className="btn btn-danger btn-sm">
                                            <Icon name="trash" className="h-3.5 w-3.5" />
                                            Remove
                                        </button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <SupplierModal show={editing !== undefined} supplier={editing ?? null} onClose={() => setEditing(undefined)} />

            <ConfirmDialog
                show={removing !== null}
                title={`Remove ${removing?.name}?`}
                confirmLabel="Remove"
                onClose={() => setRemoving(null)}
                onConfirm={() =>
                    removing && router.delete(route('suppliers.destroy', removing.id), { preserveScroll: true, onSuccess: () => setRemoving(null) })
                }
            >
                Its items stay in inventory without a supplier. Past deliveries keep their record.
            </ConfirmDialog>
        </AuthenticatedLayout>
    );
}

function SupplierModal({ show, supplier, onClose }: { show: boolean; supplier: Supplier | null; onClose: () => void }) {
    const blank = { name: '', contact_person: '', phone: '', email: '', address: '', notes: '' };
    const form = useForm(blank);
    const errors = form.errors as FieldErrors;

    useEffect(() => {
        if (show) {
            form.clearErrors();
            form.setData(
                supplier
                    ? {
                          name: supplier.name,
                          contact_person: supplier.contact_person ?? '',
                          phone: supplier.phone ?? '',
                          email: supplier.email ?? '',
                          address: supplier.address ?? '',
                          notes: supplier.notes ?? '',
                      }
                    : blank,
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, supplier]);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (supplier) {
            form.put(route('suppliers.update', supplier.id), options);
        } else {
            form.post(route('suppliers.store'), options);
        }
    };

    const text = (key: keyof typeof blank, label: string, props: Record<string, unknown> = {}) => (
        <Field label={label} error={errors[key]}>
            <input className={inputClass} value={form.data[key]} onChange={(e) => form.setData(key, e.target.value)} {...props} />
        </Field>
    );

    return (
        <Modal show={show} onClose={onClose} maxWidth="lg">
            <form onSubmit={submit}>
                <DialogLayout
                    title={supplier ? `Edit ${supplier.name}` : 'Add supplier'}
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton disabled={form.processing}>{supplier ? 'Save' : 'Add supplier'}</PrimaryButton>
                        </>
                    }
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">{text('name', 'Name', { required: true, autoFocus: true })}</div>
                        {text('contact_person', 'Contact person')}
                        {text('phone', 'Phone')}
                        {text('email', 'Email', { type: 'email' })}
                        {text('address', 'Address')}
                        <Field label="Notes" error={errors.notes} className="sm:col-span-2">
                            <textarea
                                rows={2}
                                className={inputClass}
                                value={form.data.notes}
                                onChange={(e) => form.setData('notes', e.target.value)}
                                placeholder="e.g. Delivers Tue & Fri, 30-day terms"
                            />
                        </Field>
                    </div>
                </DialogLayout>
            </form>
        </Modal>
    );
}
