import PrimaryButton from '@/Components/PrimaryButton';
import { Alert } from '@/Components/ui';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import { FormEventHandler } from 'react';

export default function VerifyEmail({ status }: { status?: string }) {
    const { post, processing } = useForm({});

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        post(route('verification.send'));
    };

    return (
        <GuestLayout
            title="Verify your email"
            description="Thanks for signing up! Before getting started, click the link we just emailed to you. If you didn't receive the email, we will gladly send you another."
        >
            <Head title="Email Verification" />

            {status === 'verification-link-sent' && (
                <Alert tone="green" className="mb-4">
                    A new verification link has been sent to the email address you provided during registration.
                </Alert>
            )}

            <form onSubmit={submit} className="space-y-3">
                <PrimaryButton className="w-full" disabled={processing}>
                    Resend verification email
                </PrimaryButton>

                <Link href={route('logout')} method="post" as="button" className="btn btn-ghost w-full">
                    Log out
                </Link>
            </form>
        </GuestLayout>
    );
}
