import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler, InputHTMLAttributes } from 'react';

type FieldName = 'business_name' | 'name' | 'email' | 'password' | 'password_confirmation';

/** One labelled underline field on the sign-up slip. */
function SlipField({
    name,
    label,
    error,
    ...input
}: { name: FieldName; label: string; error?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'name'>) {
    return (
        <div>
            <label htmlFor={name} className="mk-label block text-shop-ink/70">
                {label}
            </label>
            <input
                id={name}
                name={name}
                className="mk-field"
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${name}-error` : undefined}
                {...input}
            />
            {error && (
                <p id={`${name}-error`} className="mt-1.5 text-sm font-semibold text-brand-800">
                    {error}
                </p>
            )}
        </div>
    );
}

export default function Register() {
    const { data, setData, post, processing, errors, reset } = useForm({
        business_name: '',
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        post(route('register'), {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <GuestLayout
            title="Create your store"
            description="Free to start. No card needed."
            slip="Sign-up slip"
            headline={
                <>
                    Open your
                    <br />
                    <span className="text-brand-500">register.</span>
                </>
            }
            footer={
                <>
                    Already have a store?{' '}
                    <Link href={route('login')} className="font-semibold text-shop-paper underline decoration-brand-500 underline-offset-4 hover:decoration-2">
                        Log in
                    </Link>
                </>
            }
        >
            <Head title="Create your store" />

            <form onSubmit={submit} className="space-y-6">
                <SlipField
                    name="business_name"
                    label="Business name"
                    value={data.business_name}
                    autoComplete="organization"
                    autoFocus
                    error={errors.business_name}
                    onChange={(e) => setData('business_name', e.target.value)}
                />
                <SlipField name="name" label="Your name" value={data.name} autoComplete="name" error={errors.name} onChange={(e) => setData('name', e.target.value)} />
                <SlipField
                    name="email"
                    label="Email"
                    type="email"
                    inputMode="email"
                    value={data.email}
                    autoComplete="username"
                    error={errors.email}
                    onChange={(e) => setData('email', e.target.value)}
                />
                <div className="grid gap-6 sm:grid-cols-2">
                    <SlipField
                        name="password"
                        label="Password"
                        type="password"
                        value={data.password}
                        autoComplete="new-password"
                        error={errors.password}
                        onChange={(e) => setData('password', e.target.value)}
                    />
                    <SlipField
                        name="password_confirmation"
                        label="Confirm password"
                        type="password"
                        value={data.password_confirmation}
                        autoComplete="new-password"
                        error={errors.password_confirmation}
                        onChange={(e) => setData('password_confirmation', e.target.value)}
                    />
                </div>

                <button type="submit" disabled={processing} className="mk-btn-red w-full disabled:cursor-wait disabled:opacity-70">
                    {processing ? 'Creating your store…' : 'Create my store →'}
                </button>

                {/* Plain links (full page load): the legal pages are served in the landing shell. */}
                <p className="text-center text-sm text-shop-ink/70">
                    By creating an account you agree to the{' '}
                    <a href={route('terms')} className="font-semibold text-shop-ink underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700">
                        Terms
                    </a>{' '}
                    and{' '}
                    <a href={route('privacy')} className="font-semibold text-shop-ink underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700">
                        Privacy Policy
                    </a>
                    .
                </p>
            </form>
        </GuestLayout>
    );
}
