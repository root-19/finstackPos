import { Link } from '@inertiajs/react';
import { ReactNode } from 'react';
import DangerButton from './DangerButton';
import Modal from './Modal';
import SecondaryButton from './SecondaryButton';

/*
 * Shared building blocks of the signed-in app. They wrap the classes in
 * resources/css/app.css so every module looks and behaves the same.
 */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <section className={`card ${className}`}>{children}</section>;
}

/** A card's title row, with optional actions on the right. */
export function CardHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="card-header">
            <div className="min-w-0">
                <h2 className="card-title">{title}</h2>
                {subtitle && <p className="card-subtitle">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export type Tone = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'dark' | 'brand';

export function Badge({ tone = 'gray', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
    return <span className={`badge badge-${tone} ${className}`}>{children}</span>;
}

/** A key number. `tone` colors the value only when it needs attention. */
export function Stat({
    label,
    value,
    hint,
    tone,
    onClick,
    active = false,
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    tone?: 'red' | 'amber' | 'green';
    onClick?: () => void;
    active?: boolean;
}) {
    const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-emerald-700' : '';
    const body = (
        <>
            <p className="stat-label">{label}</p>
            <p className={`stat-value ${color}`}>{value}</p>
            {hint && <p className="mt-0.5 text-xs leading-snug text-gray-500">{hint}</p>}
        </>
    );

    return onClick ? (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`stat text-left transition hover:border-gray-300 ${active ? 'border-brand-300 ring-1 ring-brand-200' : ''}`}
        >
            {body}
        </button>
    ) : (
        <div className="stat">{body}</div>
    );
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
    return (
        <div className="flex flex-col items-center px-6 py-12 text-center">
            {icon && <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-400">{icon}</div>}
            <p className="text-sm font-semibold text-gray-950">{title}</p>
            {children && <div className="mt-1 max-w-sm text-sm text-gray-500">{children}</div>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

/** Label, control, hint, and error, laid out the same everywhere. */
export function Field({
    label,
    error,
    hint,
    required = false,
    className = '',
    htmlFor,
    children,
}: {
    label: string;
    error?: string;
    hint?: ReactNode;
    required?: boolean;
    className?: string;
    htmlFor?: string;
    children: ReactNode;
}) {
    return (
        <div className={className}>
            <label className="label" htmlFor={htmlFor}>
                {label}
                {required && (
                    <span className="ms-0.5 text-red-600" aria-hidden>
                        *
                    </span>
                )}
            </label>
            <div className="mt-1">{children}</div>
            {error ? <p className="field-error">{error}</p> : hint ? <p className="help">{hint}</p> : null}
        </div>
    );
}

/** Sub-page navigation of a module (links). */
export function PageTabs({ tabs }: { tabs: { label: string; href: string; active: boolean; count?: number }[] }) {
    return (
        <nav className="tabs" aria-label="Sections">
            {tabs.map((t) => (
                <Link key={t.label} href={t.href} className={`tab ${t.active ? 'tab-active' : ''}`} aria-current={t.active ? 'page' : undefined}>
                    {t.label}
                    {t.count !== undefined && <span className="rounded-md bg-gray-100 px-1.5 text-xs text-gray-600">{t.count}</span>}
                </Link>
            ))}
        </nav>
    );
}

/** A small set of mutually exclusive options (views, filters). */
export function Segmented<T extends string>({
    value,
    options,
    onChange,
    label,
}: {
    value: T;
    options: { value: T; label: ReactNode; count?: number }[];
    onChange: (value: T) => void;
    label: string;
}) {
    return (
        <div className="segmented" role="group" aria-label={label}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    aria-pressed={value === o.value}
                    className={`segmented-item ${value === o.value ? 'segmented-item-active' : ''}`}
                >
                    {o.label}
                    {o.count !== undefined && <span className="rounded bg-gray-200/80 px-1.5 text-xs text-gray-600">{o.count}</span>}
                </button>
            ))}
        </div>
    );
}

/** An inline notice. Never color alone: it always carries text. */
export function Alert({
    tone = 'amber',
    title,
    children,
    className = '',
}: {
    tone?: 'amber' | 'red' | 'blue' | 'green';
    title?: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    const styles = {
        amber: 'border-amber-200 bg-amber-50 text-amber-900',
        red: 'border-red-200 bg-red-50 text-red-800',
        blue: 'border-blue-200 bg-blue-50 text-blue-900',
        green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    }[tone];

    return (
        <div role={tone === 'red' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${styles} ${className}`}>
            {title && <p className="font-semibold">{title}</p>}
            {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
        </div>
    );
}

/** The standard modal body: title, description, content, and footer actions. */
export function DialogLayout({
    title,
    description,
    children,
    footer,
}: {
    title: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
}) {
    return (
        <div className="flex max-h-[90vh] flex-col">
            <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
                <h2 className="text-base font-semibold text-gray-950">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
            </div>
            {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>}
            {footer && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3 sm:px-6">{footer}</div>
            )}
        </div>
    );
}

/** Asks before a destructive action. */
export function ConfirmDialog({
    show,
    title,
    children,
    confirmLabel,
    onConfirm,
    onClose,
    processing = false,
}: {
    show: boolean;
    title: ReactNode;
    children?: ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
    onClose: () => void;
    processing?: boolean;
}) {
    return (
        <Modal show={show} onClose={onClose} maxWidth="md">
            <DialogLayout
                title={title}
                footer={
                    <>
                        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                        <DangerButton onClick={onConfirm} disabled={processing}>
                            {confirmLabel}
                        </DangerButton>
                    </>
                }
            >
                {children && <div className="text-sm text-gray-600">{children}</div>}
            </DialogLayout>
        </Modal>
    );
}
