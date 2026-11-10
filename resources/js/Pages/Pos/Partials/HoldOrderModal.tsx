import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import { DialogLayout, Field } from '@/Components/ui';
import { HELD_LABEL_MAX, normalizeLabel } from '@/lib/heldOrders';
import { FormEvent, useEffect, useState } from 'react';

/** Name a cart before putting it on hold (customer name or table), or rename a held one. */
export default function HoldOrderModal({
    show,
    title = 'Hold this order',
    initialLabel = '',
    confirmLabel = 'Hold order',
    summary,
    onClose,
    onConfirm,
}: {
    show: boolean;
    title?: string;
    initialLabel?: string;
    confirmLabel?: string;
    /** e.g. "3 item(s) · ₱450.00" */
    summary?: string;
    onClose: () => void;
    onConfirm: (label: string) => void | Promise<void>;
}) {
    const [label, setLabel] = useState(initialLabel);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (show) {
            setLabel(initialLabel);
            setError(null);
            setSaving(false);
        }
    }, [show, initialLabel]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const clean = normalizeLabel(label);
        if (clean === '') {
            setError('Enter a customer name or table so you can find this order again.');

            return;
        }
        setSaving(true);
        try {
            await onConfirm(clean);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal show={show} onClose={onClose} maxWidth="md">
            <form onSubmit={submit}>
                <DialogLayout
                    title={title}
                    description={summary ?? 'It is saved on this register, even offline. Resume it from Held orders.'}
                    footer={
                        <>
                            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                            <PrimaryButton type="submit" disabled={saving}>
                                {confirmLabel}
                            </PrimaryButton>
                        </>
                    }
                >
                    <Field label="Customer or table" htmlFor="held-label" required error={error ?? undefined} hint="e.g. Maria, Table 4, Grab #1234">
                        <TextInput
                            id="held-label"
                            value={label}
                            maxLength={HELD_LABEL_MAX}
                            onChange={(e) => {
                                setLabel(e.target.value);
                                setError(null);
                            }}
                            isFocused
                            autoComplete="off"
                            className="w-full"
                        />
                    </Field>
                </DialogLayout>
            </form>
        </Modal>
    );
}
