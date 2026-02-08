/*
    Shorten URL module
*/

import { ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder, SlashCommandBuilder } from 'discord.js';
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js'
import { PerformanceCounter } from '../performancecounter.js';
import config from 'config';

export class ShortenUrlResult {
    shortUrl?: string;
    fetchResult?: Response;
    responseData?: unknown;
    error?: unknown;

    isValid(): boolean { return this.shortUrl != undefined && this.error == undefined; }
}

export class ShortenURLCommand extends DiscordBotCommand {
    static async shortenUrl(longUrl: string): Promise<ShortenUrlResult> {
        const shortUrlResult = new ShortenUrlResult();

        try {
            const UrlToShorten = new URL(longUrl);

            
            const url = `${config.get<string>("ShortenUrl.shlinkBaseAddress")}/rest/v3/short-urls`;
            const options = {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'X-Api-Key': `${config.get("APIKey.shortenUrl")}`,
                    'Content-Type': `application/json`
                },
                body: JSON.stringify(
                    {
                        longUrl: UrlToShorten.toString()
                    })
            };

            const result = await fetch(url, options);

            if (result.ok) {
                const responseData = <any> await result.json(); // eslint-disable-line @typescript-eslint/no-explicit-any

                shortUrlResult.shortUrl = responseData.shortUrl;
                shortUrlResult.fetchResult = result;
                shortUrlResult.responseData = responseData;
                shortUrlResult.error = undefined;
            }
        } catch (e) {
            shortUrlResult.error = e;
        }

        return shortUrlResult;
    }

    async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        using perfCounter = PerformanceCounter.Create("handleShortenUrlCommand(): ");

        try {
            const shortened = await ShortenURLCommand.shortenUrl(interaction.options.data[0].value as string);
            
            if (shortened.isValid()) {
                await interaction.editReply(`Short URL: ${shortened.shortUrl}`);
            } else {
                await interaction.editReply(`URL shorten request failed with error: ${shortened.error}`);
            }
        } catch (e) {
            this.runtimeData().logger().logErrorAsync(`Failed to shorten URL, got exception ${e}`, interaction);
        }
    }

    get(): SlashCommandOptionsOnlyBuilder {
        const shortenUrlCommand = new SlashCommandBuilder()
                                            .setName(this.name())
                                            .setDescription('Shorten a URL')
                                            .addStringOption((option) =>
                                                option
                                                    .setName('url')
                                                    .setDescription('URL to shorten')
                                                    .setRequired(true),
                                            );

        return shortenUrlCommand;
    }
}

const shortenUrlCommand = new ShortenURLCommand('shortenurl');
registerDiscordBotCommand(shortenUrlCommand, true);
