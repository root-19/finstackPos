import { isDesktop, loadPrinterConfig, printRaw } from '@/lib/desktop';
import { ReportRow, reportToEscPos } from '@/lib/escpos';
import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';

export type PrintableReport = { title: string; subtitle: string[]; rows: ReportRow[] };

/** A report on receipt paper (X-reading, shift report), for the browser's print dialog. */
export function ReportPaper({ report, paperMm }: { report: PrintableReport; paperMm: number }) {
    const narrow = paperMm === 58;

    return (
        <div className={`theme-light bg-white font-mono leading-snug text-black ${narrow ? 'w-[58mm] px-[2mm] text-[10px]' : 'w-[80mm] px-[3mm] text-[11.5px]'} py-[4mm]`}>
            <p className="text-center text-[1.2em] font-bold uppercase">{report.title}</p>
            {report.subtitle.map((s) => (
                <p key={s} className="text-center">
                    {s}
                </p>
            ))}
            <div className="my-1.5 border-t border-dashed border-black" />
            {report.rows.map((row, i) =>
                row === 'divider' ? (
                    <div key={i} className="my-1.5 border-t border-dashed border-black" />
                ) : 'heading' in row ? (
                    <p key={i} className="mt-1 font-bold uppercase">
                        {row.heading}
                    </p>
                ) : 'text' in row ? (
                    <p key={i}>{row.text}</p>
                ) : (
                    <div key={i} className={`flex justify-between gap-2 ${row.bold ? 'font-bold' : ''}`}>
                        <span className="min-w-0 break-words">{row.left}</span>
                        <span className="shrink-0 text-right">{row.right}</span>
                    </div>
                ),
            )}
            <p className="mt-2 text-center text-[0.85em]">Printed {new Date().toLocaleString()}</p>
        </div>
    );
}

/**
 * Prints a report like receipts are printed: straight to the thermal printer
 * in the desktop app when one is set up, otherwise through the print dialog.
 */
export function useReportPrinter(paperMm: number) {
    const [report, setReport] = useState<PrintableReport | null>(null);

    const browserPrint = (r: PrintableReport) => {
        flushSync(() => setReport(r));
        document.body.classList.add('printing-report');
        window.print();
        document.body.classList.remove('printing-report');
    };

    const printReport = (r: PrintableReport) => {
        const desktop = isDesktop() ? loadPrinterConfig() : null;
        if (!desktop?.printer) {
            browserPrint(r);
            return;
        }
        printRaw(desktop.printer, reportToEscPos(r.title, r.subtitle, r.rows, paperMm, { cut: desktop.cut, openDrawer: false })).catch(() => browserPrint(r));
    };

    const reportPrinter = report
        ? createPortal(
              <div id="report-print">
                  <style>{`@page { size: ${paperMm}mm auto; margin: 0; }`}</style>
                  <ReportPaper report={report} paperMm={paperMm} />
              </div>,
              document.body,
          )
        : null;

    return { printReport, reportPrinter };
}
