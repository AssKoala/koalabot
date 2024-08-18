import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/DiscordBotCommand.js';
import validator from 'validator';
import cp from 'child_process';
import path from "path";
import fs from "fs";

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
            const python = this.runtimeData().settings().get("PYTHON_BINARY");
            const script = path.join(
                this.runtimeData().settings().get("SCRIPT_PATH"),
                this.runtimeData().settings().get("REDDIT_READER_SCRIPT_NAME"));

            if (!fs.existsSync(script)) {
                this.runtimeData().logger().logError(`Cannot load reddit link script: ${script}`);
                return new RedditLinks([], `Cannot load reddit link script: ${script}`);
            }
    
            const args = [ 
                script, 
                this.runtimeData().settings().get("REDDIT_CLIENT_ID"), 
                this.runtimeData().settings().get("REDDIT_CLIENT_SECRET"),
                this.runtimeData().settings().get("REDDIT_USER_AGENT"),
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
            } catch (e) {
                return new RedditLinks(filtered);
            }                    
        } catch (e) {
            return new RedditLinks([], `Failed to get reddit links, got ${e}`);
        }
    }

    private async getRandomLink(interaction: ChatInputCommandInteraction, searchLimit, subredditList: string[]) {
        using perfCounter = this.runtimeData().getPerformanceCounter("replyRandomLink(): ");

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
                await this.runtimeData().logger().logError(`${redditLinks.error}`, interaction, true);
            }
        } catch (e) {
            this.runtimeData().logger().logError(`Failed to get links, got exception ${e}`, interaction, true);
        }
    }

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
            await this.runtimeData().logger().logError(`Failed to get links, got exception ${e}`, interaction, true);
        }
    }

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

import { Global } from "../global.js"

class RedditLinkPoster {
    #redditLinks;
    #redditLinkCommands: RedditLinkCommand[] = [];

    constructor() {
    }

    async init(configJsonFilePath: string) {
        this.#redditLinks = await Global.readJsonFile(configJsonFilePath);
    }

    generateSlashCommands() {
        this.#redditLinks.forEach(linkData => {
            this.#redditLinkCommands.push(new RedditLinkCommand(linkData));
        });
    }
}

const redditLinkPoster = new RedditLinkPoster();
await redditLinkPoster.init(`${Global.settings().get("DATA_PATH")}/redditlinks.json`);
redditLinkPoster.generateSlashCommands();