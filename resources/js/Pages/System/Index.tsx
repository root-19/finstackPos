import PageHeader from '@/Components/PageHeader';
import { Alert, Badge, Card, CardHeader } from '@/Components/ui';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { db } from '@/lib/db';
import {
    checkDesktopUpdate,
    DesktopSystemInfo,
    DesktopUpdate,
    desktopSystemInfo,
    installDesktopUpdate,
    isDesktop,
    loadPrinterConfig,
} from '@/lib/desktop';
import { PageProps } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ReactNode, useEffect, useState } from 'react';

type Props = PageProps<{
    /** Short git commit the server runs (App\Support\WebVersion). */
    web_version: string | null;
    server_time: string;
    /** Newest Windows installer on the server (App\Support\DesktopRelease). */
    desktop_latest: { version: string; size_bytes: number } | null;
}>;

/**
 * System details: what this store runs and on what. Useful when talking to
 * support, and the place where desktop users update the app themselves.
 */
export default function SystemIndex({ web_version, server_time, desktop_latest }: Props) {
    const merchant = usePage<PageProps>().props.auth.merchant;
    const desktop = isDesktop();

    return (
        <AuthenticatedLayout header={<PageHeader title="System details" subtitle="Versions, this device and updates. Share this page with support if something goes wrong." />}>
            <Head title="System details" />

            <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
                {desktop ? <DesktopCard /> : <WindowsAppCard latest={desktop_latest} />}
                <WebCard webVersion={web_version} serverTime={server_time} storeName={merchant?.name ?? null} />
                <SyncCard merchantId={merchant?.id ?? null} />
                <DeviceCard desktop={desktop} />
            </div>
        </AuthenticatedLayout>
    );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <dl className="divide-y divide-gray-100 text-sm">
            {rows.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 py-2.5">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="min-w-0 break-words text-right font-medium text-gray-900">{value ?? '—'}</dd>
                </div>
            ))}
        </dl>
    );
}

/* ------------------------------------------------------------ Desktop app */

type UpdateState =
    | { phase: 'idle' }
    | { phase: 'checking' }
    | { phase: 'current' }
    | { phase: 'available'; update: DesktopUpdate }
    | { phase: 'installing'; update: DesktopUpdate }
    | { phase: 'error'; message: string };

function DesktopCard() {
    const [info, setInfo] = useState<DesktopSystemInfo | null>(null);
    const [tooOld, setTooOld] = useState(false);
    const [state, setState] = useState<UpdateState>({ phase: 'idle' });
    const printer = loadPrinterConfig().printer;

    const check = () => {
        setState({ phase: 'checking' });
        checkDesktopUpdate()
            .then((update) => setState(update ? { phase: 'available', update } : { phase: 'current' }))
            .catch((error) => setState({ phase: 'error', message: String(error) }));
    };

    useEffect(() => {
        desktopSystemInfo()
            .then((i) => {
                setInfo(i);
                check();
            })
            // Apps before 0.4.0 don't have these commands.
            .catch(() => setTooOld(true));
    }, []);

    const install = (update: DesktopUpdate) => {
        setState({ phase: 'installing', update });
        // On success the app closes and reopens, so this only settles on failure.
        installDesktopUpdate().catch((error) => setState({ phase: 'error', message: String(error) }));
    };

    if (tooOld) {
        return (
            <Card className="lg:col-span-2">
                <CardHeader title="Desktop app" />
                <div className="card-body">
                    <Alert tone="amber" title="This desktop app is too old to update itself">
                        Download and install the latest version once from{' '}
                        <a href="/download" className="font-semibold underline" target="_blank" rel="noreferrer">
                            finstackpos.shop/download
                        </a>
                        . After that, updates install from this page.
                    </Alert>
                </div>
            </Card>
        );
    }

    return (
        <Card className="lg:col-span-2">
            <CardHeader
                title="Desktop app"
                subtitle="FinstackPOS for Windows on this computer."
                actions={
                    state.phase === 'available' ? (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => install(state.update)}>
                            Update to {state.update.version}
                        </button>
                    ) : (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={check} disabled={state.phase === 'checking' || state.phase === 'installing' || !info}>
                            {state.phase === 'checking' ? 'Checking…' : 'Check for updates'}
                        </button>
                    )
                }
            />
            <div className="card-body space-y-4">
                {state.phase === 'current' && <Alert tone="green">You have the latest version.</Alert>}
                {state.phase === 'available' && (
                    <Alert tone="blue" title={`Version ${state.update.version} is available`}>
                        This computer has {state.update.current_version}. Press Update: the app closes, installs the update and opens again in a few
                        seconds. Sales saved offline are kept. Best done between customers.
                    </Alert>
                )}
                {state.phase === 'installing' && (
                    <Alert tone="blue" title={`Installing ${state.update.version}…`}>
                        Don't turn off the computer. The app will reopen by itself.
                    </Alert>
                )}
                {state.phase === 'error' && (
                    <Alert tone="red" title="Couldn't check or install the update">
                        {state.message}
                    </Alert>
                )}

                <Rows
                    rows={[
                        ['App version', info ? <Badge tone="brand">{info.app_version}</Badge> : '…'],
                        ['Windows', info?.os_version?.replace(/^Microsoft Windows\s*/, '') ?? info?.os ?? '…'],
                        ['Architecture', info?.arch ?? '…'],
                        ['WebView2', info?.webview_version ?? '…'],
                        ['Tauri', info?.tauri_version ?? '…'],
                        ['Server', info?.server_url ?? '…'],
                        ['Kiosk mode', info ? (info.kiosk ? 'On' : 'Off') : '…'],
                        ['Receipt printer', printer ?? 'Print dialog'],
                    ]}
                />
            </div>
        </Card>
    );
}

function WindowsAppCard({ latest }: { latest: Props['desktop_latest'] }) {
    return (
        <Card className="lg:col-span-2">
            <CardHeader title="Windows app" subtitle="Prints receipts straight to the thermal printer, opens the cash drawer, and updates itself." />
            <div className="card-body flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-gray-600">
                    {latest ? `Latest version: ${latest.version}` : 'The Windows app is not available for download yet.'}
                </p>
                {latest && (
                    <a href="/download" className="btn btn-secondary btn-sm" target="_blank" rel="noreferrer">
                        Download for Windows
                    </a>
                )}
            </div>
        </Card>
    );
}

/* ---------------------------------------------------------------- Web app */

function WebCard({ webVersion, serverTime, storeName }: { webVersion: string | null; serverTime: string; storeName: string | null }) {
    const skewSeconds = Math.round((Date.now() - new Date(serverTime).getTime()) / 1000);

    return (
        <Card>
            <CardHeader title="FinstackPOS" subtitle="The web app every device uses." />
            <div className="card-body">
                <Rows
                    rows={[
                        ['Store', storeName],
                        ['Web version', webVersion ? <code className="font-plex">{webVersion}</code> : null],
                        ['BIR accreditation', <Badge tone="amber">In process</Badge>],
                        ['Server time', new Date(serverTime).toLocaleString()],
                        [
                            'This device’s clock',
                            Math.abs(skewSeconds) > 120 ? (
                                <Badge tone="amber">Off by {Math.round(Math.abs(skewSeconds) / 60)} min</Badge>
                            ) : (
                                <Badge tone="green">In sync</Badge>
                            ),
                        ],
                    ]}
                />
            </div>
        </Card>
    );
}

/* ------------------------------------------------------------------- Sync */

function SyncCard({ merchantId }: { merchantId: number | null }) {
    const [online, setOnline] = useState(() => navigator.onLine);
    const counts = useLiveQuery(async () => {
        if (merchantId === null) return null;
        const [pending, rejected] = await Promise.all([
            db.sales.where('[merchant_id+sync_status]').equals([merchantId, 'pending']).count(),
            db.sales.where('[merchant_id+sync_status]').equals([merchantId, 'rejected']).count(),
        ]);
        return { pending, rejected };
    }, [merchantId]);

    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);

    return (
        <Card>
            <CardHeader title="Connection & sync" subtitle="Sales made offline wait on this device until they upload." />
            <div className="card-body">
                <Rows
                    rows={[
                        ['Internet', online ? <Badge tone="green">Online</Badge> : <Badge tone="amber">Offline</Badge>],
                        ['Sales waiting to upload', counts ? (counts.pending > 0 ? <Badge tone="amber">{counts.pending}</Badge> : '0') : '…'],
                        ['Sales the server refused', counts ? (counts.rejected > 0 ? <Badge tone="red">{counts.rejected}</Badge> : '0') : '…'],
                    ]}
                />
            </div>
        </Card>
    );
}

/* ----------------------------------------------------------------- Device */

function DeviceCard({ desktop }: { desktop: boolean }) {
    const [storage, setStorage] = useState<string | null>(null);
    const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;

    useEffect(() => {
        navigator.storage
            ?.estimate()
            .then(({ usage }) => setStorage(usage !== undefined ? `${(usage / 1_000_000).toFixed(1)} MB` : null))
            .catch(() => setStorage(null));
    }, []);

    return (
        <Card className="lg:col-span-2">
            <CardHeader title="This device" />
            <div className="card-body">
                <Rows
                    rows={[
                        ['Running as', desktop ? 'Windows desktop app' : standalone ? 'Installed app (PWA)' : 'Web browser'],
                        ['Screen', `${window.screen.width} × ${window.screen.height} (${window.devicePixelRatio}x)`],
                        ['Language', navigator.language],
                        ['Offline data stored', storage],
                        ['Browser details', <span className="text-xs font-normal text-gray-600">{navigator.userAgent}</span>],
                    ]}
                />
            </div>
        </Card>
    );
}
