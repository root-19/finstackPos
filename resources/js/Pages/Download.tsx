import DesktopApp, { DesktopReleaseInfo } from '@/Components/Landing/DesktopApp';
import MarketingLayout from '@/Components/Landing/MarketingLayout';
import { PageProps } from '@/types';
import { Head } from '@inertiajs/react';

type Props = PageProps<{ desktop: DesktopReleaseInfo }>;

/** Only steps that match desktop/: an unsigned NSIS installer, the same login, the printer card in Settings. */
const STEPS = [
    {
        title: 'Install',
        body: 'Run the installer you downloaded. If Windows shows "Windows protected your PC", choose More info, then Run anyway.',
    },
    {
        title: 'Sign in',
        body: 'Log in with your FinstackPOS account. Your products, sales and settings are the same as on the web.',
    },
    {
        title: 'Set up the printer',
        body: 'Go to Settings, then Desktop receipt printer. Pick your thermal printer and press Print test page.',
    },
];

export default function Download({ desktop }: Props) {
    return (
        <>
            <Head title="Download for Windows" />

            <MarketingLayout>
                <DesktopApp release={desktop} as="h1" />

                <section aria-labelledby="install-title" className="mk-section border-t border-shop-paper/10 bg-shop-ink">
                    <div className="mk-container">
                        <p className="mk-label text-brand-500">Getting started</p>
                        <h2 id="install-title" className="mk-h2 mt-4">
                            Three steps to the counter.
                        </h2>
                        <ol className="mt-12 grid gap-5 md:grid-cols-3">
                            {STEPS.map((step, i) => (
                                <li key={step.title} className="mk-ticket flex flex-col px-7 pb-8 pt-6">
                                    <span aria-hidden className="font-display text-7xl leading-none text-brand-700">
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <div aria-hidden className="mk-perf my-5 text-shop-ink/40" />
                                    <h3 className="text-xl font-extrabold">{step.title}</h3>
                                    <p className="mt-2 text-[15px] text-shop-ink/75">{step.body}</p>
                                </li>
                            ))}
                        </ol>
                        <p className="mt-10 max-w-2xl text-[15px] text-shop-paper/70">
                            No Windows PC? FinstackPOS also runs in any modern browser on a Mac, tablet or phone.{' '}
                            <a href="/" className="mk-link text-shop-paper underline underline-offset-4">
                                Back to the home page
                            </a>
                        </p>
                    </div>
                </section>
            </MarketingLayout>
        </>
    );
}
