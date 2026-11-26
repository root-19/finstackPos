import LineIcon from '@/Components/Landing/LineIcon';

/** The Windows app installer (App\Support\DesktopRelease); null until one is published. */
export type DesktopReleaseInfo = { version: string; size_bytes: number } | null;

/** Only what desktop/ does: ESC/POS straight to the printer, drawer kick, auto-cut; the rest is the same web app. */
const DESKTOP_POINTS = [
    'Receipts print straight to your thermal printer, with no print dialog',
    'Opens the cash drawer after cash sales',
    'Cuts the paper after each receipt',
    'Same account and data as the web app, and keeps selling offline',
];

export default function DesktopApp({ release, as: Heading = 'h2' }: { release: DesktopReleaseInfo; as?: 'h1' | 'h2' }) {
    const sizeMb = release ? Math.max(1, Math.round(release.size_bytes / 1_000_000)) : 0;

    return (
        <section id="desktop" aria-labelledby="desktop-title" className="mk-section scroll-mt-16 bg-shop-paper text-shop-ink">
            <div className="mk-container grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16">
                <div>
                    <p className="mk-label text-brand-700">Windows app</p>
                    <Heading id="desktop-title" className="mk-h2 mt-4">
                        The register,
                        <br />
                        on your Windows PC.
                    </Heading>
                    <p className="mt-6 max-w-xl text-lg text-shop-ink/75">
                        Everything in the web app, plus what a browser can't do at the counter.
                    </p>
                    <ul className="mt-8 space-y-3">
                        {DESKTOP_POINTS.map((point) => (
                            <li key={point} className="flex gap-3 text-[15px]">
                                <LineIcon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" strokeWidth={2} />
                                {point}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="mk-ticket px-7 pb-8 pt-6">
                    <p className="mk-label text-shop-ink/65">FinstackPOS for Windows</p>
                    <div aria-hidden className="mk-perf my-5 text-shop-ink/40" />
                    {release ? (
                        <>
                            <a href={route('download.windows')} className="mk-btn-red w-full" download>
                                <LineIcon name="arrow" className="h-4 w-4 rotate-90" strokeWidth={2} />
                                Download for Windows
                            </a>
                            <p className="mt-4 font-plex text-[13px] text-shop-ink/70">
                                Version {release.version} · {sizeMb} MB · Windows 10 or 11 (64-bit)
                            </p>
                        </>
                    ) : (
                        <>
                            <span className="mk-btn-ink w-full cursor-default opacity-60" aria-disabled="true">
                                Coming soon
                            </span>
                            <p className="mt-4 text-[15px] text-shop-ink/75">
                                The web app already runs on Windows in any modern browser. The installer will be available here.
                            </p>
                        </>
                    )}
                    <p className="mt-4 text-[13px] text-shop-ink/65">
                        Direct printing works with ESC/POS thermal printers (58 or 80 mm). Other printers use the print dialog.
                    </p>
                </div>
            </div>
        </section>
    );
}
