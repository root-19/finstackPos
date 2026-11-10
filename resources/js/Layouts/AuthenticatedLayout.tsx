import FlashMessage from '@/Components/FlashMessage';
import { PageSkeleton } from '@/Components/Skeleton';
import useNavigationLoading from '@/hooks/useNavigationLoading';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import { newOrders, useTableOrders } from '@/lib/tableOrders';
import useSidebarCollapsed from '@/hooks/useSidebarCollapsed';
import { Icon, ICONS, NavIcon } from '@/Components/NavIcons';
import { PRO_MODULES } from '@/lib/proModules';
import { clearOfflinePageCache } from '@/lib/pwa';
import { Dialog, DialogPanel, Popover, PopoverButton, PopoverPanel, Transition, TransitionChild } from '@headlessui/react';
import { PageProps } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { PropsWithChildren, ReactNode, useState } from 'react';

interface NavItem {
    label: string;
    icon: ReactNode;
    href: string;
    active?: boolean;
    /** Plain anchor instead of an Inertia visit (needed for the offline POS). */
    fullReload?: boolean;
    /** Needs FinstackPOS Pro: shown with a lock, opens the subscription page. */
    locked?: boolean;
    /** Something waiting there (e.g. new table orders). */
    badge?: number;
}

export default function Authenticated({
    header,
    fullHeight = false,
    children,
}: PropsWithChildren<{
    header?: ReactNode;
    /** Content fills the viewport below the top bar (used by the POS). */
    fullHeight?: boolean;
}>) {
    const { user, merchant, can, roleName, hasEmployeeProfile, subscription, supportUnread } = usePage().props.auth;
    const pro = Boolean(subscription?.active);
    const canSell = Boolean(merchant && can?.['pos.sell']);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [collapsed, toggleCollapsed] = useSidebarCollapsed();
    const navigating = useNavigationLoading();
    const onPos = route().current('pos.index');
    const online = useOnlineStatus();
    // Any open page receives table orders (the POS and Table Orders poll their own).
    const watchOrders = canSell && Boolean(merchant?.table_ordering) && !onPos && !route().current('orders.*');
    const tableOrders = useTableOrders(watchOrders, online, user.branch_id ?? 'all');
    const waitingOrders = watchOrders ? newOrders(tableOrders.feed).length : 0;

    const mainNav: NavItem[] = [
        {
            label: 'Dashboard',
            icon: ICONS.dashboard,
            href: route('dashboard'),
            active: route().current('dashboard'),
        },
    ];

    if (merchant) {
        if (canSell) {
            mainNav.push({
                label: 'Point of Sale',
                icon: ICONS.pos,
                href: route('pos.index'),
                active: onPos,
                fullReload: true,
            });
        }

        if (canSell && merchant.table_ordering) {
            mainNav.push({
                label: 'Table Orders',
                icon: ICONS.tableOrders,
                href: route('orders.index'),
                active: route().current('orders.*'),
                badge: waitingOrders,
            });
        }

        if (can?.['products.manage']) {
            mainNav.push({
                label: 'Products',
                icon: ICONS.products,
                href: route('products.index'),
                active: route().current('products.*'),
            });
        }

        if (can?.['categories.manage']) {
            mainNav.push({
                label: 'Categories',
                icon: ICONS.categories,
                href: route('categories.index'),
                active: route().current('categories.*'),
            });
        }

        if (can?.['sales.view']) {
            mainNav.push({
                label: 'Sales',
                icon: ICONS.sales,
                href: route('sales.index'),
                active: route().current('sales.*'),
            });
        }

        if (can?.['inventory.manage']) {
            mainNav.push({
                label: 'Inventory',
                icon: ICONS.inventory,
                href: route('inventory.index'),
                active: route().current('inventory.*') || route().current('suppliers.*'),
            });
        }

        if (can?.['sales.view'] || can?.['inventory.manage'] || can?.['payroll.manage'] || can?.['schedules.manage'] || can?.['attendance.manage']) {
            mainNav.push({
                label: 'Reports',
                icon: ICONS.reports,
                href: route('reports.index'),
                active: route().current('reports.*'),
            });
        }
    }

    // One list drives this section and the Pro card on the Subscription page.
    const managementNav: NavItem[] = merchant
        ? PRO_MODULES.filter((m) => can?.[m.permission]).map((m) => ({
              label: m.label,
              icon: ICONS[m.icon],
              href: route(m.route),
              active: route().current(m.match),
          }))
        : [];

    // Free plan: Management shows, locked, and leads to the upgrade page.
    const managementItems: NavItem[] = pro
        ? managementNav
        : managementNav.map((item) => ({ ...item, href: route('subscription.index'), active: false, locked: true }));

    const accountNav: NavItem[] = [];

    // My Work is for employees: the owner manages the team instead.
    if (merchant && pro && hasEmployeeProfile && user.role !== 'owner') {
        accountNav.push({
            label: 'My Work',
            icon: ICONS.myWork,
            href: route('my-work'),
            active: route().current('my-work'),
        });
    }

    if (merchant && can?.['settings.manage']) {
        accountNav.push({
            label: 'Tables & QR',
            icon: ICONS.qrCode,
            href: route('tables.index'),
            active: route().current('tables.*'),
        });
    }

    if (merchant && can?.['settings.manage']) {
        accountNav.push({
            label: 'Settings',
            icon: ICONS.settings,
            href: route('settings.edit'),
            active: route().current('settings.*'),
        });
    }

    if (merchant) {
        accountNav.push({
            label: 'Support',
            icon: ICONS.chat,
            href: route('support.index'),
            active: route().current('support.*'),
            badge: supportUnread,
        });
    }

    if (merchant && user.role === 'owner') {
        accountNav.push({
            label: 'Subscription',
            icon: ICONS.star,
            href: route('subscription.index'),
            active: route().current('subscription.*'),
        });
    }

    accountNav.push({
        label: 'Profile',
        icon: ICONS.profile,
        href: route('profile.edit'),
        active: route().current('profile.edit'),
    });

    /** Icons-only (`compact`) on a collapsed desktop sidebar, full otherwise. */
    const renderSidebar = (compact: boolean) => (
        <div className="flex h-full flex-col border-r border-gray-200 bg-white">
            <div className={`flex h-14 shrink-0 items-center ${compact ? 'justify-center' : 'px-4'}`}>
                <Link href={route('dashboard')} className="flex items-center gap-2.5 rounded-lg" aria-label="FinstackPOS dashboard">
                    <img src="/brand/fb-profile-black.png" alt="" className="h-8 w-8 shrink-0 rounded-lg" />
                    {!compact && (
                        <span className="text-lg font-bold tracking-tight text-gray-950">
                            Finstack<span className="text-brand-600">POS</span>
                        </span>
                    )}
                </Link>
            </div>

            {merchant && <StoreCard compact={compact} merchant={merchant} roleName={roleName} canManage={Boolean(can?.['settings.manage'])} />}

            {/* Compact mode doesn't scroll, so hover labels can overflow the rail. */}
            <nav
                aria-label="Main"
                className={`mt-4 flex flex-1 flex-col gap-5 pb-4 ${compact ? 'items-center overflow-visible px-2' : 'overflow-y-auto px-3'}`}
            >
                <NavSection title="Menu" items={mainNav} compact={compact} />
                {managementItems.length > 0 && (
                    <NavSection title={pro ? 'Management' : 'Management · Pro'} items={managementItems} compact={compact} />
                )}
                <NavSection title="Account" items={accountNav} compact={compact} />
            </nav>

            <div className={`border-t border-gray-200 ${compact ? 'flex flex-col items-center gap-2 py-3' : 'p-3'}`}>
                <div className={`flex items-center ${compact ? 'flex-col gap-2' : 'gap-3 rounded-lg px-1.5 py-1'}`}>
                    <span
                        title={compact ? `${user.name} · ${roleName ?? ''}` : undefined}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold uppercase text-white"
                    >
                        {initials(user.name)}
                    </span>
                    {!compact && (
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-950">{user.name}</p>
                            <p className="truncate text-xs text-gray-500">{user.email}</p>
                        </div>
                    )}
                    <Link
                        href={route('logout')}
                        method="post"
                        as="button"
                        onClick={clearOfflinePageCache}
                        aria-label="Log out"
                        className="group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                    >
                        <NavIcon>{ICONS.logout}</NavIcon>
                        <HoverLabel>Log out</HoverLabel>
                    </Link>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-surface">
            {/* Mobile drawer */}
            <Transition show={mobileOpen}>
                <Dialog onClose={setMobileOpen} className="relative z-50 lg:hidden">
                    <TransitionChild
                        enter="transition-opacity ease-linear duration-200"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="transition-opacity ease-linear duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-gray-950/40" />
                    </TransitionChild>

                    <div className="fixed inset-0 flex">
                        <TransitionChild
                            enter="transition ease-out duration-200 transform"
                            enterFrom="-translate-x-full"
                            enterTo="translate-x-0"
                            leave="transition ease-in duration-150 transform"
                            leaveFrom="translate-x-0"
                            leaveTo="-translate-x-full"
                        >
                            <DialogPanel className="relative flex h-full w-72 max-w-[85vw]">
                                <button
                                    type="button"
                                    onClick={() => setMobileOpen(false)}
                                    className="absolute -right-11 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
                                    aria-label="Close menu"
                                >
                                    <Icon name="x" className="h-5 w-5" />
                                </button>
                                <div className="w-full">{renderSidebar(false)}</div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </Dialog>
            </Transition>

            {/* Desktop sidebar: full or icons only */}
            <aside
                className={`fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block ${
                    collapsed ? 'w-[68px]' : 'w-72'
                }`}
            >
                {renderSidebar(collapsed)}
            </aside>

            <div
                className={`transition-[padding] duration-200 ease-out motion-reduce:transition-none ${collapsed ? 'lg:pl-[68px]' : 'lg:pl-72'} ${
                    fullHeight ? 'flex h-[100dvh] flex-col' : ''
                }`}
            >
                <header className="sticky top-0 z-30 shrink-0 border-b border-gray-200 bg-white/90 backdrop-blur">
                    <div className="flex h-14 items-center gap-2 px-3 sm:px-5 lg:px-6">
                        <button type="button" onClick={() => setMobileOpen(true)} className="btn btn-ghost btn-icon lg:hidden" aria-label="Open menu">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                        </button>

                        <button
                            type="button"
                            onClick={toggleCollapsed}
                            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            aria-expanded={!collapsed}
                            title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`}
                            className="btn btn-ghost btn-icon hidden text-gray-500 lg:inline-flex"
                        >
                            <NavIcon>{collapsed ? ICONS.panelOpen : ICONS.panelClose}</NavIcon>
                        </button>

                        <div className="hidden h-5 w-px bg-gray-200 lg:block" aria-hidden />

                        <div className="min-w-0 flex-1 pl-1">{header}</div>

                        {canSell && !onPos && (
                            // Full page load so the POS is cached for offline use.
                            <a href={route('pos.index')} className="btn btn-primary btn-sm hidden sm:inline-flex">
                                <Icon name="pos" />
                                Open POS
                            </a>
                        )}
                    </div>
                </header>

                <main className={fullHeight ? 'min-h-0 flex-1' : ''}>{navigating ? <PageSkeleton /> : children}</main>
            </div>

            <FlashMessage />

            {waitingOrders > 0 && (
                <Link
                    href={route('orders.index')}
                    className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white shadow-pop transition hover:bg-gray-800"
                >
                    <span className="flex h-8 w-8 animate-pulse items-center justify-center rounded-full bg-brand-600">
                        <Icon name="bell" />
                    </span>
                    {waitingOrders} new from the tables
                    <Icon name="chevronRight" />
                </Link>
            )}
        </div>
    );
}

/** The current store: name and the user's role, with its details on click. */
function StoreCard({
    compact,
    merchant,
    roleName,
    canManage,
}: {
    compact: boolean;
    merchant: NonNullable<PageProps['auth']['merchant']>;
    roleName: string | null;
    canManage: boolean;
}) {
    return (
        <Popover className={`relative ${compact ? 'mx-auto' : 'mx-3'}`}>
            <PopoverButton
                title={compact ? merchant.name : undefined}
                className={`flex w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-white text-left transition hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                    compact ? 'h-10 w-10 justify-center p-0' : 'px-2.5 py-2'
                }`}
            >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-600 text-xs font-bold uppercase text-white">
                    {initials(merchant.name)}
                </span>
                {!compact && (
                    <>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-gray-950">{merchant.name}</span>
                            <span className="block truncate text-xs text-gray-500">{roleName}</span>
                        </span>
                        <Icon name="chevronUpDown" className="h-4 w-4 text-gray-400" />
                    </>
                )}
            </PopoverButton>
            <PopoverPanel
                anchor={compact ? 'right start' : 'bottom start'}
                className="z-50 w-64 rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-pop [--anchor-gap:6px]"
            >
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Current store</p>
                <p className="mt-1 font-semibold text-gray-950">{merchant.name}</p>
                {merchant.address && <p className="text-xs text-gray-500">{merchant.address}</p>}
                <dl className="mt-2 space-y-1 text-xs text-gray-600">
                    {merchant.tin && (
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-400">TIN</dt>
                            <dd>{merchant.tin}</dd>
                        </div>
                    )}
                    {merchant.contact_number && (
                        <div className="flex justify-between gap-2">
                            <dt className="text-gray-400">Contact</dt>
                            <dd>{merchant.contact_number}</dd>
                        </div>
                    )}
                    <div className="flex justify-between gap-2">
                        <dt className="text-gray-400">Your access</dt>
                        <dd>{roleName}</dd>
                    </div>
                </dl>
                {canManage && (
                    <Link href={route('settings.edit')} className="btn btn-secondary btn-sm mt-3 w-full">
                        <Icon name="settings" />
                        Store settings
                    </Link>
                )}
            </PopoverPanel>
        </Popover>
    );
}

function NavSection({ title, items, compact }: { title: string; items: NavItem[]; compact: boolean }) {
    return (
        <div className={compact ? 'w-full' : ''}>
            {compact ? (
                <div className="mx-auto mb-2 h-px w-6 bg-gray-200" aria-hidden />
            ) : (
                <p className="px-2.5 text-xs font-bold uppercase tracking-wider text-gray-500">{title}</p>
            )}
            <ul className={`space-y-0.5 ${compact ? 'flex flex-col items-center' : 'mt-1.5'}`}>
                {items.map((item) => (
                    <li key={item.label}>
                        <NavEntry item={item} compact={compact} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function NavEntry({ item, compact }: { item: NavItem; compact: boolean }) {
    // Bold, dark labels so the sidebar reads at a glance (active item boldest).
    const className = `group relative flex items-center rounded-lg text-base transition-colors ${
        compact ? 'h-10 w-10 justify-center' : 'w-full gap-3 px-2.5 py-2.5'
    } ${item.active ? 'bg-brand-50 font-bold text-brand-700' : 'font-semibold text-gray-800 hover:bg-gray-100 hover:text-gray-950'}`;

    const content = (
        <>
            {item.active && !compact && <span className="absolute -left-3 top-2 h-6 w-1 rounded-r bg-brand-600" aria-hidden />}
            <span className={item.active ? 'text-brand-600' : 'text-gray-500 group-hover:text-gray-800'}>
                <NavIcon>{item.locked ? ICONS.lock : item.icon}</NavIcon>
            </span>
            {compact ? (
                <HoverLabel>{item.locked ? `${item.label} (Pro)` : item.label}</HoverLabel>
            ) : (
                <span className={`truncate ${item.locked ? 'text-gray-500' : ''}`}>{item.label}</span>
            )}
            {Boolean(item.badge) && (
                <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white ${
                        compact ? 'absolute -right-1 -top-1' : 'ms-auto'
                    }`}
                >
                    {item.badge}
                </span>
            )}

        </>
    );
    const shared = { className, 'aria-label': compact ? item.label : undefined, 'aria-current': item.active ? ('page' as const) : undefined };

    return item.fullReload ? (
        <a href={item.href} {...shared}>
            {content}
        </a>
    ) : (
        <Link href={item.href} {...shared}>
            {content}
        </Link>
    );
}

/** Label that slides out beside an icon-only item on hover or focus. */
function HoverLabel({ children }: { children: string }) {
    return (
        <span
            aria-hidden
            className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-950 px-2.5 py-1 text-sm font-medium text-white opacity-0 shadow-lg transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
        >
            {children}
        </span>
    );
}

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('');
}
