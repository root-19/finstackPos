import DangerButton from '@/Components/DangerButton';
import Modal from '@/Components/Modal';
import { Icon } from '@/Components/NavIcons';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import { Card, CardHeader, DialogLayout, Field } from '@/Components/ui';
import { useForm } from '@inertiajs/react';
import { FormEventHandler, useRef, useState } from 'react';

export default function DeleteUserForm({ className = '' }: { className?: string }) {
    const [confirmingUserDeletion, setConfirmingUserDeletion] = useState(false);
    const passwordInput = useRef<HTMLInputElement>(null);

    const {
        data,
        setData,
        delete: destroy,
        processing,
        reset,
        errors,
        clearErrors,
    } = useForm({
        password: '',
    });

    const confirmUserDeletion = () => {
        setConfirmingUserDeletion(true);
    };

    const deleteUser: FormEventHandler = (e) => {
        e.preventDefault();

        destroy(route('profile.destroy'), {
            preserveScroll: true,
            onSuccess: () => closeModal(),
            onError: () => passwordInput.current?.focus(),
            onFinish: () => reset(),
        });
    };

    const closeModal = () => {
        setConfirmingUserDeletion(false);

        clearErrors();
        reset();
    };

    return (
        <Card className={`border-red-200 ${className}`}>
            <CardHeader title="Delete account" subtitle="Danger zone" />

            <div className="card-body flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm text-gray-600">
                    Once your account is deleted, all of its resources and data will be permanently deleted. Before deleting your account, download
                    any data or information that you wish to keep.
                </p>
                <button type="button" onClick={confirmUserDeletion} className="btn btn-danger shrink-0">
                    <Icon name="trash" />
                    Delete account
                </button>
            </div>

            <Modal show={confirmingUserDeletion} onClose={closeModal} maxWidth="md">
                <form onSubmit={deleteUser}>
                    <DialogLayout
                        title="Delete your account?"
                        description="All of its resources and data will be permanently deleted. This cannot be undone."
                        footer={
                            <>
                                <SecondaryButton onClick={closeModal}>Cancel</SecondaryButton>
                                <DangerButton disabled={processing}>Delete account</DangerButton>
                            </>
                        }
                    >
                        <Field label="Enter your password to confirm" htmlFor="delete_password" error={errors.password}>
                            <TextInput
                                id="delete_password"
                                type="password"
                                name="password"
                                ref={passwordInput}
                                value={data.password}
                                onChange={(e) => setData('password', e.target.value)}
                                isFocused
                                placeholder="Password"
                                autoComplete="current-password"
                            />
                        </Field>
                    </DialogLayout>
                </form>
            </Modal>
        </Card>
    );
}
