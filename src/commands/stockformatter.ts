export function formatPercent(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) {
        return 'N/A';
    }

    if (value > 0) {
        return `⬆️ ${Math.abs(value).toFixed(2)}%`;
    }

    if (value < 0) {
        return `⬇️ ${Math.abs(value).toFixed(2)}%`;
    }

    return `➡️ 0.00%`;
}

export function formatDate(date: Date): string {
    const datePart = date.toISOString().slice(0, 10);
    const timePart = date.toISOString().slice(11, 16);
    return `${datePart} ${timePart} UTC`;
}
