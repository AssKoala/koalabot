/*
    Shorten URL module
*/

import { ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder, SlashCommandBuilder } from 'discord.js';
import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js'
import { Global } from "../global.js";

export class ShortenUrlResult {
    shortUrl: string = null;
    fetchResult: Response = null;
    responseData: any = null;
    error: unknown = null;

    isValid(): boolean { return this.shortUrl != null && this.error == null; }
}

export class ShortenURLCommand extends DiscordBotCommand {
    static async shortenUrl(longUrl: string): Promise<ShortenUrlResult> {
        let shortUrlResult = new ShortenUrlResult();

        try {
            let UrlToShorten = new URL(longUrl);

            
            const url = `${Global.settings().get("SHORTEN_URL_SHLINK_BASE_ADDRESS")}/rest/v3/short-urls`;
            const options = {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'X-Api-Key': `${Global.settings().get("SHORTEN_URL_API_KEY")}`,
                    'Content-Type': `application/json`
                },
                body: JSON.stringify(
                    {
                        longUrl: UrlToShorten.toString()
                    })
            };

            const result = await fetch(url, options);

            if (result.ok) {
                const responseData = <any> await result.json();

                shortUrlResult.shortUrl = responseData.shortUrl;
                shortUrlResult.fetchResult = result;
                shortUrlResult.responseData = responseData;
                shortUrlResult.error = null;
            }
        } catch (e) {
            shortUrlResult.error = e;
        }

        return shortUrlResult;
    }

    async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        using perfCounter = this.runtimeData().getPerformanceCounter("handleShortenUrlCommand(): ");

        try {
            let shortened = await ShortenURLCommand.shortenUrl(interaction.options.data[0].value as string);
            
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
