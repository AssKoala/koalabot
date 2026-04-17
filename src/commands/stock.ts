/*
    Stock quote command using Yahoo Finance.
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

const yahooFinance = new YahooFinance();

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

class StockCommand extends DiscordBotCommand {
    override async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        using perfCounter = PerformanceCounter.Create('handleStockCommand(): ');

        const tickerInput = interaction.options.getString('ticker', true).trim();
        const shortDisplay = interaction.options.getBoolean('short_display') ?? true;

        try {
            await interaction.deferReply();

            const now = new Date();
            const oldestDateForHistory = new Date(now.getTime() - (400 * 24 * 60 * 60 * 1000));

            const [quote, historicalPoints] = await Promise.all([
                yahooFinance.quote(tickerInput),
                getChartPricePoints(tickerInput, oldestDateForHistory, now),
            ]);

            const currentPrice = quote.regularMarketPrice ?? quote.postMarketPrice ?? quote.preMarketPrice;
            const priceDate = quote.regularMarketTime ? new Date(quote.regularMarketTime) : now;

            if (currentPrice == null || !Number.isFinite(Number(currentPrice))) {
                throw new Error(`Quote response did not contain a valid market price for ticker ${tickerInput}`);
            }

            const dayPercentChange = computePercentChange(Number(currentPrice), quote.regularMarketPreviousClose ?? undefined);

            const target30DayDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            const target365DayDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));

            const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
            const quarterStartDate = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1));
            const yearStartDate = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

            const baseline30Day = getClosestPointOnOrBefore(historicalPoints, target30DayDate);
            const baseline365Day = getClosestPointOnOrBefore(historicalPoints, target365DayDate);
            const baselineQuarter = getClosestPointOnOrBefore(historicalPoints, quarterStartDate);
            const baselineYtd = getClosestPointOnOrBefore(historicalPoints, yearStartDate);

            const trailing30DayPercent = computePercentChange(Number(currentPrice), baseline30Day?.close);
            const trailing365DayPercent = computePercentChange(Number(currentPrice), baseline365Day?.close);
            const quarterPercent = computePercentChange(Number(currentPrice), baselineQuarter?.close);
            const ytdPercent = computePercentChange(Number(currentPrice), baselineYtd?.close);

            const displayTicker = tickerInput.toUpperCase();
            const companyName = quote.longName ?? quote.shortName ?? displayTicker;
            const displayInstrument = `${companyName} (${displayTicker})`;
            const displayPrice = formatCurrency(Number(currentPrice), quote.currency ?? undefined);

            if (shortDisplay) {
                await interaction.editReply(`**${displayInstrument}** ${displayPrice} (${formatPercent(dayPercentChange)} today)`);
                return;
            }

            await interaction.editReply(
                `**${displayInstrument}** (${formatDate(priceDate)})\n`
                + `-# **${displayPrice}**\n`
                + `-# ${formatPercent(dayPercentChange)} Day\n`
                + `-# ${formatPercent(trailing30DayPercent)} 30D\n`
                + `-# ${formatPercent(trailing365DayPercent)} 365D\n`
                + `-# ${formatPercent(quarterPercent)} Quarter\n`
                + `-# ${formatPercent(ytdPercent)} YTD`,
            );
        } catch (error) {
            await this.runtimeData().logger().logErrorAsync(
                `Stock command failed for ticker=${tickerInput}, short_display=${shortDisplay}, error=${error}`,
                interaction,
            );

            await interaction.editReply('Could not fetch stock data for that ticker.');
        }
    }

    override get() {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription('Get stock performance from Yahoo Finance')
            .addStringOption((option) =>
                option
                    .setName('ticker')
                    .setDescription('Ticker symbol supported by Yahoo Finance')
                    .setRequired(true),
            )
            .addBooleanOption((option) =>
                option
                    .setName('short_display')
                        .setDescription('Show short output (default: true). Set false for detailed output')
                    .setRequired(false),
            );
    }
}

registerDiscordBotCommand(new StockCommand('stock'), false);
