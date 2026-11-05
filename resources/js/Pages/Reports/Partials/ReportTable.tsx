import { Icon } from '@/Components/NavIcons';
import { ReactNode } from 'react';

export type Column<T> = {
    label: string;
    /** Plain value for the CSV (numbers stay numbers: pesos as 1234.50). */
    value: (row: T) => string | number | null;
    /** What the screen shows; defaults to the value. */
    render?: (row: T) => ReactNode;
    align?: 'left' | 'right';
};

/** Excel-friendly CSV (UTF-8 BOM so ₱ and ñ survive). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
    const cell = (v: string | number | null) => {
        const s = v === null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/** A titled table with an "Export CSV" button. */
export default function ReportTable<T>({
    title,
    subtitle,
    rows,
    columns,
    csvName,
    footer,
    empty = 'Nothing recorded in this range.',
    limit,
}: {
    title: string;
    subtitle?: string;
    rows: T[];
    columns: Column<T>[];
    csvName: string;
    /** A totals row, already formatted. */
    footer?: ReactNode[];
    empty?: string;
    /** Show only the first n on screen (the CSV always has all rows). */
    limit?: number;
}) {
    const shown = limit ? rows.slice(0, limit) : rows;

    return (
        <section className="card report-section break-inside-avoid overflow-hidden">
            <div className="card-header">
                <div className="min-w-0">
                    <h3 className="card-title">{title}</h3>
                    {subtitle && <p className="card-subtitle">{subtitle}</p>}
                </div>
                {rows.length > 0 && (
                    <button
                        type="button"
                        onClick={() =>
                            downloadCsv(
                                csvName,
                                columns.map((c) => c.label),
                                rows.map((r) => columns.map((c) => c.value(r))),
                            )
                        }
                        className="no-print btn btn-secondary btn-sm"
                    >
                        <Icon name="download" className="h-3.5 w-3.5" />
                        Export CSV
                    </button>
                )}
            </div>
            {rows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-500">{empty}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                {columns.map((c) => (
                                    <th key={c.label} className={c.align === 'right' ? 'num' : undefined}>
                                        {c.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((row, i) => (
                                <tr key={i}>
                                    {columns.map((c) => (
                                        <td key={c.label} className={`whitespace-nowrap ${c.align === 'right' ? 'num' : ''}`}>
                                            {c.render ? c.render(row) : (c.value(row) ?? '—')}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                        {footer && (
                            <tfoot>
                                <tr>
                                    {footer.map((f, i) => (
                                        <td key={i} className={`whitespace-nowrap ${i === 0 ? '' : 'num'}`}>
                                            {f}
                                        </td>
                                    ))}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                    {limit && rows.length > limit && (
                        <p className="no-print border-t border-gray-100 px-4 py-2 text-xs text-gray-500 sm:px-5">
                            Showing the top {limit} of {rows.length}. Export CSV for all.
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
