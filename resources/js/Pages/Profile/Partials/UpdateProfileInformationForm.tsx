import TextInput from '@/Components/TextInput';
import { Alert, Card, CardHeader, Field } from '@/Components/ui';
import { Link, useForm, usePage } from '@inertiajs/react';
import { FormEventHandler } from 'react';
import FormFooter from './FormFooter';

export default function UpdateProfileInformation({
    mustVerifyEmail,
    status,
    className = '',
}: {
    mustVerifyEmail: boolean;
    status?: string;
    className?: string;
}) {
    const user = usePage().props.auth.user;

    const { data, setData, patch, errors, processing, recentlySuccessful } = useForm({
        name: user.name,
        email: user.email,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();

        patch(route('profile.update'));
    };

    return (
        <Card className={className}>
            <CardHeader title="Profile information" subtitle="Your name and the email address you sign in with." />

            <form onSubmit={submit}>
                <div className="card-body max-w-xl space-y-4">
                    <Field label="Name" htmlFor="name" error={errors.name} required>
                        <TextInput
                            id="name"
                            value={data.name}
                            onChange={(e) => setData('name', e.target.value)}
                            required
                            isFocused
                            autoComplete="name"
                        />
                    </Field>

                    <Field label="Email" htmlFor="email" error={errors.email} required>
                        <TextInput
                            id="email"
                            type="email"
                            value={data.email}
                            onChange={(e) => setData('email', e.target.value)}
                            required
                            autoComplete="username"
                        />
                    </Field>

                    {mustVerifyEmail && user.email_verified_at === null && (
                        <Alert tone="amber" title="Your email address is unverified.">
                            <Link
                                href={route('verification.send')}
                                method="post"
                                as="button"
                                className="rounded font-medium underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                            >
                                Re-send the verification email
                            </Link>
                        </Alert>
                    )}

                    {status === 'verification-link-sent' && mustVerifyEmail && user.email_verified_at === null && (
                        <Alert tone="green">A new verification link has been sent to your email address.</Alert>
                    )}
                </div>

                <FormFooter processing={processing} saved={recentlySuccessful} />
            </form>
        </Card>
    );
}
