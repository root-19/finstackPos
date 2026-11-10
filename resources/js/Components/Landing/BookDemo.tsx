import LineIcon from '@/Components/Landing/LineIcon';
import Reveal from '@/Components/Landing/Reveal';
import { useForm } from '@inertiajs/react';
import { FormEventHandler, ReactNode, useId, useState } from 'react';

/** From WelcomeController: the same slots and date range the server validates against. */
export interface DemoOptions {
    slots: string[];
    min: string;
    max: string;
    minutes: number;
}

/** "13:30" → "1:30 PM". */
function slotLabel(slot: string): string {
    const [h, m] = slot.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const input =
    'block min-h-[48px] w-full rounded-xl border-gray-300 bg-white px-4 text-base text-ink-900 shadow-sm placeholder:text-gray-400 focus:border-brand-700 focus:ring-brand-700';

function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: string; children: ReactNode; id: string }) {
    return (
        <div>
            <label htmlFor={id} className="block text-[15px] font-semibold text-ink-900">
                {label}
            </label>
            <div className="mt-1.5">{children}</div>
            {hint && !error && <p className="mt-1.5 text-sm text-gray-600">{hint}</p>}
            {error && (
                <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-brand-800">
                    {error}
                </p>
            )}
        </div>
    );
}

/** The "Book a demo" section: a short form that emails the team with a calendar invite. */
export default function BookDemo({ options }: { options: DemoOptions }) {
    const id = useId();
    const [booked, setBooked] = useState<string | null>(null);
    const form = useForm({
        name: '',
        business_name: '',
        email: '',
        phone: '',
        date: '',
        time: '',
        notes: '',
        website: '', // honeypot, hidden from people
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        form.post(route('demo.store'), {
            preserveScroll: true,
            onSuccess: () => {
                setBooked(`${formatDate(form.data.date)} at ${slotLabel(form.data.time)}`);
                form.reset();
            },
        });
    };

    const err = (field: keyof typeof form.data) =>
        form.errors[field] ? { 'aria-invalid': true, 'aria-describedby': `${id}-${field}-error` } : {};

    return (
        <section id="book-demo" aria-labelledby="book-demo-title" className="mk-section scroll-mt-20 bg-gray-50">
            <div className="mk-container grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
                <Reveal>
                    <p className="mk-eyebrow">Book a demo</p>
                    <h2 id="book-demo-title" className="mk-h2 mt-3">
                        See FinstackPOS with your own store in mind.
                    </h2>
                    <p className="mk-lead mt-5">
                        Pick a date and time. We'll walk you through selling, stock and payroll in {options.minutes} minutes and answer your questions.
                    </p>
                    <ul className="mt-8 space-y-3 text-[17px]">
                        {['Free, no commitment', 'Philippine time (PHT)', "We'll confirm the schedule by email"].map((line) => (
                            <li key={line} className="flex items-center gap-3">
                                <LineIcon name="check" className="h-5 w-5 text-brand-700" strokeWidth={2.25} />
                                {line}
                            </li>
                        ))}
                    </ul>
                </Reveal>

                <div className="mk-card p-6 sm:p-8">
                    {booked ? (
                        <div role="status" className="py-6 text-center">
                            <span className="mk-icon mx-auto h-14 w-14 rounded-full">
                                <LineIcon name="check" className="h-7 w-7" strokeWidth={2.25} />
                            </span>
                            <h3 className="mt-5 text-2xl font-extrabold tracking-[-0.02em]">Demo requested</h3>
                            <p className="mt-2 text-gray-600">
                                You asked for <span className="font-semibold text-ink-900">{booked}</span> (PHT). We'll confirm by email soon.
                            </p>
                            <button type="button" onClick={() => setBooked(null)} className="mk-btn-secondary mt-6">
                                Book another time
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
                            <div className="sm:col-span-1">
                                <Field id={`${id}-name`} label="Your name" error={form.errors.name}>
                                    <input id={`${id}-name`} className={input} autoComplete="name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} {...err('name')} />
                                </Field>
                            </div>
                            <div className="sm:col-span-1">
                                <Field id={`${id}-business_name`} label="Business name" error={form.errors.business_name}>
                                    <input
                                        id={`${id}-business_name`}
                                        className={input}
                                        autoComplete="organization"
                                        required
                                        value={form.data.business_name}
                                        onChange={(e) => form.setData('business_name', e.target.value)}
                                        {...err('business_name')}
                                    />
                                </Field>
                            </div>
                            <div className="sm:col-span-1">
                                <Field id={`${id}-email`} label="Email" error={form.errors.email}>
                                    <input
                                        id={`${id}-email`}
                                        type="email"
                                        className={input}
                                        autoComplete="email"
                                        inputMode="email"
                                        required
                                        value={form.data.email}
                                        onChange={(e) => form.setData('email', e.target.value)}
                                        {...err('email')}
                                    />
                                </Field>
                            </div>
                            <div className="sm:col-span-1">
                                <Field id={`${id}-phone`} label="Mobile number (optional)" error={form.errors.phone}>
                                    <input
                                        id={`${id}-phone`}
                                        type="tel"
                                        className={input}
                                        autoComplete="tel"
                                        inputMode="tel"
                                        placeholder="0917 123 4567"
                                        value={form.data.phone}
                                        onChange={(e) => form.setData('phone', e.target.value)}
                                        {...err('phone')}
                                    />
                                </Field>
                            </div>
                            <div className="sm:col-span-1">
                                <Field id={`${id}-date`} label="Date" error={form.errors.date}>
                                    <input
                                        id={`${id}-date`}
                                        type="date"
                                        className={input}
                                        required
                                        min={options.min}
                                        max={options.max}
                                        value={form.data.date}
                                        onChange={(e) => form.setData('date', e.target.value)}
                                        {...err('date')}
                                    />
                                </Field>
                            </div>
                            <div className="sm:col-span-1">
                                <Field id={`${id}-time`} label="Time (PHT)" error={form.errors.time}>
                                    <select id={`${id}-time`} className={input} required value={form.data.time} onChange={(e) => form.setData('time', e.target.value)} {...err('time')}>
                                        <option value="" disabled>
                                            Choose a time
                                        </option>
                                        {options.slots.map((slot) => (
                                            <option key={slot} value={slot}>
                                                {slotLabel(slot)}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            </div>
                            <div className="sm:col-span-2">
                                <Field id={`${id}-notes`} label="What would you like to see? (optional)" error={form.errors.notes}>
                                    <textarea
                                        id={`${id}-notes`}
                                        rows={3}
                                        maxLength={1000}
                                        className={`${input} py-3`}
                                        placeholder="e.g. We run a milk tea shop with 2 branches."
                                        value={form.data.notes}
                                        onChange={(e) => form.setData('notes', e.target.value)}
                                        {...err('notes')}
                                    />
                                </Field>
                            </div>
                            {/* Honeypot: off-screen and skipped by keyboard and screen readers. */}
                            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
                                <label htmlFor={`${id}-website`}>Website</label>
                                <input id={`${id}-website`} tabIndex={-1} autoComplete="off" value={form.data.website} onChange={(e) => form.setData('website', e.target.value)} />
                            </div>
                            <div className="sm:col-span-2">
                                <button type="submit" disabled={form.processing} className="mk-btn-primary w-full disabled:cursor-wait disabled:opacity-70">
                                    {form.processing ? 'Sending…' : 'Book my demo'}
                                </button>
                                {form.hasErrors && (
                                    <p role="alert" className="mt-3 text-sm font-medium text-brand-800">
                                        Please check the highlighted fields.
                                    </p>
                                )}
                                <p className="mt-3 text-sm text-gray-600">
                                    We use your details only to schedule the demo. See our{' '}
                                    <a href={route('privacy')} className="font-semibold text-ink-900 underline underline-offset-2">
                                        Privacy Policy
                                    </a>
                                    .
                                </p>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </section>
    );
}

/** "2026-11-12" → "Thu, Nov 12, 2026" (the date itself, no timezone shift). */
function formatDate(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
