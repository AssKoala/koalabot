/*
    Market overview command - shows S&P 500, Dow Jones, Nasdaq, and Russell 2000.
*/

import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import YahooFinance from 'yahoo-finance2';

import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js';
import { PerformanceCounter } from '../performancecounter.js';
import { formatDate, formatPercent } from './stockformatter.js';

type PricePoint = {
    date: Date;
    close: number;
};

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const MARKET_INDICES = [
    { ticker: '^GSPC', label: 'S&P 500' },
    { ticker: '^DJI',  label: 'Dow Jones' },
    { ticker: '^IXIC', label: 'Nasdaq' },
    { ticker: '^RUT',  label: 'Russell 2000' },
] as const;

function computePercentChange(current: number, previous?: number): number | undefined {
    if (previous === undefined || !Number.isFinite(previous) || previous === 0) {
        return undefined;
    }

    return ((current - previous) / previous) * 100;
}

function getClosestPointOnOrBefore(points: PricePoint[], targetDate: Date): PricePoint | undefined {
    for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].date.getTime() <= targetDate.getTime()) {
            return points[i];
        }
    }

    return points[0];
}

function formatCurrency(value: number, currencyCode?: string): string {
    const normalizedCurrencyCode = (currencyCode ?? 'USD').toUpperCase();

    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: normalizedCurrencyCode,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        return `${value.toFixed(2)} ${normalizedCurrencyCode}`;
    }
}

async function getChartPricePoints(ticker: string, period1: Date, period2: Date): Promise<PricePoint[]> {
    const chartData = await yahooFinance.chart(ticker, {
        period1,
        period2,
        interval: '1d',
        return: 'array',
    });

    return chartData.quotes
        .filter(entry => entry.close != null)
        .map(entry => ({
            date: new Date(entry.date),
            close: Number(entry.close),
        }))
        .filter(entry => Number.isFinite(entry.close))
        .sort((left, right) => left.date.getTime() - right.date.getTime());
}

class MarketCommand extends DiscordBotCommand {
    override async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        using perfCounter = PerformanceCounter.Create('handleMarketCommand(): ');

        const shortDisplay = interaction.options.getBoolean('short_display') ?? true;

        try {
            await interaction.deferReply();

            const now = new Date();
            const oldestDateForHistory = new Date(now.getTime() - (400 * 24 * 60 * 60 * 1000));

            const target30DayDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            const target365DayDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
            const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
            const quarterStartDate = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1));
            const yearStartDate = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

            const results = await Promise.all(
                MARKET_INDICES.map(async ({ ticker, label }) => {
                    const [quote, historicalPoints] = await Promise.all([
                        yahooFinance.quote(ticker),
                        getChartPricePoints(ticker, oldestDateForHistory, now),
                    ]);

                    const currentPrice = quote.regularMarketPrice ?? quote.postMarketPrice ?? quote.preMarketPrice;
                    const priceDate = quote.regularMarketTime ? new Date(quote.regularMarketTime) : now;

                    if (currentPrice == null || !Number.isFinite(Number(currentPrice))) {
                        throw new Error(`Quote response did not contain a valid market price for ${label} (${ticker})`);
                    }

                    const price = Number(currentPrice);

                    const dayPercentChange = computePercentChange(price, quote.regularMarketPreviousClose ?? undefined);
                    const trailing30DayPercent = computePercentChange(price, getClosestPointOnOrBefore(historicalPoints, target30DayDate)?.close);
                    const trailing365DayPercent = computePercentChange(price, getClosestPointOnOrBefore(historicalPoints, target365DayDate)?.close);
                    const quarterPercent = computePercentChange(price, getClosestPointOnOrBefore(historicalPoints, quarterStartDate)?.close);
                    const ytdPercent = computePercentChange(price, getClosestPointOnOrBefore(historicalPoints, yearStartDate)?.close);

                    return {
                        label,
                        priceDate,
                        displayPrice: formatCurrency(price, quote.currency ?? undefined),
                        dayPercentChange,
                        trailing30DayPercent,
                        trailing365DayPercent,
                        quarterPercent,
                        ytdPercent,
                    };
                }),
            );

            const latestDate = results.reduce(
                (latest, r) => r.priceDate > latest ? r.priceDate : latest,
                results[0].priceDate,
            );

            if (shortDisplay) {
                const lines = results.map(r =>
                    `**${r.label}** ${r.displayPrice} (${formatPercent(r.dayPercentChange)} today)`,
                );

                await interaction.editReply(`**Market Overview**\n${lines.join('\n')}`);
                return;
            }

            const lines = results.map(r =>
                `**${r.label}** ${r.displayPrice}\n`
                + `-# ${formatPercent(r.dayPercentChange)} Day\n`
                + `-# ${formatPercent(r.trailing30DayPercent)} 30D\n`
                + `-# ${formatPercent(r.trailing365DayPercent)} 365D\n`
                + `-# ${formatPercent(r.quarterPercent)} Quarter\n`
                + `-# ${formatPercent(r.ytdPercent)} YTD`,
            );

            await interaction.editReply(
                `**Market Overview** (${formatDate(latestDate)})\n${lines.join('\n')}`,
            );
        } catch (error) {
            await this.runtimeData().logger().logErrorAsync(
                `Market command failed, error=${error}`,
                interaction,
            );

            await interaction.editReply('Could not fetch market data.');
        }
    }

    override get() {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription('Show current S&P 500, Dow Jones, Nasdaq, and Russell 2000')
            .addBooleanOption((option) =>
                option
                    .setName('short_display')
                    .setDescription('Show short output (default: true). Set false for detailed output')
                    .setRequired(false),
            );
    }
}

registerDiscordBotCommand(new MarketCommand('market'), false);
