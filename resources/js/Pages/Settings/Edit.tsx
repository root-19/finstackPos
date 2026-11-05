import Checkbox from '@/Components/Checkbox';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import { Receipt, ReceiptData } from '@/Components/Receipt';
import TextInput from '@/Components/TextInput';
import { Alert, Badge, Card, CardHeader, Field, Segmented } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { computeTotals } from '@/lib/money';
import { MerchantSettings, PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { FormEventHandler, ReactNode, useEffect, useMemo, useState } from 'react';

interface SettingsProps extends MerchantSettings {
    paymongo_enabled: boolean;
    /** e.g. "sk_live_••••a1b2"; the key itself never reaches the browser. */
    paymongo_key_hint: string | null;
}

interface SettingsForm {
    name: string;
    address: string;
    tin: string;
    contact_number: string;
    receipt_footer: string;
    receipt_paper_mm: 58 | 80;
    auto_print_receipt: boolean;
    tax_rate: string;
    prices_include_tax: boolean;
    senior_discount_enabled: boolean;
    pwd_discount_enabled: boolean;
    discount_rate: string;
    discount_vat_exempt: boolean;
    service_charge: string;
    manual_qr_enabled: boolean;
    manual_qr_label: string;
    manual_qr_image: File | null;
    remove_manual_qr_image: boolean;
    paymongo_enabled: boolean;
    paymongo_secret_key: string;
    remove_paymongo_key: boolean;
}

const percent = (bps: number) => String(bps / 100);
const toBps = (value: string) => Math.round((Number(value) || 0) * 100);

export default function SettingsEdit({ settings }: PageProps<{ settings: SettingsProps }>) {
    const form = useForm<SettingsForm>({
        name: settings.name,
        address: settings.address ?? '',
        tin: settings.tin ?? '',
        contact_number: settings.contact_number ?? '',
        receipt_footer: settings.receipt_footer ?? '',
        receipt_paper_mm: settings.receipt_paper_mm,
        auto_print_receipt: settings.auto_print_receipt,
        tax_rate: percent(settings.tax_rate_bps),
        prices_include_tax: settings.prices_include_tax,
        senior_discount_enabled: settings.senior_discount_enabled,
        pwd_discount_enabled: settings.pwd_discount_enabled,
        discount_rate: percent(settings.discount_rate_bps),
        discount_vat_exempt: settings.discount_vat_exempt,
        service_charge: percent(settings.service_charge_bps),
        manual_qr_enabled: settings.manual_qr_enabled,
        manual_qr_label: settings.manual_qr_label ?? '',
        manual_qr_image: null,
        remove_manual_qr_image: false,
        paymongo_enabled: settings.paymongo_enabled,
        paymongo_secret_key: '',
        remove_paymongo_key: false,
    });
    const { data, setData, errors, processing } = form;
    const [previewDiscount, setPreviewDiscount] = useState(false);

    const qrPreview = useMemo(() => (data.manual_qr_image ? URL.createObjectURL(data.manual_qr_image) : null), [data.manual_qr_image]);
    useEffect(
        () => () => {
            if (qrPreview) {
                URL.revokeObjectURL(qrPreview);
            }
        },
        [qrPreview],
    );
    type QrMode = 'off' | 'manual' | 'paymongo';
    const qrMode: QrMode = data.paymongo_enabled ? 'paymongo' : data.manual_qr_enabled ? 'manual' : 'off';
    const setQrMode = (mode: QrMode) => setData((d) => ({ ...d, manual_qr_enabled: mode === 'manual', paymongo_enabled: mode === 'paymongo' }));
    const shownQr = qrPreview ?? (data.remove_manual_qr_image ? null : settings.manual_qr_image_url);

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        form.transform((d) => ({ ...d, _method: 'put' }));
        // Multipart for the QR image; PHP only parses that for POST, so spoof PUT.
        form.post(route('settings.update'), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => form.setData((d) => ({ ...d, manual_qr_image: null, paymongo_secret_key: '' })),
        });
    };

    // Live receipt preview from the unsaved values.
    const previewSettings = {
        ...settings,
        name: data.name || 'Your store',
        address: data.address || null,
        tin: data.tin || null,
        contact_number: data.contact_number || null,
        receipt_footer: data.receipt_footer || null,
        receipt_paper_mm: data.receipt_paper_mm,
        tax_rate_bps: toBps(data.tax_rate),
        prices_include_tax: data.prices_include_tax,
        discount_rate_bps: toBps(data.discount_rate),
        discount_vat_exempt: data.discount_vat_exempt,
        service_charge_bps: toBps(data.service_charge),
        manual_qr_label: data.manual_qr_label || null,
    };
    const sample = sampleReceipt(previewSettings, previewDiscount);

    return (
        <AuthenticatedLayout header={<PageHeader title="Settings" subtitle="Receipt, taxes, discounts, and payments" />}>
            <Head title="Settings" />

            <form onSubmit={submit} className="app-page">
                <div className="grid max-w-6xl grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <div className="space-y-5">
                        <Section title="Business & receipt" description="Printed at the top and bottom of every receipt.">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field label="Business name" htmlFor="name" error={errors.name} required className="sm:col-span-2">
                                    <TextInput id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} required />
                                </Field>
                                <Field label="Address" htmlFor="address" error={errors.address} className="sm:col-span-2">
                                    <TextInput
                                        id="address"
                                        value={data.address}
                                        onChange={(e) => setData('address', e.target.value)}
                                        placeholder="Street, city"
                                    />
                                </Field>
                                <Field label="TIN" htmlFor="tin" error={errors.tin}>
                                    <TextInput
                                        id="tin"
                                        value={data.tin}
                                        onChange={(e) => setData('tin', e.target.value)}
                                        placeholder="000-000-000-000"
                                    />
                                </Field>
                                <Field label="Contact number" htmlFor="contact_number" error={errors.contact_number}>
                                    <TextInput
                                        id="contact_number"
                                        value={data.contact_number}
                                        onChange={(e) => setData('contact_number', e.target.value)}
                                    />
                                </Field>
                                <Field label="Footer message" htmlFor="receipt_footer" error={errors.receipt_footer} className="sm:col-span-2">
                                    <textarea
                                        id="receipt_footer"
                                        value={data.receipt_footer}
                                        onChange={(e) => setData('receipt_footer', e.target.value)}
                                        rows={2}
                                        maxLength={500}
                                        placeholder="Thank you, come again!"
                                        className="input"
                                    />
                                </Field>
                                <Field label="Receipt paper">
                                    <Segmented
                                        label="Receipt paper width"
                                        value={String(data.receipt_paper_mm) as '58' | '80'}
                                        options={[
                                            { value: '58', label: '58 mm' },
                                            { value: '80', label: '80 mm' },
                                        ]}
                                        onChange={(v) => setData('receipt_paper_mm', v === '58' ? 58 : 80)}
                                    />
                                </Field>
                                <Toggle
                                    label="Print automatically after each sale"
                                    checked={data.auto_print_receipt}
                                    onChange={(v) => setData('auto_print_receipt', v)}
                                />
                            </div>
                        </Section>

                        <Section title="VAT" description="Used for every price on the POS.">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field label="VAT rate (%)" htmlFor="tax_rate" error={errors.tax_rate}>
                                    <TextInput
                                        id="tax_rate"
                                        value={data.tax_rate}
                                        onChange={(e) => setData('tax_rate', e.target.value)}
                                        inputMode="decimal"
                                    />
                                </Field>
                                <Toggle
                                    label="Product prices already include VAT"
                                    checked={data.prices_include_tax}
                                    onChange={(v) => setData('prices_include_tax', v)}
                                />
                            </div>
                        </Section>

                        <Section
                            title="Senior citizen & PWD discount"
                            description="The cashier records the ID number and name for each discounted sale."
                        >
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Toggle
                                    label="Offer senior citizen discount"
                                    checked={data.senior_discount_enabled}
                                    onChange={(v) => setData('senior_discount_enabled', v)}
                                />
                                <Toggle
                                    label="Offer PWD discount"
                                    checked={data.pwd_discount_enabled}
                                    onChange={(v) => setData('pwd_discount_enabled', v)}
                                />
                                <Field label="Discount (%)" htmlFor="discount_rate" error={errors.discount_rate}>
                                    <TextInput
                                        id="discount_rate"
                                        value={data.discount_rate}
                                        onChange={(e) => setData('discount_rate', e.target.value)}
                                        inputMode="decimal"
                                    />
                                </Field>
                                <Toggle
                                    label="VAT-exempt (remove VAT before the discount)"
                                    checked={data.discount_vat_exempt}
                                    onChange={(v) => setData('discount_vat_exempt', v)}
                                />
                            </div>
                        </Section>

                        <Section title="Service charge" description="Added to every sale. Set 0 to turn it off.">
                            <Field label="Service charge (%)" htmlFor="service_charge" error={errors.service_charge} className="max-w-xs">
                                <TextInput
                                    id="service_charge"
                                    value={data.service_charge}
                                    onChange={(e) => setData('service_charge', e.target.value)}
                                    inputMode="decimal"
                                />
                            </Field>
                        </Section>

                        <Section
                            title="QR payment at checkout"
                            description="Choose which QR the cashier shows when the customer pays by QR. Only one is used at a time."
                        >
                            <Segmented
                                label="QR payment method"
                                value={qrMode}
                                onChange={setQrMode}
                                options={[
                                    { value: 'off', label: 'No QR' },
                                    { value: 'manual', label: 'My own QR' },
                                    { value: 'paymongo', label: 'PayMongo QR Ph' },
                                ]}
                            />
                            {(errors as Record<string, string | undefined>).qr_mode && (
                                <p className="field-error">{(errors as Record<string, string | undefined>).qr_mode}</p>
                            )}

                            {qrMode === 'off' && <p className="mt-3 text-sm text-gray-500">Checkout offers cash only. Pick a QR so customers can scan to pay; it also shows on the customer display.</p>}

                            {qrMode === 'manual' && (
                                <>
                                    <p className="mt-3 text-sm text-gray-600">
                                        Shows your GCash, Maya, or bank QR picture. The cashier confirms the payment arrived. Works offline.
                                    </p>
                                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                                        <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                                            {shownQr ? (
                                                <img src={shownQr} alt="Payment QR" className="h-full w-full object-contain" />
                                            ) : (
                                                <span className="px-4 text-center text-xs text-gray-500">No QR uploaded</span>
                                            )}
                                        </div>
                                        <div className="space-y-3">
                                            <Field label="Label shown at checkout" htmlFor="manual_qr_label" error={errors.manual_qr_label}>
                                                <TextInput
                                                    id="manual_qr_label"
                                                    value={data.manual_qr_label}
                                                    onChange={(e) => setData('manual_qr_label', e.target.value)}
                                                    placeholder="e.g. GCash"
                                                />
                                            </Field>
                                            <div>
                                                <div className="flex flex-wrap gap-2">
                                                    <label className="btn btn-secondary btn-sm cursor-pointer focus-within:ring-2 focus-within:ring-brand-500/40 focus-within:ring-offset-1">
                                                        {shownQr ? 'Change QR picture' : 'Upload QR picture'}
                                                        <input
                                                            type="file"
                                                            accept="image/jpeg,image/png,image/webp"
                                                            className="sr-only"
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) {
                                                                    setData((d) => ({ ...d, manual_qr_image: file, remove_manual_qr_image: false }));
                                                                }
                                                                e.target.value = '';
                                                            }}
                                                        />
                                                    </label>
                                                    {shownQr && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setData((d) => ({ ...d, manual_qr_image: null, remove_manual_qr_image: true }))
                                                            }
                                                            className="btn btn-danger btn-sm"
                                                        >
                                                            <Icon name="trash" className="h-3.5 w-3.5" />
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                                {errors.manual_qr_image ? (
                                                    <p className="field-error">{errors.manual_qr_image}</p>
                                                ) : (
                                                    <p className="help">JPG, PNG, or WebP.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {qrMode === 'paymongo' && (
                                <>
                                    <p className="mt-3 text-sm text-gray-600">
                                        Creates a QR Ph code for the exact amount and confirms the payment automatically. Needs internet at checkout;
                                        when offline, your own QR picture is shown instead if you uploaded one.
                                    </p>
                                    <div className="mt-4 space-y-3">
                                        <Field label="PayMongo secret key" htmlFor="paymongo_secret_key" error={errors.paymongo_secret_key}>
                                            <TextInput
                                                id="paymongo_secret_key"
                                                type="password"
                                                autoComplete="off"
                                                value={data.paymongo_secret_key}
                                                onChange={(e) => setData('paymongo_secret_key', e.target.value)}
                                                placeholder={settings.paymongo_key_hint ? 'Leave blank to keep the saved key' : 'sk_live_...'}
                                                className="font-mono"
                                            />
                                        </Field>
                                        {settings.paymongo_key_hint && !data.remove_paymongo_key && (
                                            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                                                <Badge tone="gray" className="font-mono">
                                                    {settings.paymongo_key_hint}
                                                </Badge>
                                                <span>Saved</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setData('remove_paymongo_key', true)}
                                                    className="btn btn-ghost btn-sm text-red-600 hover:text-red-700"
                                                >
                                                    Remove key
                                                </button>
                                            </div>
                                        )}
                                        {data.remove_paymongo_key && <Alert tone="red">The saved key will be removed when you save.</Alert>}
                                        <p className="text-xs text-gray-500">
                                            Find it in your PayMongo dashboard under Developers → API keys. It is stored encrypted and never shown
                                            again. Use an sk_test_ key to try it first.
                                        </p>
                                    </div>
                                </>
                            )}
                        </Section>
                    </div>

                    {/* Live receipt preview */}
                    <aside className="xl:sticky xl:top-[4.5rem]">
                        <Card>
                            <CardHeader
                                title="Receipt preview"
                                subtitle="Updates as you edit."
                                actions={
                                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700">
                                        <Checkbox checked={previewDiscount} onChange={(e) => setPreviewDiscount(e.target.checked)} />
                                        With senior discount
                                    </label>
                                }
                            />
                            <div className="p-3">
                                <div className="flex max-h-[70vh] justify-center overflow-auto rounded-lg bg-gray-100 p-3">
                                    <div className="h-fit ring-1 ring-gray-200">
                                        <Receipt data={sample} settings={previewSettings} />
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </aside>
                </div>

                {/* One save for the whole form, always in reach. */}
                <div className="sticky bottom-0 z-20 -mx-4 -mb-5 border-t border-gray-200 bg-white px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:-mb-6 lg:px-8">
                    <div className="flex max-w-6xl items-center justify-end gap-3">
                        {form.isDirty && <span className="text-sm text-gray-500">Unsaved changes</span>}
                        <button type="submit" disabled={processing} className="btn btn-primary">
                            <Icon name="check" />
                            Save settings
                        </button>
                    </div>
                </div>
            </form>
        </AuthenticatedLayout>
    );
}

function sampleReceipt(settings: MerchantSettings, withDiscount: boolean): ReceiptData {
    const items = [
        {
            name: 'Iced Coffee',
            options: [{ group: 'Size', value: 'Large', price_cents: 8500 }],
            quantity: 2,
            unit_price_cents: 8500,
            line_total_cents: 17000,
        },
        { name: 'Cheese Bread', options: null, quantity: 1, unit_price_cents: 4500, line_total_cents: 4500 },
    ];
    const subtotal = items.reduce((sum, i) => sum + i.line_total_cents, 0);
    const totals = computeTotals(subtotal, settings, withDiscount ? 'senior' : null);
    const paid = Math.ceil(totals.total / 10000) * 10000;

    return {
        reference: 'A1B2C3D4',
        sold_at: new Date().toISOString(),
        cashier: 'Juan',
        items,
        subtotal_cents: subtotal,
        discount_type: withDiscount ? 'senior' : null,
        discount_id_number: withDiscount ? '12345' : null,
        discount_customer_name: withDiscount ? 'Maria Santos' : null,
        vat_exempt_cents: totals.vatExempt,
        discount_cents: totals.discount,
        service_charge_cents: totals.serviceCharge,
        tax_cents: totals.tax,
        total_cents: totals.total,
        payment_method: 'cash',
        payment_reference: null,
        amount_paid_cents: paid,
        change_cents: paid - totals.total,
    };
}

function Section({ title, description, badge, children }: { title: string; description: string; badge?: string; children: ReactNode }) {
    return (
        <Card>
            <CardHeader title={title} subtitle={description} actions={badge ? <Badge tone="brand">{badge}</Badge> : undefined} />
            <div className="card-body">{children}</div>
        </Card>
    );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center gap-3 self-end rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50">
            <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
            {label}
        </label>
    );
}
