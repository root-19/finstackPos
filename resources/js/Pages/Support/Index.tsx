import PageHeader from '@/Components/PageHeader';
import SupportThread, { SupportMessage, UploadRules } from '@/Components/SupportThread';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head } from '@inertiajs/react';

export default function Support({ messages, upload }: PageProps<{ messages: SupportMessage[]; upload: UploadRules }>) {
    return (
        <AuthenticatedLayout
            fullHeight
            header={<PageHeader title="Support" subtitle="Chat with the FinstackPOS team. Everyone in your store sees this conversation." />}
        >
            <Head title="Support" />

            <div className="flex h-full min-h-0 flex-col bg-surface">
                <SupportThread
                    messages={messages}
                    postTo={route('support.store')}
                    mine="store"
                    upload={upload}
                    placeholder="Tell us what you need help with…"
                    emptyTitle="How can we help?"
                    emptyText="Ask about anything: your plan, the register, printing, payments. Attach a screenshot or file if it helps. We reply here, and the Support item in the menu shows when there is an answer."
                />
            </div>
        </AuthenticatedLayout>
    );
}
