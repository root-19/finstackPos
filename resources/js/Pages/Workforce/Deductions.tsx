import DangerButton from '@/Components/DangerButton';
import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import PageHeader from '@/Components/PageHeader';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { Alert, Badge, DialogLayout, Field } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { toDateInput } from '@/lib/format';
import { PageProps } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { FormEventHandler, ReactNode, useEffect, useState } from 'react';
import { AuditEntry, AuditTrail, Card, EmptyState, FieldErrors, formatDay, peso, toAmount, toPercent } from './Partials/shared';

type Code = 'sss' | 'philhealth' | 'pagibig' | 'withholding_tax' | 'custom';
type Method = 'fixed' | 'percentage' | 'bracket' | 'tax_table';

interface Bracket {
    min_cents: number;
    max_cents: number | null;
    employee_cents: number | null;
    employer_cents: number | null;
    base_cents: number | null;
    rate_bps: number | null;
}

interface Rule {
    id: number;
    code: Code;
    name: string;
    enabled: boolean;
    method: Method;
    basis: string;
    employee_rate_bps: number | null;
    employer_rate_bps: number | null;
    fixed_cents: number | null;
    floor_cents: number | null;
    ceiling_cents: number | null;
    brackets: Bracket[] | null;
    applies_to: 'all' | 'selected';
    employee_ids: number[] | null;
    total_limit_cents: number | null;
    authorization_ref: string | null;
    effective_from: string;
    verified: boolean;
    source_note: string | null;
    history: AuditEntry[];
}

const CODE_LABELS: Record<Code, string> = {
    sss: 'SSS',
    philhealth: 'PhilHealth',
    pagibig: 'Pag-IBIG (HDMF)',
    withholding_tax: 'Withholding tax (BIR)',
    custom: 'Custom deduction',
};

const METHOD_LABELS: Record<Method, string> = {
    percentage: 'Percentage of a basis',
    fixed: 'Fixed amount',
    bracket: 'Contribution table (amounts per bracket)',
    tax_table: 'Tax table (base tax + % over bracket floor)',
};

const METHOD_HINTS: Record<Method, string> = {
    percentage: 'A rate times the chosen basis, optionally kept between a minimum and maximum base.',
    fixed: 'The same amount every pay period.',
    bracket: 'Monthly employee and employer amounts for each salary range.',
    tax_table: 'Base tax plus a rate on the amount over the bracket floor.',
};

const BASIS_LABELS: Record<string, string> = {
    monthly_basic: 'Monthly basic salary',
    monthly_gross: 'Monthly earned pay',
    taxable: 'Monthly taxable pay (after contributions)',
    period_gross: 'This pay period’s earned pay',
};

type Props = {
    rules: Rule[];
    employees: { id: number; name: string }[];
};

export default function Deductions({ rules, employees }: PageProps<Props>) {
    // undefined: closed; { rule?: edit; copyOf?: new version; code?: new }
    const [editing, setEditing] = useState<{ rule?: Rule; copyOf?: Rule; code?: Code } | undefined>();
    const [deleting, setDeleting] = useState<Rule | null>(null);
    const [historyOf, setHistoryOf] = useState<Rule | null>(null);

    const statutory = rules.filter((r) => r.code !== 'custom');
    const custom = rules.filter((r) => r.code === 'custom');
    const unverifiedOn = rules.filter((r) => r.enabled && !r.verified);
    const today = toDateInput(new Date());
    // For each code, the version in force today (latest enabled with effective_from ≤ today).
    const inForce = new Set(
        (['sss', 'philhealth', 'pagibig', 'withholding_tax'] as Code[])
            .map(
                (code) =>
                    rules
                        .filter((r) => r.code === code && r.enabled && r.effective_from <= today)
                        .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.id,
            )
            .filter(Boolean),
    );

    return (
        <AuthenticatedLayout
            header={<PageHeader title="Deduction Settings" subtitle="Contribution, tax, and authorized deduction rules used by payroll" />}
        >
            <Head title="Deduction Settings" />

            <div className="app-page">
                <Alert tone="amber" title="You are responsible for these rates.">
                    <p>
                        FinstackPOS ships starting templates for SSS, PhilHealth, Pag-IBIG, and BIR withholding tax. They are{' '}
                        <strong>off and unverified</strong> until you check them against the latest official circulars and turn them on. Rates change:
                        add a new version with a later effective date instead of editing an old one, so past payrolls stay explainable. Finalized
                        payrolls keep a snapshot and never change.
                    </p>
                    {unverifiedOn.length > 0 && (
                        <p className="mt-2 flex items-start gap-1.5 font-semibold text-red-700">
                            <Icon name="warning" className="mt-0.5 h-4 w-4" />
                            <span>In use but not verified: {unverifiedOn.map((r) => r.name).join(', ')}.</span>
                        </p>
                    )}
                </Alert>

                <section className="space-y-3">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-sm font-semibold text-gray-950">Government contributions & tax</h2>
                            <p className="text-sm text-gray-500">SSS, PhilHealth, Pag-IBIG, and BIR withholding tax.</p>
                        </div>
                        <button type="button" onClick={() => setEditing({ code: 'sss' })} className="btn btn-secondary">
                            <Icon name="plus" />
                            Add rule
                        </button>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {statutory.map((r) => (
                            <RuleCard
                                key={r.id}
                                rule={r}
                                inForce={inForce.has(r.id)}
                                employees={employees}
                                onEdit={() => setEditing({ rule: r })}
                                onNewVersion={() => setEditing({ copyOf: r })}
                                onHistory={() => setHistoryOf(r)}
                                onDelete={() => setDeleting(r)}
                            />
                        ))}
                    </div>
                </section>

                <section className="space-y-3">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-sm font-semibold text-gray-950">Custom deductions</h2>
                            <p className="text-sm text-gray-500">Loans, cash advances, and other deductions the employee authorized in writing.</p>
                        </div>
                        <button type="button" onClick={() => setEditing({ code: 'custom' })} className="btn btn-primary">
                            <Icon name="plus" />
                            Custom deduction
                        </button>
                    </div>
                    {custom.length === 0 ? (
                        <Card>
                            <EmptyState title="No custom deductions" icon={<Icon name="deductions" className="h-5 w-5" />}>
                                Add one when an employee signs a loan, cash advance, or other deduction authorization.
                            </EmptyState>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            {custom.map((r) => (
                                <RuleCard
                                    key={r.id}
                                    rule={r}
                                    inForce={r.enabled && r.effective_from <= today}
                                    employees={employees}
                                    onEdit={() => setEditing({ rule: r })}
                                    onHistory={() => setHistoryOf(r)}
                                    onDelete={() => setDeleting(r)}
                                />
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <RuleModal state={editing} employees={employees} onClose={() => setEditing(undefined)} />
            <DeleteModal rule={deleting} onClose={() => setDeleting(null)} />

            <Modal show={historyOf !== null} onClose={() => setHistoryOf(null)} maxWidth="lg">
                <DialogLayout
                    title={`History · ${historyOf?.name ?? ''}`}
                    footer={<SecondaryButton onClick={() => setHistoryOf(null)}>Close</SecondaryButton>}
                >
                    {historyOf && <AuditTrail entries={historyOf.history} />}
                </DialogLayout>
            </Modal>
        </AuthenticatedLayout>
    );
}

function describe(rule: Rule): string {
    const range = [
        rule.floor_cents !== null && `min base ${peso(rule.floor_cents)}`,
        rule.ceiling_cents !== null && `max base ${peso(rule.ceiling_cents)}`,
    ]
        .filter(Boolean)
        .join(', ');

    switch (rule.method) {
        case 'percentage':
            return `Employee ${toPercent(rule.employee_rate_bps) || 0}%${rule.employer_rate_bps ? ` · Employer ${toPercent(rule.employer_rate_bps)}%` : ''} of ${BASIS_LABELS[rule.basis]?.toLowerCase()}${range ? ` (${range})` : ''}`;
        case 'fixed':
            return `${peso(rule.fixed_cents ?? 0)} per pay period`;
        case 'bracket':
            return `${rule.brackets?.length ?? 0}-bracket contribution table on ${BASIS_LABELS[rule.basis]?.toLowerCase()}`;
        case 'tax_table':
            return `${rule.brackets?.length ?? 0}-bracket tax table on ${BASIS_LABELS[rule.basis]?.toLowerCase()}`;
    }
}

function RuleCard({
    rule,
    inForce,
    employees,
    onEdit,
    onNewVersion,
    onHistory,
    onDelete,
}: {
    rule: Rule;
    inForce: boolean;
    employees: { id: number; name: string }[];
    onEdit: () => void;
    onNewVersion?: () => void;
    onHistory: () => void;
    onDelete: () => void;
}) {
    const toggle = () =>
        router.put(
            route('deductions.update', rule.id),
            { ...formFromRule(rule), enabled: !rule.enabled, change_reason: rule.enabled ? 'Turned off' : 'Turned on' },
            { preserveScroll: true },
        );

    return (
        <Card className="flex flex-col">
            <div className="card-body flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{CODE_LABELS[rule.code]}</p>
                        <h3 className="truncate text-sm font-semibold text-gray-950">{rule.name}</h3>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs font-medium text-gray-600" aria-hidden>
                            {rule.enabled ? 'On' : 'Off'}
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={rule.enabled}
                            aria-label={`${rule.enabled ? 'Turn off' : 'Turn on'} ${rule.name}`}
                            onClick={toggle}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 ${
                                rule.enabled ? 'bg-brand-600' : 'bg-gray-300'
                            }`}
                        >
                            <span
                                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${rule.enabled ? 'left-[1.375rem]' : 'left-0.5'}`}
                            />
                        </button>
                    </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                    {rule.verified ? (
                        <Badge tone="green">
                            <Icon name="check" className="h-3 w-3" />
                            Verified
                        </Badge>
                    ) : (
                        <Badge tone="amber">
                            <Icon name="warning" className="h-3 w-3" />
                            Not verified
                        </Badge>
                    )}
                    <Badge tone="gray">From {formatDay(rule.effective_from)}</Badge>
                    {inForce && <Badge tone="dark">In force today</Badge>}
                </div>

                <p className="mt-3 text-sm text-gray-700">{describe(rule)}</p>
                {rule.applies_to === 'selected' && (
                    <p className="mt-1 text-xs text-gray-500">
                        Only: {(rule.employee_ids ?? []).map((id) => employees.find((e) => e.id === id)?.name ?? `#${id}`).join(', ')}
                    </p>
                )}
                {rule.code === 'custom' && (
                    <p className="mt-1 text-xs text-gray-500">
                        Authorization: {rule.authorization_ref}
                        {rule.total_limit_cents !== null && ` · Stops after ${peso(rule.total_limit_cents)}`}
                    </p>
                )}
                {rule.source_note && <p className="mt-1 text-xs text-gray-500">Source: {rule.source_note}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 px-4 py-2.5 sm:px-5">
                <button type="button" onClick={onEdit} className="btn btn-secondary btn-sm">
                    <Icon name="pencil" className="h-3.5 w-3.5" />
                    Edit
                </button>
                {onNewVersion && (
                    <button type="button" onClick={onNewVersion} className="btn btn-secondary btn-sm">
                        <Icon name="plus" className="h-3.5 w-3.5" />
                        New version from a date
                    </button>
                )}
                <button type="button" onClick={onHistory} className="btn btn-ghost btn-sm">
                    History ({rule.history.length})
                </button>
                <button type="button" onClick={onDelete} className="btn btn-ghost btn-sm ms-auto text-red-700 hover:bg-red-50 hover:text-red-800">
                    <Icon name="trash" className="h-3.5 w-3.5" />
                    Delete
                </button>
            </div>
        </Card>
    );
}

type BracketInput = {
    min: string;
    max: string;
    employee: string;
    employer: string;
    base: string;
    rate: string;
};

type RuleForm = {
    code: Code;
    name: string;
    enabled: boolean;
    method: Method;
    basis: string;
    employee_rate: string;
    employer_rate: string;
    fixed_amount: string;
    floor: string;
    ceiling: string;
    brackets: BracketInput[];
    applies_to: 'all' | 'selected';
    employee_ids: number[];
    total_limit: string;
    authorization_ref: string;
    effective_from: string;
    verified: boolean;
    source_note: string;
    change_reason: string;
};

function formFromRule(rule: Rule): RuleForm {
    return {
        code: rule.code,
        name: rule.name,
        enabled: rule.enabled,
        method: rule.method,
        basis: rule.basis,
        employee_rate: toPercent(rule.employee_rate_bps),
        employer_rate: toPercent(rule.employer_rate_bps),
        fixed_amount: toAmount(rule.fixed_cents),
        floor: toAmount(rule.floor_cents),
        ceiling: toAmount(rule.ceiling_cents),
        brackets: (rule.brackets ?? []).map((b) => ({
            min: toAmount(b.min_cents),
            max: toAmount(b.max_cents),
            employee: toAmount(b.employee_cents),
            employer: toAmount(b.employer_cents),
            base: toAmount(b.base_cents),
            rate: toPercent(b.rate_bps),
        })),
        applies_to: rule.applies_to,
        employee_ids: rule.employee_ids ?? [],
        total_limit: toAmount(rule.total_limit_cents),
        authorization_ref: rule.authorization_ref ?? '',
        effective_from: rule.effective_from,
        verified: rule.verified,
        source_note: rule.source_note ?? '',
        change_reason: '',
    };
}

function blankForm(code: Code): RuleForm {
    return {
        code,
        name: code === 'custom' ? '' : CODE_LABELS[code],
        enabled: true,
        method: code === 'custom' ? 'fixed' : code === 'withholding_tax' ? 'tax_table' : 'percentage',
        basis: code === 'custom' ? 'period_gross' : code === 'withholding_tax' ? 'taxable' : 'monthly_gross',
        employee_rate: '',
        employer_rate: '',
        fixed_amount: '',
        floor: '',
        ceiling: '',
        brackets: [],
        applies_to: code === 'custom' ? 'selected' : 'all',
        employee_ids: [],
        total_limit: '',
        authorization_ref: '',
        effective_from: toDateInput(new Date()),
        verified: false,
        source_note: '',
        change_reason: '',
    };
}

const emptyBracket: BracketInput = { min: '', max: '', employee: '', employer: '', base: '', rate: '' };

const BRACKET_LABELS: Record<keyof BracketInput, string> = {
    min: 'From',
    max: 'Up to',
    employee: 'Employee amount',
    employer: 'Employer amount',
    base: 'Base tax',
    rate: 'Rate',
};

/** A titled group of fields inside the rule editor. */
function FormSection({
    title,
    description,
    children,
    first = false,
}: {
    title: string;
    description?: ReactNode;
    children: ReactNode;
    first?: boolean;
}) {
    return (
        <section className={first ? '' : 'border-t border-gray-100 pt-5'}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
            {description && <p className="help">{description}</p>}
            <div className="mt-3">{children}</div>
        </section>
    );
}

function RuleModal({
    state,
    employees,
    onClose,
}: {
    state: { rule?: Rule; copyOf?: Rule; code?: Code } | undefined;
    employees: { id: number; name: string }[];
    onClose: () => void;
}) {
    const form = useForm<RuleForm>(blankForm('sss'));
    const errors = form.errors as FieldErrors;
    const { data, setData } = form;
    const rule = state?.rule;

    useEffect(() => {
        if (!state) {
            return;
        }
        form.clearErrors();
        if (state.rule) {
            setData(formFromRule(state.rule));
        } else if (state.copyOf) {
            setData({ ...formFromRule(state.copyOf), effective_from: toDateInput(new Date()), verified: false, change_reason: '' });
        } else {
            setData(blankForm(state.code ?? 'sss'));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    const isCustom = data.code === 'custom';
    const tableMethod = data.method === 'bracket' || data.method === 'tax_table';

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (rule) {
            form.put(route('deductions.update', rule.id), options);
        } else {
            form.post(route('deductions.store'), options);
        }
    };

    const setBracket = (index: number, key: keyof BracketInput, value: string) =>
        setData(
            'brackets',
            data.brackets.map((b, i) => (i === index ? { ...b, [key]: value } : b)),
        );

    const bracketError = Object.entries(errors).find(([k]) => k.startsWith('brackets'))?.[1];

    return (
        <Modal show={state !== undefined} onClose={onClose}>
            <form onSubmit={submit}>
                <DialogLayout
                    title={
                        rule
                            ? `Edit ${rule.name}`
                            : state?.copyOf
                              ? `New version of ${state.copyOf.name}`
                              : isCustom
                                ? 'Custom deduction'
                                : 'Add rule'
                    }
                    description={state?.copyOf ? 'The current version stays for payrolls before the new effective date.' : undefined}
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton disabled={form.processing}>Save</PrimaryButton>
                        </>
                    }
                >
                    <div className="space-y-5">
                        <FormSection title="Rule" first>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                {!isCustom && (
                                    <Field
                                        label="Contribution"
                                        error={errors.code}
                                        htmlFor="rule-code"
                                        hint={rule ? 'Cannot be changed on an existing rule.' : undefined}
                                    >
                                        <select
                                            id="rule-code"
                                            className="input"
                                            value={data.code}
                                            onChange={(e) => setData('code', e.target.value as Code)}
                                            disabled={Boolean(rule)}
                                        >
                                            {(['sss', 'philhealth', 'pagibig', 'withholding_tax'] as Code[]).map((c) => (
                                                <option key={c} value={c}>
                                                    {CODE_LABELS[c]}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                )}
                                <Field
                                    label="Name on payslip"
                                    error={errors.name}
                                    required
                                    htmlFor="rule-name"
                                    hint="Employees see this name on their payslip."
                                    className={isCustom ? 'sm:col-span-2' : ''}
                                >
                                    <input
                                        id="rule-name"
                                        required
                                        className="input"
                                        value={data.name}
                                        onChange={(e) => setData('name', e.target.value)}
                                        placeholder={isCustom ? 'e.g. Cash advance' : ''}
                                    />
                                </Field>
                                <Field label="Calculation" error={errors.method} htmlFor="rule-method" hint={METHOD_HINTS[data.method]}>
                                    <select
                                        id="rule-method"
                                        className="input"
                                        value={data.method}
                                        onChange={(e) => setData('method', e.target.value as Method)}
                                    >
                                        {(isCustom ? (['fixed', 'percentage'] as Method[]) : (Object.keys(METHOD_LABELS) as Method[])).map((m) => (
                                            <option key={m} value={m}>
                                                {METHOD_LABELS[m]}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                {data.method !== 'fixed' && (
                                    <Field label="Computed on" error={errors.basis} htmlFor="rule-basis">
                                        <select
                                            id="rule-basis"
                                            className="input"
                                            value={data.basis}
                                            onChange={(e) => setData('basis', e.target.value)}
                                        >
                                            {Object.entries(BASIS_LABELS).map(([v, l]) => (
                                                <option key={v} value={v}>
                                                    {l}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                )}
                            </div>
                        </FormSection>

                        <FormSection
                            title={data.method === 'fixed' ? 'Amount' : tableMethod ? 'Brackets' : 'Rates'}
                            description={
                                data.method === 'percentage' && !isCustom
                                    ? 'The employee share is deducted from pay. The employer share is paid by the store on top and is never deducted.'
                                    : undefined
                            }
                        >
                            {data.method === 'fixed' && (
                                <Field label="Amount per pay period (₱)" error={errors.fixed_amount} htmlFor="rule-fixed" className="sm:max-w-xs">
                                    <input
                                        id="rule-fixed"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="input"
                                        value={data.fixed_amount}
                                        onChange={(e) => setData('fixed_amount', e.target.value)}
                                    />
                                </Field>
                            )}

                            {data.method === 'percentage' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div className="rounded-lg border border-gray-200 p-3">
                                            <Field
                                                label="Employee share (%)"
                                                error={errors.employee_rate}
                                                htmlFor="rule-employee-rate"
                                                hint="Deducted from the employee’s pay."
                                            >
                                                <input
                                                    id="rule-employee-rate"
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.0001"
                                                    className="input"
                                                    value={data.employee_rate}
                                                    onChange={(e) => setData('employee_rate', e.target.value)}
                                                />
                                            </Field>
                                        </div>
                                        {!isCustom && (
                                            <div className="rounded-lg border border-dashed border-gray-300 p-3">
                                                <Field
                                                    label="Employer share (%)"
                                                    error={errors.employer_rate}
                                                    htmlFor="rule-employer-rate"
                                                    hint="Paid by the store; never deducted from the employee."
                                                >
                                                    <input
                                                        id="rule-employer-rate"
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        step="0.0001"
                                                        className="input"
                                                        value={data.employer_rate}
                                                        onChange={(e) => setData('employer_rate', e.target.value)}
                                                    />
                                                </Field>
                                            </div>
                                        )}
                                    </div>
                                    {!isCustom && (
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <Field
                                                label="Minimum base (₱, optional)"
                                                error={errors.floor}
                                                htmlFor="rule-floor"
                                                hint="Leave blank for no minimum."
                                            >
                                                <input
                                                    id="rule-floor"
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    className="input"
                                                    value={data.floor}
                                                    onChange={(e) => setData('floor', e.target.value)}
                                                />
                                            </Field>
                                            <Field
                                                label="Maximum base (₱, optional)"
                                                error={errors.ceiling}
                                                htmlFor="rule-ceiling"
                                                hint="Leave blank for no maximum."
                                            >
                                                <input
                                                    id="rule-ceiling"
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    className="input"
                                                    value={data.ceiling}
                                                    onChange={(e) => setData('ceiling', e.target.value)}
                                                />
                                            </Field>
                                        </div>
                                    )}
                                </div>
                            )}

                            {tableMethod && (
                                <div>
                                    <p className="text-sm text-gray-700">
                                        {data.method === 'bracket'
                                            ? 'Brackets: monthly amounts for each range'
                                            : 'Brackets: tax = base tax + rate × (amount − bracket floor)'}
                                    </p>
                                    {data.method === 'bracket' && (
                                        <p className="help">Employee amounts are deducted from pay. Employer amounts are paid by the store on top.</p>
                                    )}
                                    <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th className="!px-2">From (₱)</th>
                                                    <th className="!px-2">Up to (₱)</th>
                                                    {data.method === 'bracket' ? (
                                                        <>
                                                            <th className="!px-2">Employee (₱)</th>
                                                            <th className="!px-2">Employer (₱)</th>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <th className="!px-2">Base tax (₱)</th>
                                                            <th className="!px-2">Rate (%)</th>
                                                        </>
                                                    )}
                                                    <th className="!px-2">
                                                        <span className="sr-only">Remove</span>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.brackets.length === 0 && (
                                                    <tr>
                                                        <td colSpan={5} className="text-center text-sm text-gray-500">
                                                            No brackets yet.
                                                        </td>
                                                    </tr>
                                                )}
                                                {data.brackets.map((b, i) => (
                                                    <tr key={i}>
                                                        {(data.method === 'bracket'
                                                            ? (['min', 'max', 'employee', 'employer'] as const)
                                                            : (['min', 'max', 'base', 'rate'] as const)
                                                        ).map((key) => (
                                                            <td key={key} className="!px-1.5 !py-1.5">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    aria-label={`${BRACKET_LABELS[key]}, bracket ${i + 1}`}
                                                                    placeholder={key === 'max' ? 'and above' : ''}
                                                                    className="input min-w-[6rem] py-1.5 text-right tabular-nums"
                                                                    value={b[key]}
                                                                    onChange={(e) => setBracket(i, key, e.target.value)}
                                                                />
                                                            </td>
                                                        ))}
                                                        <td className="!px-1.5 !py-1.5">
                                                            <button
                                                                type="button"
                                                                aria-label={`Remove bracket ${i + 1}`}
                                                                onClick={() =>
                                                                    setData(
                                                                        'brackets',
                                                                        data.brackets.filter((_, x) => x !== i),
                                                                    )
                                                                }
                                                                className="btn btn-ghost btn-sm btn-icon text-gray-500 hover:bg-red-50 hover:text-red-700"
                                                            >
                                                                <Icon name="x" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const last = data.brackets[data.brackets.length - 1];
                                            setData('brackets', [...data.brackets, { ...emptyBracket, min: last?.max ?? '' }]);
                                        }}
                                        className="btn btn-secondary btn-sm mt-2"
                                    >
                                        <Icon name="plus" className="h-3.5 w-3.5" />
                                        Add bracket
                                    </button>
                                    {bracketError && <p className="field-error">{bracketError}</p>}
                                </div>
                            )}
                        </FormSection>

                        <FormSection title="Who and when">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field label="Applies to" error={errors.applies_to} htmlFor="rule-applies">
                                    <select
                                        id="rule-applies"
                                        className="input"
                                        value={data.applies_to}
                                        onChange={(e) => setData('applies_to', e.target.value as 'all' | 'selected')}
                                    >
                                        <option value="all">All employees</option>
                                        <option value="selected">Selected employees</option>
                                    </select>
                                </Field>
                                <Field
                                    label="Effective from"
                                    error={errors.effective_from}
                                    required
                                    htmlFor="rule-effective"
                                    hint="The date this version starts to apply."
                                >
                                    <input
                                        id="rule-effective"
                                        type="date"
                                        required
                                        className="input"
                                        value={data.effective_from}
                                        onChange={(e) => setData('effective_from', e.target.value)}
                                    />
                                </Field>

                                {data.applies_to === 'selected' && (
                                    <Field
                                        label="Employees"
                                        error={errors.employee_ids}
                                        className="sm:col-span-2"
                                        hint={`${data.employee_ids.length} selected. Tap a name to include or exclude it.`}
                                    >
                                        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-gray-300 p-2">
                                            {employees.map((e) => {
                                                const on = data.employee_ids.includes(e.id);
                                                return (
                                                    <button
                                                        key={e.id}
                                                        type="button"
                                                        aria-pressed={on}
                                                        onClick={() =>
                                                            setData(
                                                                'employee_ids',
                                                                on ? data.employee_ids.filter((x) => x !== e.id) : [...data.employee_ids, e.id],
                                                            )
                                                        }
                                                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                                                            on
                                                                ? 'bg-brand-50 text-brand-700 ring-brand-200'
                                                                : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {on && <Icon name="check" className="h-3 w-3" />}
                                                        {e.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </Field>
                                )}

                                {isCustom && (
                                    <>
                                        <Field
                                            label="Signed authorization reference"
                                            error={errors.authorization_ref}
                                            required
                                            htmlFor="rule-authorization"
                                            hint="e.g. loan agreement or cash advance form number."
                                        >
                                            <input
                                                id="rule-authorization"
                                                required
                                                className="input"
                                                value={data.authorization_ref}
                                                onChange={(e) => setData('authorization_ref', e.target.value)}
                                            />
                                        </Field>
                                        <Field
                                            label="Total to deduct (₱, optional)"
                                            error={errors.total_limit}
                                            htmlFor="rule-limit"
                                            hint="Stops once this much has been deducted in finalized payrolls."
                                        >
                                            <input
                                                id="rule-limit"
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                className="input"
                                                value={data.total_limit}
                                                onChange={(e) => setData('total_limit', e.target.value)}
                                            />
                                        </Field>
                                    </>
                                )}
                            </div>
                        </FormSection>

                        <FormSection title="Verification and audit">
                            <div className="grid grid-cols-1 gap-4">
                                <Field
                                    label="Source / reference"
                                    error={errors.source_note}
                                    htmlFor="rule-source"
                                    hint={isCustom ? undefined : 'Where these values come from, so others can check them later.'}
                                >
                                    <input
                                        id="rule-source"
                                        className="input"
                                        value={data.source_note}
                                        onChange={(e) => setData('source_note', e.target.value)}
                                        placeholder={isCustom ? '' : 'e.g. SSS Circular No. …, dated …'}
                                    />
                                </Field>

                                <div className="space-y-2.5 rounded-lg border border-gray-200 p-3">
                                    <label className="flex items-center gap-2.5 text-sm text-gray-800">
                                        <input
                                            type="checkbox"
                                            checked={data.enabled}
                                            onChange={(e) => setData('enabled', e.target.checked)}
                                            className="checkbox"
                                        />
                                        Use this rule in payroll
                                    </label>
                                    <label className="flex items-start gap-2.5 text-sm text-gray-800">
                                        <input
                                            type="checkbox"
                                            checked={data.verified}
                                            onChange={(e) => setData('verified', e.target.checked)}
                                            className="checkbox mt-0.5"
                                        />
                                        <span>
                                            I checked these values against the current official issuance
                                            {isCustom ? ' and the employee’s signed authorization' : ''}.
                                        </span>
                                    </label>
                                    {!data.verified && (
                                        <p className="flex items-center gap-1.5 text-xs text-amber-800">
                                            <Badge tone="amber">
                                                <Icon name="warning" className="h-3 w-3" />
                                                Not verified
                                            </Badge>
                                            Unverified rules are flagged on this page.
                                        </p>
                                    )}
                                </div>

                                <Field
                                    label="Reason for this change"
                                    error={errors.change_reason}
                                    required
                                    htmlFor="rule-reason"
                                    hint="Kept in this rule’s history."
                                >
                                    <input
                                        id="rule-reason"
                                        required
                                        className="input"
                                        value={data.change_reason}
                                        onChange={(e) => setData('change_reason', e.target.value)}
                                    />
                                </Field>
                            </div>
                        </FormSection>
                    </div>
                </DialogLayout>
            </form>
        </Modal>
    );
}

function DeleteModal({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
    const [reason, setReason] = useState('');

    useEffect(() => setReason(''), [rule]);

    const destroy = () =>
        rule && router.delete(route('deductions.destroy', rule.id), { data: { change_reason: reason }, preserveScroll: true, onSuccess: onClose });

    return (
        <Modal show={rule !== null} onClose={onClose} maxWidth="md">
            <DialogLayout
                title={`Delete ${rule?.name ?? ''}?`}
                description="Draft payrolls stop using it after they are recalculated. Finalized payrolls are not affected."
                footer={
                    <>
                        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                        <DangerButton onClick={destroy} disabled={reason.trim().length < 3}>
                            <Icon name="trash" />
                            Delete
                        </DangerButton>
                    </>
                }
            >
                <Field label="Reason" required htmlFor="rule-delete-reason" hint="Kept in the rule’s history. At least 3 characters.">
                    <input id="rule-delete-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
            </DialogLayout>
        </Modal>
    );
}
