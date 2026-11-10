import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import { Field } from '@/Components/ui';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';

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
            title="Create your account"
            description="Set up your business on FinstackPOS."
            footer={
                <>
                    Already registered?{' '}
                    <Link
                        href={route('login')}
                        className="rounded font-semibold text-brand-700 hover:text-brand-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                    >
                        Log in
                    </Link>
                </>
            }
        >
            <Head title="Register" />

            <form onSubmit={submit} className="space-y-4">
                <Field label="Business name" htmlFor="business_name" error={errors.business_name} required>
                    <TextInput
                        id="business_name"
                        name="business_name"
                        value={data.business_name}
                        autoComplete="organization"
                        isFocused={true}
                        onChange={(e) => setData('business_name', e.target.value)}
                        required
                    />
                </Field>

                <Field label="Your name" htmlFor="name" error={errors.name} required>
                    <TextInput
                        id="name"
                        name="name"
                        value={data.name}
                        autoComplete="name"
                        onChange={(e) => setData('name', e.target.value)}
                        required
                    />
                </Field>

                <Field label="Email" htmlFor="email" error={errors.email} required>
                    <TextInput
                        id="email"
                        type="email"
                        name="email"
                        value={data.email}
                        autoComplete="username"
                        onChange={(e) => setData('email', e.target.value)}
                        required
                    />
                </Field>

                <Field label="Password" htmlFor="password" error={errors.password} required>
                    <TextInput
                        id="password"
                        type="password"
                        name="password"
                        value={data.password}
                        autoComplete="new-password"
                        onChange={(e) => setData('password', e.target.value)}
                        required
                    />
                </Field>

                <Field label="Confirm password" htmlFor="password_confirmation" error={errors.password_confirmation} required>
                    <TextInput
                        id="password_confirmation"
                        type="password"
                        name="password_confirmation"
                        value={data.password_confirmation}
                        autoComplete="new-password"
                        onChange={(e) => setData('password_confirmation', e.target.value)}
                        required
                    />
                </Field>

                <PrimaryButton className="w-full" disabled={processing}>
                    Create account
                </PrimaryButton>

                {/* Plain links (full page load): the legal pages use the landing page's own fonts and colors. */}
                <p className="text-center text-xs text-gray-500">
                    By creating an account you agree to the{' '}
                    <a href={route('terms')} className="rounded font-semibold text-gray-700 underline hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
                        Terms
                    </a>{' '}
                    and{' '}
                    <a href={route('privacy')} className="rounded font-semibold text-gray-700 underline hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
                        Privacy Policy
                    </a>
                    .
                </p>
            </form>
        </GuestLayout>
    );
}
