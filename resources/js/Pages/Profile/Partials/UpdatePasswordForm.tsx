import TextInput from '@/Components/TextInput';
import { Card, CardHeader, Field } from '@/Components/ui';
import { useForm } from '@inertiajs/react';
import { FormEventHandler, useRef } from 'react';
import FormFooter from './FormFooter';

export default function UpdatePasswordForm({ className = '' }: { className?: string }) {
    const passwordInput = useRef<HTMLInputElement>(null);
    const currentPasswordInput = useRef<HTMLInputElement>(null);

    const { data, setData, errors, put, reset, processing, recentlySuccessful } = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    });

    const updatePassword: FormEventHandler = (e) => {
        e.preventDefault();

        put(route('password.update'), {
            preserveScroll: true,
            onSuccess: () => reset(),
            onError: (errors) => {
                if (errors.password) {
                    reset('password', 'password_confirmation');
                    passwordInput.current?.focus();
                }

                if (errors.current_password) {
                    reset('current_password');
                    currentPasswordInput.current?.focus();
                }
            },
        });
    };

    return (
        <Card className={className}>
            <CardHeader title="Password" subtitle="Use a long, random password to keep your account secure." />

            <form onSubmit={updatePassword}>
                <div className="card-body max-w-xl space-y-4">
                    <Field label="Current password" htmlFor="current_password" error={errors.current_password}>
                        <TextInput
                            id="current_password"
                            ref={currentPasswordInput}
                            value={data.current_password}
                            onChange={(e) => setData('current_password', e.target.value)}
                            type="password"
                            autoComplete="current-password"
                        />
                    </Field>

                    <Field label="New password" htmlFor="password" error={errors.password}>
                        <TextInput
                            id="password"
                            ref={passwordInput}
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            type="password"
                            autoComplete="new-password"
                        />
                    </Field>

                    <Field label="Confirm new password" htmlFor="password_confirmation" error={errors.password_confirmation}>
                        <TextInput
                            id="password_confirmation"
                            value={data.password_confirmation}
                            onChange={(e) => setData('password_confirmation', e.target.value)}
                            type="password"
                            autoComplete="new-password"
                        />
                    </Field>
                </div>

                <FormFooter processing={processing} saved={recentlySuccessful} />
            </form>
        </Card>
    );
}
