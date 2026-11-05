import { Icon } from '@/Components/NavIcons';
import PrimaryButton from '@/Components/PrimaryButton';
import { EmptyState } from '@/Components/ui';
import { formatDateTime } from '@/lib/format';
import { router, useForm } from '@inertiajs/react';
import { ChangeEventHandler, FormEventHandler, KeyboardEventHandler, useEffect, useRef } from 'react';

export interface SupportAttachment {
    name: string;
    size: number | null;
    is_image: boolean;
    url: string;
}

export interface SupportMessage {
    id: number;
    from_admin: boolean;
    sender: string;
    body: string;
    attachment: SupportAttachment | null;
    created_at: string;
    read: boolean;
}

/** What the server accepts: largest file in KB and allowed extensions. */
export interface UploadRules {
    max_kb: number;
    types: string[];
}

const POLL_MS = 8000;
export const MAX_LENGTH = 2000;

function fileSize(bytes: number | null): string {
    if (bytes === null) {
        return '';
    }
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The chat between a store and FinstackPOS support, from either side.
 * A message is text, a picture or file, or both. New messages arrive by
 * reloading just the `messages` prop every few seconds while the page is open.
 */
export default function SupportThread({
    messages,
    postTo,
    mine,
    upload,
    placeholder,
    emptyTitle,
    emptyText,
}: {
    messages: SupportMessage[];
    /** Where a new message is posted. */
    postTo: string;
    /** Which side of the conversation the reader is on. */
    mine: 'store' | 'admin';
    upload: UploadRules;
    placeholder: string;
    emptyTitle: string;
    emptyText: string;
}) {
    const form = useForm<{ body: string; attachment: File | null }>({ body: '', attachment: null });
    const bottom = useRef<HTMLDivElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const lastId = messages.length ? messages[messages.length - 1].id : 0;
    const accept = upload.types.map((t) => `.${t}`).join(',');

    useEffect(() => {
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                router.reload({ only: ['messages', 'auth'] });
            }
        }, POLL_MS);

        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        bottom.current?.scrollIntoView({ block: 'end' });
    }, [lastId]);

    const clearFile = () => {
        form.setData('attachment', null);
        if (fileInput.current) {
            fileInput.current.value = '';
        }
    };

    const pickFile: ChangeEventHandler<HTMLInputElement> = (e) => {
        const file = e.target.files?.[0] ?? null;
        if (file && file.size > upload.max_kb * 1024) {
            form.setError('attachment', `That file is too large. The limit is ${Math.round(upload.max_kb / 1024)} MB.`);
            clearFile();

            return;
        }
        form.clearErrors('attachment');
        form.setData('attachment', file);
    };

    const canSend = (form.data.body.trim() !== '' || form.data.attachment !== null) && !form.processing;

    const send: FormEventHandler = (e) => {
        e.preventDefault();
        if (!canSend) {
            return;
        }
        form.post(postTo, {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => {
                form.reset();
                clearFile();
            },
        });
    };

    const onKey: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
        }
    };

    const isMine = (m: SupportMessage) => (mine === 'admin') === m.from_admin;
    const pending = form.data.attachment;
    const error = form.errors.body ?? form.errors.attachment;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
                {messages.length === 0 ? (
                    <EmptyState title={emptyTitle} icon={<Icon name="chat" className="h-6 w-6" />}>
                        {emptyText}
                    </EmptyState>
                ) : (
                    messages.map((m) => (
                        <div key={m.id} className={`flex ${isMine(m) ? 'justify-end' : 'justify-start'}`}>
                            <div
                                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%] ${
                                    isMine(m) ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-white text-gray-900 ring-1 ring-gray-200'
                                }`}
                            >
                                <p className={`text-xs font-semibold ${isMine(m) ? 'text-white/80' : 'text-gray-500'}`}>{m.sender}</p>
                                {m.attachment && (
                                    <Attachment attachment={m.attachment} light={isMine(m)} />
                                )}
                                {m.body && <p className="mt-0.5 whitespace-pre-wrap break-words">{m.body}</p>}
                                <p className={`mt-1 text-[11px] ${isMine(m) ? 'text-white/70' : 'text-gray-400'}`}>
                                    {formatDateTime(m.created_at)}
                                    {isMine(m) && m.read && ' · Seen'}
                                </p>
                            </div>
                        </div>
                    ))
                )}
                <div ref={bottom} />
            </div>

            <form onSubmit={send} className="shrink-0 border-t border-gray-200 bg-white p-3 sm:p-4">
                {pending && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                        {pending.type.startsWith('image/') ? (
                            <img src={URL.createObjectURL(pending)} alt="" className="h-10 w-10 rounded object-cover" />
                        ) : (
                            <Icon name="download" className="h-5 w-5 text-gray-400" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{pending.name}</span>
                        <span className="text-xs text-gray-500">{fileSize(pending.size)}</span>
                        <button type="button" onClick={clearFile} className="btn btn-ghost btn-icon btn-sm" aria-label="Remove file">
                            <Icon name="x" />
                        </button>
                    </div>
                )}
                <div className="flex items-end gap-2">
                    <input ref={fileInput} type="file" accept={accept} onChange={pickFile} className="sr-only" id="support-file" />
                    <label htmlFor="support-file" className="btn btn-secondary btn-icon shrink-0 cursor-pointer" title="Attach a picture or file">
                        <Icon name="paperclip" />
                        <span className="sr-only">Attach a picture or file</span>
                    </label>
                    <textarea
                        value={form.data.body}
                        onChange={(e) => form.setData('body', e.target.value)}
                        onKeyDown={onKey}
                        maxLength={MAX_LENGTH}
                        rows={2}
                        placeholder={placeholder}
                        aria-label="Message"
                        className="min-h-[2.75rem] flex-1 resize-none rounded-lg border-gray-300 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
                    />
                    <PrimaryButton type="submit" disabled={!canSend}>
                        {form.processing ? 'Sending…' : 'Send'}
                    </PrimaryButton>
                </div>
                <div className="mt-1 flex justify-between gap-3 text-xs">
                    <span className={error ? 'text-red-600' : 'text-gray-500'}>
                        {error ?? `Enter to send, Shift+Enter for a new line. Pictures and files up to ${Math.round(upload.max_kb / 1024)} MB.`}
                    </span>
                    <span className="shrink-0 text-gray-500">
                        {form.data.body.length} / {MAX_LENGTH}
                    </span>
                </div>
            </form>
        </div>
    );
}

function Attachment({ attachment, light }: { attachment: SupportAttachment; light: boolean }) {
    if (attachment.is_image) {
        return (
            <a href={attachment.url} target="_blank" rel="noopener" className="mt-1 block">
                <img src={attachment.url} alt={attachment.name} className="max-h-72 max-w-full rounded-lg bg-black/5 object-contain" loading="lazy" />
            </a>
        );
    }

    return (
        <a
            href={attachment.url}
            className={`mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm underline-offset-2 hover:underline ${
                light ? 'bg-white/15 text-white' : 'bg-surface text-gray-900'
            }`}
        >
            <Icon name="download" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
            <span className={`shrink-0 text-xs ${light ? 'text-white/70' : 'text-gray-500'}`}>{fileSize(attachment.size)}</span>
        </a>
    );
}
