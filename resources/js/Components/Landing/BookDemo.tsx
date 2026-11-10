import LineIcon from '@/Components/Landing/LineIcon';
import { contactLinks } from '@/Components/Landing/contact';
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

/** "2026-11-12" → "Thu, Nov 12, 2026" (the date itself, no timezone shift). */
function formatDate(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
    return (
        <div>
            <label htmlFor={id} className="mk-label block text-shop-ink/70">
                {label}
            </label>
            {children}
            {error && (
                <p id={`${id}-error`} className="mt-1.5 text-sm font-semibold text-brand-800">
                    {error}
                </p>
            )}
        </div>
    );
}

/** "04 — Book a demo": a paper demo slip that emails the team with a calendar invite. */
export default function BookDemo({ options }: { options: DemoOptions }) {
    const id = useId();
    const contacts = contactLinks();
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

    const aria = (field: keyof typeof form.data) =>
        form.errors[field] ? { 'aria-invalid': true, 'aria-describedby': `${id}-${field}-error` } : {};

    return (
        <section id="book-demo" aria-labelledby="book-demo-title" className="mk-section scroll-mt-16 border-t border-shop-paper/10 bg-shop-ink">
            <div className="mk-container grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
                <div>
                    <p className="mk-label text-brand-500">04 — Book a demo</p>
                    <h2 id="book-demo-title" className="mk-h2 mt-4">
                        See it run
                        <br />
                        for your store.
                    </h2>
                    <p className="mt-6 max-w-md text-lg text-shop-paper/75">
                        Pick a date and time. We'll walk you through selling, stock and payroll in {options.minutes} minutes, and answer your questions.
                    </p>
                    <dl className="mt-10 border-t border-shop-paper/15">
                        {[
                            ['Cost', 'Free, no commitment'],
                            ['Length', `${options.minutes} minutes`],
                            ['Time zone', 'Philippine time (PHT)'],
                            ['Confirmation', 'By email'],
                        ].map(([term, value]) => (
                            <div key={term} className="flex justify-between gap-4 border-b border-shop-paper/15 py-3">
                                <dt className="mk-label text-shop-paper/60">{term}</dt>
                                <dd className="text-right font-semibold">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    {contacts.length > 0 && (
                        <div className="mt-8">
                            <p className="mk-label text-shop-paper/60">Or message us</p>
                            <ul className="mt-2 flex flex-wrap gap-x-6">
                                {contacts.map((link) => (
                                    <li key={link.href}>
                                        <a
                                            href={link.href}
                                            className="mk-link inline-flex min-h-[44px] items-center text-shop-paper underline decoration-brand-500 underline-offset-4"
                                            {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                        >
                                            {link.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="mk-ticket relative px-6 pb-8 pt-6 sm:px-10">
                    <div className="flex items-baseline justify-between gap-4">
                        <p className="mk-label">FinstackPOS · Demo slip</p>
                        <p aria-hidden className="mk-label text-shop-ink/60">
                            No. — — —
                        </p>
                    </div>
                    <div aria-hidden className="mk-perf mt-4 text-shop-ink/40" />

                    {booked ? (
                        <div role="status" className="py-12 text-center">
                            <p className="inline-block rotate-[-4deg] border-[3px] border-double border-brand-700 px-4 py-2 font-plex text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">
                                Booked
                            </p>
                            <p className="mt-6 font-display text-4xl uppercase">Demo requested</p>
                            <p className="mt-3 text-shop-ink/75">
                                You asked for <span className="font-bold text-shop-ink">{booked}</span> (PHT). We'll confirm by email soon.
                            </p>
                            <button type="button" onClick={() => setBooked(null)} className="mk-btn-ink mt-8">
                                Book another time
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={submit} noValidate className="mt-6 grid gap-6 sm:grid-cols-2">
                            <Field id={`${id}-name`} label="Your name *" error={form.errors.name}>
                                <input id={`${id}-name`} className="mk-field" autoComplete="name" value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} {...aria('name')} />
                            </Field>
                            <Field id={`${id}-business_name`} label="Business name *" error={form.errors.business_name}>
                                <input
                                    id={`${id}-business_name`}
                                    className="mk-field"
                                    autoComplete="organization"
                                    value={form.data.business_name}
                                    onChange={(e) => form.setData('business_name', e.target.value)}
                                    {...aria('business_name')}
                                />
                            </Field>
                            <Field id={`${id}-email`} label="Email *" error={form.errors.email}>
                                <input
                                    id={`${id}-email`}
                                    type="email"
                                    inputMode="email"
                                    className="mk-field"
                                    autoComplete="email"
                                    value={form.data.email}
                                    onChange={(e) => form.setData('email', e.target.value)}
                                    {...aria('email')}
                                />
                            </Field>
                            <Field id={`${id}-phone`} label="Mobile (optional)" error={form.errors.phone}>
                                <input
                                    id={`${id}-phone`}
                                    type="tel"
                                    inputMode="tel"
                                    className="mk-field"
                                    autoComplete="tel"
                                    placeholder="0917 123 4567"
                                    value={form.data.phone}
                                    onChange={(e) => form.setData('phone', e.target.value)}
                                    {...aria('phone')}
                                />
                            </Field>
                            <div className="sm:col-span-2">
                                <Field id={`${id}-date`} label="Date *" error={form.errors.date}>
                                    <input
                                        id={`${id}-date`}
                                        type="date"
                                        className="mk-field sm:max-w-[16rem]"
                                        min={options.min}
                                        max={options.max}
                                        value={form.data.date}
                                        onChange={(e) => form.setData('date', e.target.value)}
                                        {...aria('date')}
                                    />
                                </Field>
                            </div>

                            <fieldset className="sm:col-span-2" {...aria('time')}>
                                <legend className="mk-label text-shop-ink/70">Time, Philippine time *</legend>
                                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                                    {options.slots.map((slot) => {
                                        const checked = form.data.time === slot;
                                        return (
                                            <label
                                                key={slot}
                                                className={`flex min-h-[44px] cursor-pointer items-center justify-center border font-plex text-[13px] transition-colors focus-within:ring-2 focus-within:ring-brand-700 ${
                                                    checked ? 'border-shop-ink bg-shop-ink text-shop-paper' : 'border-shop-ink/30 hover:border-shop-ink'
                                                }`}
                                            >
                                                <input type="radio" name={`${id}-time`} value={slot} checked={checked} onChange={() => form.setData('time', slot)} className="sr-only" />
                                                {slotLabel(slot)}
                                            </label>
                                        );
                                    })}
                                </div>
                                {form.errors.time && (
                                    <p id={`${id}-time-error`} className="mt-1.5 text-sm font-semibold text-brand-800">
                                        {form.errors.time}
                                    </p>
                                )}
                            </fieldset>

                            <div className="sm:col-span-2">
                                <Field id={`${id}-notes`} label="What should we show you? (optional)" error={form.errors.notes}>
                                    <textarea
                                        id={`${id}-notes`}
                                        rows={2}
                                        maxLength={1000}
                                        className="mk-field resize-y"
                                        placeholder="e.g. Milk tea shop with 2 branches"
                                        value={form.data.notes}
                                        onChange={(e) => form.setData('notes', e.target.value)}
                                        {...aria('notes')}
                                    />
                                </Field>
                            </div>

                            {/* Honeypot: off-screen and skipped by keyboard and screen readers. */}
                            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
                                <label htmlFor={`${id}-website`}>Website</label>
                                <input id={`${id}-website`} tabIndex={-1} autoComplete="off" value={form.data.website} onChange={(e) => form.setData('website', e.target.value)} />
                            </div>

                            <div className="sm:col-span-2">
                                <button type="submit" disabled={form.processing} className="mk-btn-red w-full disabled:cursor-wait disabled:opacity-70">
                                    {form.processing ? 'Sending…' : 'Submit demo slip'}
                                    {!form.processing && <LineIcon name="arrow" className="h-4 w-4" strokeWidth={2} />}
                                </button>
                                {form.hasErrors && (
                                    <p role="alert" className="mt-3 text-sm font-semibold text-brand-800">
                                        Please check the marked fields.
                                    </p>
                                )}
                                <p className="mt-3 text-sm text-shop-ink/70">
                                    We use your details only to schedule the demo. See the{' '}
                                    <a href={route('privacy')} className="font-semibold text-shop-ink underline underline-offset-2">
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
