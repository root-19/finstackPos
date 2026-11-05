import { clearOfflinePageCache } from '@/lib/pwa';
import FlashMessage from '@/Components/FlashMessage';
import { Icon, ICONS, NavIcon } from '@/Components/NavIcons';
import { PageSkeleton } from '@/Components/Skeleton';
import useNavigationLoading from '@/hooks/useNavigationLoading';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { Link, usePage } from '@inertiajs/react';
import { PropsWithChildren, ReactNode, useState } from 'react';

/**
 * Shell of the FinstackPOS admin area (all stores, plans, pricing). Separate
 * from the store app: administrators don't belong to any store.
 */
export default function AdminLayout({ header, children }: PropsWithChildren<{ header?: ReactNode }>) {
    const { user, supportUnread } = usePage().props.auth;
    const [open, setOpen] = useState(false);
    const navigating = useNavigationLoading();

    const nav = [
        { label: 'Dashboard', icon: ICONS.dashboard, href: route('admin.dashboard'), active: route().current('admin.dashboard') },
        { label: 'Stores', icon: ICONS.store, href: route('admin.stores.index'), active: route().current('admin.stores.*') },
        { label: 'Subscriptions', icon: ICONS.cash, href: route('admin.subscriptions'), active: route().current('admin.subscriptions') },
        { label: 'Support', icon: ICONS.chat, href: route('admin.support.index'), active: route().current('admin.support.*'), badge: supportUnread },
        { label: 'Pricing', icon: ICONS.tag, href: route('admin.pricing'), active: route().current('admin.pricing') },
    ];

    const sidebar = (
        <div className="flex h-full flex-col bg-gray-950 text-white">
            <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
                <img src="/brand/fb-profile-black.png" alt="" className="h-8 w-8 rounded-lg ring-1 ring-white/15" />
                <span className="text-lg font-bold tracking-tight">
                    Finstack<span className="text-brand-500">POS</span>
                </span>
                <span className="ms-auto rounded-md bg-white/10 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white/80">
                    Admin
                </span>
            </div>
            <nav aria-label="Admin" className="mt-4 flex-1 space-y-0.5 px-3">
                {nav.map((item) => (
                    <Link
                        key={item.label}
                        href={item.href}
                        aria-current={item.active ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-base font-medium transition-colors ${
                            item.active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`}
                    >
                        <NavIcon>{item.icon}</NavIcon>
                        {item.label}
                        {Boolean(item.badge) && (
                            <span className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">
                                {item.badge}
                            </span>
                        )}
                    </Link>
                ))}
            </nav>
            <div className="flex items-center gap-3 border-t border-white/10 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold uppercase">
                    {user.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join('')}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-white/50">{user.email}</p>
                </div>
                <Link
                    href={route('logout')}
                    method="post"
                    as="button"
                    onClick={clearOfflinePageCache}
                    aria-label="Log out"
                    title="Log out"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
                >
                    <NavIcon>{ICONS.logout}</NavIcon>
                </Link>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-surface">
            <Transition show={open}>
                <Dialog onClose={setOpen} className="relative z-50 lg:hidden">
                    <TransitionChild
                        enter="transition-opacity duration-200"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="transition-opacity duration-150"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-gray-950/40" />
                    </TransitionChild>
                    <div className="fixed inset-0 flex">
                        <TransitionChild
                            enter="transition duration-200 transform"
                            enterFrom="-translate-x-full"
                            enterTo="translate-x-0"
                            leave="transition duration-150 transform"
                            leaveFrom="translate-x-0"
                            leaveTo="-translate-x-full"
                        >
                            <DialogPanel className="relative flex h-full w-64 max-w-[85vw]">
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="absolute -right-11 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white"
                                    aria-label="Close menu"
                                >
                                    <Icon name="x" className="h-5 w-5" />
                                </button>
                                <div className="w-full">{sidebar}</div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </Dialog>
            </Transition>

            <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>

            <div className="lg:pl-64">
                <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
                    <div className="flex h-14 items-center gap-2 px-3 sm:px-5 lg:px-6">
                        <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-icon lg:hidden" aria-label="Open menu">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                        </button>
                        <div className="min-w-0 flex-1">{header}</div>
                    </div>
                </header>
                <main>{navigating ? <PageSkeleton /> : children}</main>
            </div>

            <FlashMessage />
        </div>
    );
}
