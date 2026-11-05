/**
 * Read a barcode or QR code from an uploaded picture (a photo of the pack, a supplier's
 * label, a screenshot). Uses the browser's BarcodeDetector where there is one (Android,
 * macOS) and otherwise ZXing, loaded only when a picture is actually read.
 */
import type { DecodeHintType as HintType } from '@zxing/library';

/** Product barcodes plus the 2D codes merchants print themselves. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code', 'data_matrix', 'pdf417'];

/** Phone photos are huge; this is plenty for a barcode and keeps decoding fast. */
const MAX_SIDE = 1600;

interface DetectedCode {
    rawValue: string;
}
interface BarcodeDetectorLike {
    detect(source: CanvasImageSource): Promise<DetectedCode[]>;
}
interface BarcodeDetectorCtor {
    new (options?: { formats: string[] }): BarcodeDetectorLike;
    getSupportedFormats(): Promise<string[]>;
}

export class NoCodeFoundError extends Error {
    constructor() {
        super('No barcode or QR code found in that picture. Try a sharper, closer photo with the whole code in view.');
    }
}

export async function readCodeFromImage(file: File): Promise<string> {
    const canvas = await toCanvas(file);

    const native = await readNative(canvas);
    if (native) {
        return native;
    }

    // ZXing finds codes more reliably at some scales than others (a QR filling a big photo is
    // easier at half size), and 1D readers only scan rows, so try a few views before giving up.
    for (const view of [canvas, halve(canvas)]) {
        const gray = toGray(view.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, view.width, view.height).data);
        const value = (await decodeLuminance(gray, view.width, view.height)) ?? (await decodeLuminance(...rotate90(gray, view.width, view.height)));
        if (value !== null) {
            return value;
        }
    }
    throw new NoCodeFoundError();
}

function halve(source: HTMLCanvasElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width / 2));
    canvas.height = Math.max(1, Math.round(source.height / 2));
    canvas.getContext('2d', { willReadFrequently: true })!.drawImage(source, 0, 0, canvas.width, canvas.height);

    return canvas;
}

async function toCanvas(file: File): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(file).catch(() => {
        throw new Error('That file could not be opened as a picture.');
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    // Transparent PNGs (codes exported from generators) need a white background, or the bars vanish.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    return canvas;
}

async function readNative(canvas: HTMLCanvasElement): Promise<string | null> {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector) {
        return null;
    }
    try {
        const supported = await Detector.getSupportedFormats();
        const formats = FORMATS.filter((f) => supported.includes(f));
        if (formats.length === 0) {
            return null;
        }
        const codes = await new Detector({ formats }).detect(canvas);

        return codes.find((c) => c.rawValue)?.rawValue ?? null;
    } catch {
        // Some platforms expose the API without a working backend; fall back to ZXing.
        return null;
    }
}

function toGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
    const gray = new Uint8ClampedArray(rgba.length / 4);
    for (let i = 0; i < gray.length; i++) {
        gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
    }

    return gray;
}

/** Barcodes photographed sideways: ZXing's 1D readers only scan rows. */
function rotate90(gray: Uint8ClampedArray, width: number, height: number): [Uint8ClampedArray, number, number] {
    const out = new Uint8ClampedArray(gray.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            out[x * height + (height - 1 - y)] = gray[y * width + x];
        }
    }

    return [out, height, width];
}

/** Decode an 8-bit grayscale image with ZXing; null when it holds no readable code. */
export async function decodeLuminance(gray: Uint8ClampedArray, width: number, height: number): Promise<string | null> {
    const { MultiFormatReader, BinaryBitmap, HybridBinarizer, GlobalHistogramBinarizer, RGBLuminanceSource, DecodeHintType, BarcodeFormat } = await import('@zxing/library');
    const reader = new MultiFormatReader();
    reader.setHints(
        new Map<HintType, unknown>([
            [DecodeHintType.TRY_HARDER, true],
            [
                DecodeHintType.POSSIBLE_FORMATS,
                [
                    BarcodeFormat.EAN_13,
                    BarcodeFormat.EAN_8,
                    BarcodeFormat.UPC_A,
                    BarcodeFormat.UPC_E,
                    BarcodeFormat.CODE_128,
                    BarcodeFormat.CODE_39,
                    BarcodeFormat.CODE_93,
                    BarcodeFormat.CODABAR,
                    BarcodeFormat.ITF,
                    BarcodeFormat.QR_CODE,
                    BarcodeFormat.DATA_MATRIX,
                    BarcodeFormat.PDF_417,
                ],
            ],
        ]),
    );
    // Hybrid handles uneven light (photos); the global one copes better with blur and low contrast.
    for (const Binarizer of [HybridBinarizer, GlobalHistogramBinarizer]) {
        try {
            return reader.decode(new BinaryBitmap(new Binarizer(new RGBLuminanceSource(gray, width, height)))).getText();
        } catch {
            // Not found with this binarizer; try the next.
        }
    }

    return null;
}
