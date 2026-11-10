import GuestLayout from '@/Layouts/GuestLayout';
import { clearOfflinePageCache } from '@/lib/pwa';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler, useEffect } from 'react';

export default function Login({ status, canResetPassword }: { status?: string; canResetPassword: boolean }) {
    // Reaching the login page means the previous session is over (expired,
    // or logged out some other way): its cached POS page must not outlive it.
    useEffect(clearOfflinePageCache, []);

    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false as boolean,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    return (
        <GuestLayout
            title="Log in"
            description="Welcome back. Sign in to your store."
            slip="Sign-in slip"
            headline={
                <>
                    Welcome
                    <br />
                    <span className="text-brand-500">back.</span>
                </>
            }
            footer={
                <>
                    New to FinstackPOS?{' '}
                    <Link href={route('register')} className="font-semibold text-shop-paper underline decoration-brand-500 underline-offset-4 hover:decoration-2">
                        Create your store
                    </Link>
                </>
            }
        >
            <Head title="Log in" />

            {status && (
                <p role="status" className="mb-6 border-l-4 border-brand-700 bg-shop-paper-2 px-4 py-3 text-[15px]">
                    {status}
                </p>
            )}

            <form onSubmit={submit} className="space-y-6">
                <div>
                    <label htmlFor="email" className="mk-label block text-shop-ink/70">
                        Email
                    </label>
                    <input
                        id="email"
                        type="email"
                        name="email"
                        className="mk-field"
                        value={data.email}
                        autoComplete="username"
                        autoFocus
                        aria-invalid={errors.email ? true : undefined}
                        aria-describedby={errors.email ? 'email-error' : undefined}
                        onChange={(e) => setData('email', e.target.value)}
                    />
                    {errors.email && (
                        <p id="email-error" className="mt-1.5 text-sm font-semibold text-brand-800">
                            {errors.email}
                        </p>
                    )}
                </div>

                <div>
                    <div className="flex items-baseline justify-between gap-3">
                        <label htmlFor="password" className="mk-label block text-shop-ink/70">
                            Password
                        </label>
                        {canResetPassword && (
                            <Link href={route('password.request')} className="text-sm font-semibold text-brand-800 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700">
                                Forgot password?
                            </Link>
                        )}
                    </div>
                    <input
                        id="password"
                        type="password"
                        name="password"
                        className="mk-field"
                        value={data.password}
                        autoComplete="current-password"
                        aria-invalid={errors.password ? true : undefined}
                        aria-describedby={errors.password ? 'password-error' : undefined}
                        onChange={(e) => setData('password', e.target.value)}
                    />
                    {errors.password && (
                        <p id="password-error" className="mt-1.5 text-sm font-semibold text-brand-800">
                            {errors.password}
                        </p>
                    )}
                </div>

                <label className="flex min-h-[44px] w-fit cursor-pointer items-center gap-3">
                    <input
                        type="checkbox"
                        name="remember"
                        checked={data.remember}
                        onChange={(e) => setData('remember', e.target.checked)}
                        className="h-5 w-5 rounded-none border-shop-ink/50 bg-transparent text-brand-700 focus:ring-brand-700 focus:ring-offset-shop-paper"
                    />
                    <span className="text-[15px]">Remember me</span>
                </label>

                <button type="submit" disabled={processing} className="mk-btn-red w-full disabled:cursor-wait disabled:opacity-70">
                    {processing ? 'Signing in…' : 'Log in →'}
                </button>
            </form>
        </GuestLayout>
    );
}
