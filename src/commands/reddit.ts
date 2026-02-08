/*
    Reddit module, allows link lookups and such
*/

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js';
import { PerformanceCounter } from '../performancecounter.js';

import validator from 'validator';
import cp from 'child_process';
import path from "path";
import fs from "fs";
import config from 'config';

class RedditLinks {
    links: string[];
    error: string;

    constructor(links: string[] = [], error: string = '') {
        this.links = links;
        this.error = error;
    }
}

class RedditLinkCommand extends DiscordBotCommand {
    private async getLinks(searchLimit: string, timeFilter: string, subredditList: string[]) {
        try {    
            const python = config.get<string>("Global.pythonBinary");
            const script = path.join(
                config.get<string>("Global.scriptPath"),
                config.get<string>("Reddit.readerScriptName"));

            if (!fs.existsSync(script)) {
                this.runtimeData().logger().logErrorAsync(`Cannot load reddit link script: ${script}`);
                return new RedditLinks([], `Cannot load reddit link script: ${script}`);
            }
    
            const args = [ 
                script, 
                config.get<string>("Reddit.clientId"), 
                config.get<string>("Reddit.clientSecret"),
                config.get<string>("Reddit.userAgent"),
                searchLimit, 
                timeFilter, ...subredditList 
            ];
    
            this.runtimeData().logger().logInfo(`Running ${python} with args ${args} from ${process.cwd()}`);
    
            const childprocess = cp.spawnSync(python, args, {cwd: process.cwd() });
            const output = `${childprocess.stdout}`;
    
            this.runtimeData().logger().logInfo(`Got reddit output: ${output} and error: ${childprocess.stderr}`);
    
            const lines = output.split("\n").map(line => 
                {
                    return line.trim();
                });
            const filtered = lines.filter((line) => 
                            {
                                return validator.isURL(line)
                            });
    
            try { 
                return new RedditLinks(filtered, childprocess.stderr.toString());
            } catch {
                return new RedditLinks(filtered);
            }                    
        } catch (e) {
            return new RedditLinks([], `Failed to get reddit links, got ${e}`);
        }
    }

    // @ts-expect-error todo cleanup tech debt
    private async getRandomLink(interaction: ChatInputCommandInteraction, searchLimit, subredditList: string[]) {
        using perfCounter = PerformanceCounter.Create("replyRandomLink(): ");

        try {
            let timeFilter = 'day';

            for (let i = 0; i < interaction.options.data.length; i++) {
                if (interaction.options.data[i].name == 'filter')
                {
                    timeFilter = interaction.options.data[i].value as string;
                    break;
                }
            }

            const redditLinks = await this.getLinks(searchLimit, timeFilter, subredditList);
            if (redditLinks.links.length > 0) {
                const index = Math.floor(Math.random() * redditLinks.links.length);
                await interaction.editReply(`${redditLinks.links[index]}`);
            } else {
                await this.runtimeData().logger().logErrorAsync(`${redditLinks.error}`, interaction, true);
            }
        } catch (e) {
            this.runtimeData().logger().logErrorAsync(`Failed to get links, got exception ${e}`, interaction, true);
        }
    }

    // @ts-expect-error todo cleanup tech debt
    private _slashCommand;
    slashCommand() {
        return this._slashCommand;
    }

    slashCommandJSON(): string {
        return this.slashCommand().toJSON();
    }

    private readonly whitelist: string[] = [];
    private readonly blacklist: string[] = [];
    private readonly subreddits: string[] = [];
    private readonly lookupCount: number = 0;
    private readonly description: string;

    async handle(interaction: ChatInputCommandInteraction) {
        try {
            // Check if blacklisted
            let isBlacklistedChannel: boolean = false;
            this.blacklist.forEach(blacklisted => {
                // @ts-expect-error todo cleanup tech debt
                if (interaction.channel.name === blacklisted) {
                    isBlacklistedChannel = true;
                }
            });

            // If blacklisted, return right away
            if (isBlacklistedChannel) {
                await interaction.editReply("This channel is blacklisted for this command.");
                return;
            }

            // Check if channel is whitelisted
            let isWhitelisted: boolean = true;
            if (this.whitelist.length > 0) {
                isWhitelisted = false;
                this.whitelist.every(whitelisted => {
                    // @ts-expect-error todo cleanup tech debt
                    if (interaction.channel.name === whitelisted) {
                        isWhitelisted = true;
                        return false;
                    }

                    return true;
                });
            }

            if (isWhitelisted) {
                await this.getRandomLink(interaction, this.lookupCount, this.subreddits);
            } else {
                await interaction.editReply(`This command is confined to channel(s): ${this.whitelist}`);
            }
        } catch (e) {
            await this.runtimeData().logger().logErrorAsync(`Failed to get links, got exception ${e}`, interaction, true);
        }
    }

    // @ts-expect-error todo cleanup tech debt
    constructor(linkData) {
        super(linkData.name);

        this.blacklist = linkData.blacklistedChannels;
        this.whitelist = linkData.whitelistedChannels;
        this.subreddits = linkData.subreddits;
        this.lookupCount = linkData.count;
        this.description = linkData.description;

        registerDiscordBotCommand(this);
    }

    get() {
        const command = new SlashCommandBuilder()
        .setName(this.name())
        .setDescription(this.description)
        .addStringOption((option) =>
            option
                .setName('filter')
                .setDescription('Time filter to use in search')
                .addChoices(
                    { name: 'All time', value: 'all' },
                    { name: 'Past 24 hours', value: 'day' },
                    { name: 'Last hour', value: 'hour' },
                    { name: 'Last week', value: 'week' },
                    { name: 'Last Year', value: 'year' },
                )
                .setRequired(false),
        );

        return command;
    }
}

import { readJsonFile } from '../sys/jsonreader.js'

class RedditLinkPoster {
    // @ts-expect-error todo cleanup tech debt
    #redditLinks;
    #redditLinkCommands: RedditLinkCommand[] = [];

    constructor() {
    }

    async init(configJsonFilePath: string) {
        this.#redditLinks = await readJsonFile(configJsonFilePath);
    }

    generateSlashCommands() {
        // @ts-expect-error todo cleanup tech debt
        this.#redditLinks.forEach(linkData => {
            this.#redditLinkCommands.push(new RedditLinkCommand(linkData));
        });
    }
}

const redditLinkPoster = new RedditLinkPoster();
await redditLinkPoster.init(`${config.get<string>("Global.dataPath")}/redditlinks.json`);
redditLinkPoster.generateSlashCommands();