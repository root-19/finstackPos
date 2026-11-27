import Checkbox from '@/Components/Checkbox';
import PageHeader from '@/Components/PageHeader';
import { Alert, Badge, Card, CardHeader } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEventHandler, useMemo } from 'react';

type Module = {
    key: string;
    label: string;
    description: string;
    group: string;
    pro: boolean;
    requires: string[];
};

type Props = PageProps<{
    /** App\Support\Modules::catalog() */
    modules: Module[];
    enabled: string[];
    /** The store has Pro (Pro modules still show locked without it). */
    pro: boolean;
}>;

const ALWAYS_ON = ['Dashboard', 'Settings', 'Profile', 'Support', 'System details'];

/**
 * Settings → Customize: the owner checks what the store uses. Unchecked
 * modules leave the sidebar and their pages close; their data is kept.
 * Mirrors App\Support\Modules::withRequirements() so the checkboxes match
 * what the server saves.
 */
export default function Customize({ modules, enabled, pro }: Props) {
    const byKey = useMemo(() => Object.fromEntries(modules.map((m) => [m.key, m])), [modules]);
    const { data, setData, put, processing, isDirty } = useForm<{ modules: string[] }>({ modules: enabled });
    const on = new Set(data.modules);

    /** A module and everything it needs. */
    const withRequirements = (key: string, into = new Set<string>()): Set<string> => {
        if (into.has(key)) return into;
        into.add(key);
        byKey[key]?.requires.forEach((r) => withRequirements(r, into));
        return into;
    };

    /** Modules that can't work without `key` (turned off with it). */
    const dependents = (key: string): string[] =>
        modules.filter((m) => m.key !== key && withRequirements(m.key).has(key)).map((m) => m.key);

    const toggle = (key: string, checked: boolean) => {
        const next = new Set(on);
        if (checked) {
            withRequirements(key).forEach((k) => next.add(k));
        } else {
            next.delete(key);
            dependents(key).forEach((k) => next.delete(k));
        }
        // Keep the registry's order so the saved list is stable.
        setData('modules', modules.map((m) => m.key).filter((k) => next.has(k)));
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        put(route('modules.update'), { preserveScroll: true });
    };

    const groups = modules.reduce<Record<string, Module[]>>((acc, m) => {
        (acc[m.group] ??= []).push(m);
        return acc;
    }, {});

    return (
        <AuthenticatedLayout header={<PageHeader title="Customize" subtitle="Choose what your store uses. Anything you turn off is hidden from the sidebar for everyone." />}>
            <Head title="Customize" />

            <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-3">
                        <img src="/fin/fin-wave.webp" alt="" aria-hidden className="h-14 w-auto" />
                        <p className="text-sm text-gray-700">Not sure what you need? Fin can ask a few questions and set it up for you.</p>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => router.post(route('onboarding.restart'))}>
                        Set up with Fin
                    </button>
                </div>

                <Alert tone="blue">
                    Turning something off only hides it: your products, sales, stock and team records stay safe and come back when you turn it on
                    again.
                </Alert>

                <Card>
                    <CardHeader title="Always on" />
                    <div className="card-body flex flex-wrap gap-2">
                        {ALWAYS_ON.map((name) => (
                            <Badge key={name} tone="gray">
                                {name}
                            </Badge>
                        ))}
                    </div>
                </Card>

                {Object.entries(groups).map(([group, items]) => (
                    <Card key={group}>
                        <CardHeader title={group} />
                        <ul className="divide-y divide-gray-100">
                            {items.map((m) => {
                                const checked = on.has(m.key);
                                const needs = m.requires.map((r) => byKey[r]?.label).filter(Boolean);
                                const neededBy = dependents(m.key).filter((k) => on.has(k)).map((k) => byKey[k].label);

                                return (
                                    <li key={m.key}>
                                        <label className="flex cursor-pointer items-start gap-3 px-5 py-4 hover:bg-gray-50">
                                            <Checkbox className="mt-0.5" checked={checked} onChange={(e) => toggle(m.key, e.target.checked)} />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                                                    {m.label}
                                                    {m.pro && <Badge tone="brand">Pro</Badge>}
                                                </span>
                                                <span className="mt-0.5 block text-sm text-gray-600">{m.description}</span>
                                                {needs.length > 0 && <span className="mt-1 block text-xs text-gray-500">Needs: {needs.join(', ')} (turned on with it)</span>}
                                                {checked && neededBy.length > 0 && (
                                                    <span className="mt-1 block text-xs text-amber-700">Turning this off also turns off: {neededBy.join(', ')}</span>
                                                )}
                                                {checked && m.pro && !pro && (
                                                    <span className="mt-1 block text-xs text-gray-500">
                                                        Shows locked until you{' '}
                                                        <Link href={route('subscription.index')} className="font-semibold text-brand-700 underline">
                                                            get Pro
                                                        </Link>
                                                        .
                                                    </span>
                                                )}
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    </Card>
                ))}

                <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
                    <span className="mr-auto text-sm text-gray-600">{data.modules.length} of {modules.length} turned on</span>
                    <button type="submit" disabled={processing || !isDirty} className="btn btn-primary">
                        Save
                    </button>
                </div>
            </form>
        </AuthenticatedLayout>
    );
}
