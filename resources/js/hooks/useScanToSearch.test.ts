import { describe, expect, it } from 'vitest';
import { KeyContext, shouldCaptureKey } from './useScanToSearch';

/** A scanner typing a digit while the cashier's last tap left focus on a product tile. */
const scan = (over: Partial<KeyContext> = {}): KeyContext => ({
    key: '4',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    targetTag: 'BUTTON',
    targetIsContentEditable: false,
    modalOpen: false,
    ...over,
});

describe('shouldCaptureKey', () => {
    it('captures a barcode character typed with focus on a button', () => {
        expect(shouldCaptureKey(scan())).toBe(true);
    });

    it('captures letters and symbols, not just digits', () => {
        for (const key of ['A', 'z', '-', '/']) {
            expect(shouldCaptureKey(scan({ key }))).toBe(true);
        }
    });

    it('captures when focus is on the page body', () => {
        expect(shouldCaptureKey(scan({ targetTag: 'BODY' }))).toBe(true);
        expect(shouldCaptureKey(scan({ targetTag: null }))).toBe(true);
    });

    it('leaves browser and OS shortcuts alone', () => {
        expect(shouldCaptureKey(scan({ ctrlKey: true }))).toBe(false);
        expect(shouldCaptureKey(scan({ metaKey: true }))).toBe(false);
        expect(shouldCaptureKey(scan({ altKey: true }))).toBe(false);
    });

    it('ignores non-printable keys', () => {
        for (const key of ['Enter', 'Tab', 'Escape', 'ArrowLeft', 'F5', 'Backspace', 'Shift']) {
            expect(shouldCaptureKey(scan({ key }))).toBe(false);
        }
    });

    it('ignores Space so the focused button still activates', () => {
        expect(shouldCaptureKey(scan({ key: ' ' }))).toBe(false);
    });

    it('never steals a keystroke from a field being typed in', () => {
        for (const targetTag of ['INPUT', 'TEXTAREA', 'SELECT']) {
            expect(shouldCaptureKey(scan({ targetTag }))).toBe(false);
        }
        expect(shouldCaptureKey(scan({ targetIsContentEditable: true }))).toBe(false);
    });

    it('stays quiet while a modal is open', () => {
        expect(shouldCaptureKey(scan({ modalOpen: true }))).toBe(false);
    });

    it('ignores characters still being composed by an IME', () => {
        expect(shouldCaptureKey(scan({ isComposing: true }))).toBe(false);
    });
});
