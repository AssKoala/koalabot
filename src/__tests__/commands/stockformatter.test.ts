import { describe, expect, test } from 'vitest';

import { formatDate, formatPercent } from '../../commands/stockformatter.js';

describe('stockformatter', () => {
    test('formatPercent: positive values use up arrow', () => {
        expect(formatPercent(1.234)).toBe('⬆️ 1.23%');
    });

    test('formatPercent: negative values use down arrow', () => {
        expect(formatPercent(-9.876)).toBe('⬇️ 9.88%');
    });

    test('formatPercent: zero uses neutral arrow', () => {
        expect(formatPercent(0)).toBe('➡️ 0.00%');
    });

    test('formatPercent: undefined uses N/A', () => {
        expect(formatPercent(undefined)).toBe('N/A');
    });

    test('formatPercent: non-finite values use N/A', () => {
        expect(formatPercent(Number.NaN)).toBe('N/A');
        expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('N/A');
    });

    test('formatDate: uses YYYY-MM-DD HH:mm UTC', () => {
        const date = new Date('2026-04-16T14:32:59.000Z');
        expect(formatDate(date)).toBe('2026-04-16 14:32 UTC');
    });
});
