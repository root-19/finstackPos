import Checkbox from '@/Components/Checkbox';
import { Alert, Card, CardHeader, Field } from '@/Components/ui';
import {
    DesktopPrinterConfig,
    defaultPrinter,
    isDesktop,
    listPrinters,
    loadPrinterConfig,
    printRaw,
    savePrinterConfig,
} from '@/lib/desktop';
import { drawerKickEscPos, testPageEscPos } from '@/lib/escpos';
import { useEffect, useState } from 'react';

/**
 * This computer's receipt printer, shown only inside the desktop app.
 * Saved on the machine (not the store), since every register has its own.
 */
export default function DesktopPrinterSettings({ paperMm }: { paperMm: 58 | 80 }) {
    const [config, setConfig] = useState<DesktopPrinterConfig>(() => loadPrinterConfig());
    const [printers, setPrinters] = useState<string[] | null>(null);
    const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

    const refresh = () => {
        setPrinters(null);
        Promise.all([listPrinters(), defaultPrinter()])
            .then(([names, fallback]) => {
                setPrinters(names);
                if (fallback && !names.includes(fallback)) setPrinters([...names, fallback]);
            })
            .catch((error) => {
                setPrinters([]);
                setMessage({ tone: 'red', text: `Couldn't list printers: ${String(error)}` });
            });
    };

    useEffect(() => {
        if (isDesktop()) refresh();
    }, []);

    if (!isDesktop()) return null;

    const update = (patch: Partial<DesktopPrinterConfig>) => {
        const next = { ...config, ...patch };
        setConfig(next);
        savePrinterConfig(next);
        setMessage(null);
    };

    const send = (bytes: Uint8Array, done: string) => {
        if (!config.printer) return;
        printRaw(config.printer, bytes)
            .then(() => setMessage({ tone: 'green', text: done }))
            .catch((error) => setMessage({ tone: 'red', text: String(error) }));
    };

    return (
        <Card>
            <CardHeader
                title="Desktop receipt printer"
                subtitle="This computer only. Prints straight to the thermal printer, without the print dialog."
            />
            <div className="card-body space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Printer" htmlFor="desktop_printer" hint="Choose a thermal (ESC/POS) receipt printer. Other printers: keep the print dialog.">
                        <div className="flex gap-2">
                            <select
                                id="desktop_printer"
                                className="input"
                                value={config.printer ?? ''}
                                onChange={(e) => update({ printer: e.target.value || null })}
                                disabled={printers === null}
                            >
                                <option value="">Use the print dialog</option>
                                {(printers ?? []).map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                                {config.printer && printers && !printers.includes(config.printer) && (
                                    <option value={config.printer}>{config.printer} (not found)</option>
                                )}
                            </select>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
                                Refresh
                            </button>
                        </div>
                    </Field>
                    <div className="flex flex-col gap-2">
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50">
                            <Checkbox checked={config.cut} onChange={(e) => update({ cut: e.target.checked })} />
                            Cut the paper after each receipt
                        </label>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50">
                            <Checkbox checked={config.openDrawer} onChange={(e) => update({ openDrawer: e.target.checked })} />
                            Open the cash drawer after cash sales
                        </label>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!config.printer}
                        onClick={() => send(testPageEscPos(paperMm, { cut: config.cut, openDrawer: false }), 'Test page sent.')}
                    >
                        Print test page
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!config.printer}
                        onClick={() => send(drawerKickEscPos(), 'Drawer signal sent.')}
                    >
                        Open drawer
                    </button>
                </div>

                {message && <Alert tone={message.tone}>{message.text}</Alert>}
            </div>
        </Card>
    );
}
