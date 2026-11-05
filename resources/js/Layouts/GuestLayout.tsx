import { Link } from '@inertiajs/react';
import { PropsWithChildren, ReactNode } from 'react';

/**
 * Sign-in, sign-up, and password pages: the brand, then one compact card with
 * a heading. `footer` sits under the card (e.g. a link to the other auth page).
 */
export default function Guest({
    title,
    description,
    footer,
    children,
}: PropsWithChildren<{ title?: string; description?: ReactNode; footer?: ReactNode }>) {
    return (
        <div className="flex min-h-screen flex-col items-center bg-surface px-4 py-10 sm:justify-center sm:py-12">
            <div className="w-full max-w-[400px]">
                <Link href="/" aria-label="FinstackPOS home" className="mx-auto flex w-fit items-center gap-2.5 rounded-lg">
                    <img src="/brand/fb-profile-black.png" alt="" className="h-10 w-10 rounded-lg" />
                    <span className="text-xl font-bold tracking-tight text-gray-950">
                        Finstack<span className="text-brand-600">POS</span>
                    </span>
                </Link>

                <div className="card mt-6 p-5 sm:p-6">
                    {title && (
                        <div className="mb-5">
                            <h1 className="text-lg font-semibold text-gray-950">{title}</h1>
                            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
                        </div>
                    )}
                    {children}
                </div>

                {footer && <div className="mt-5 text-center text-sm text-gray-600">{footer}</div>}
            </div>
        </div>
    );
}
