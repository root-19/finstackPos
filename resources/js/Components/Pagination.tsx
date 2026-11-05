import { Paginated } from '@/types';
import { Link } from '@inertiajs/react';

function label(raw: string): string {
    return raw.replace('&laquo;', '‹').replace('&raquo;', '›');
}

export default function Pagination<T>({ paginator, noun }: { paginator: Paginated<T>; noun: string }) {
    if (paginator.total === 0) {
        return null;
    }

    return (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:px-5">
            <p className="text-xs text-gray-500">
                Showing <span className="font-medium tabular-nums text-gray-700">{paginator.from}</span>–
                <span className="font-medium tabular-nums text-gray-700">{paginator.to}</span> of{' '}
                <span className="font-medium tabular-nums text-gray-700">{paginator.total}</span> {noun}
            </p>
            {paginator.last_page > 1 && (
                <nav className="flex flex-wrap justify-center gap-1" aria-label="Pagination">
                    {paginator.links.map((link, i) =>
                        link.url ? (
                            <Link
                                key={i}
                                href={link.url}
                                preserveScroll
                                preserveState
                                aria-current={link.active ? 'page' : undefined}
                                className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2.5 text-sm font-medium tabular-nums transition-colors ${
                                    link.active ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950'
                                }`}
                            >
                                {label(link.label)}
                            </Link>
                        ) : (
                            <span key={i} className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2.5 text-sm text-gray-300">
                                {label(link.label)}
                            </span>
                        ),
                    )}
                </nav>
            )}
        </div>
    );
}
