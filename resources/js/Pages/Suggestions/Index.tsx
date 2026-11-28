import PageHeader from '@/Components/PageHeader';
import TextInput from '@/Components/TextInput';
import { Badge, Card, CardHeader, EmptyState, Field } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';

type Suggestion = {
    id: number;
    category: string;
    title: string;
    details: string | null;
    status: string;
    admin_note: string | null;
    by: string | null;
    created_at: string;
};

type Props = PageProps<{
    categories: Record<string, string>;
    statuses: Record<string, string>;
    suggestions: Suggestion[];
}>;

export const STATUS_TONE: Record<string, 'gray' | 'blue' | 'amber' | 'green' | 'red'> = {
    new: 'gray',
    reviewing: 'blue',
    planned: 'amber',
    done: 'green',
    declined: 'red',
};

/** "Suggest a feature": open to every store user on every plan. */
export default function SuggestionsIndex({ categories, statuses, suggestions }: Props) {
    const { data, setData, post, processing, errors, reset } = useForm({ category: 'pos', title: '', details: '' });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('suggestions.store'), { preserveScroll: true, onSuccess: () => reset('title', 'details') });
    };

    return (
        <AuthenticatedLayout header={<PageHeader title="Suggest a feature" subtitle="Tell the FinstackPOS team what would make your work easier." />}>
            <Head title="Suggest a feature" />

            <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <Card>
                    <CardHeader title="Your idea" subtitle="Every suggestion is read by our team, on every plan." />
                    <form onSubmit={submit} className="card-body space-y-4">
                        <Field label="What is it about?" htmlFor="category" error={errors.category}>
                            <select id="category" className="input" value={data.category} onChange={(e) => setData('category', e.target.value)}>
                                {Object.entries(categories).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Your suggestion" htmlFor="title" error={errors.title} required>
                            <TextInput
                                id="title"
                                value={data.title}
                                onChange={(e) => setData('title', e.target.value)}
                                maxLength={120}
                                placeholder="e.g. Print the table number on the receipt"
                                required
                            />
                        </Field>
                        <Field label="Details (optional)" htmlFor="details" error={errors.details} hint="How would it help you? An example is great.">
                            <textarea
                                id="details"
                                className="input"
                                rows={5}
                                maxLength={2000}
                                value={data.details}
                                onChange={(e) => setData('details', e.target.value)}
                            />
                        </Field>
                        <div className="flex justify-end">
                            <button type="submit" className="btn btn-primary" disabled={processing || data.title.trim() === ''}>
                                Send suggestion
                            </button>
                        </div>
                    </form>
                </Card>

                <Card>
                    <CardHeader title="Your store’s suggestions" subtitle="See what the team decided." />
                    {suggestions.length === 0 ? (
                        <div className="card-body">
                            <EmptyState title="No suggestions yet">Your ideas will show here with their status.</EmptyState>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {suggestions.map((s) => (
                                <li key={s.id} className="px-5 py-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="font-semibold text-gray-900">{s.title}</p>
                                        <Badge tone={STATUS_TONE[s.status] ?? 'gray'}>{statuses[s.status] ?? s.status}</Badge>
                                    </div>
                                    <p className="mt-0.5 text-xs text-gray-500">
                                        {categories[s.category] ?? s.category} · {s.by ?? 'Someone'} · {new Date(s.created_at).toLocaleDateString()}
                                    </p>
                                    {s.details && <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{s.details}</p>}
                                    {s.admin_note && (
                                        <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm text-gray-700">
                                            <span className="font-semibold">FinstackPOS team:</span> {s.admin_note}
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
