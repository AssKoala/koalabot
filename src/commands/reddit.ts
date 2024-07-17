/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

*/

import { Global } from '../global.js';
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { replyRandomLink } from '../command_impl/reddit.js'

class RedditLinkCommand {
    #command;
    slashCommand() {
        return this.#command;
    }

    slashCommandJSON(): string {
        return this.slashCommand().toJSON();
    }

    #whitelist: string[] = [];
    #blacklist: string[] = [];
    #subreddits: string[] = [];
    #lookupCount: number = 0;

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply();

            // Check if blacklisted
            let isBlacklistedChannel: boolean = false;
            this.#blacklist.forEach(blacklisted => {
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
            if (this.#whitelist.length > 0) {
                isWhitelisted = false;
                this.#whitelist.every(whitelisted => {
                    if (interaction.channel.name === whitelisted) {
                        isWhitelisted = true;
                        return false;
                    }

                    return true;
                });
            }

            if (isWhitelisted) {
                await replyRandomLink(interaction, this.#lookupCount, this.#subreddits);
            } else {
                await interaction.editReply(`This command is confined to channel(s): ${this.#whitelist}`);
            }
        } catch (e) {
            await Global.logger().logError(`Failed to get links, got exception ${e}`, interaction, true);
        }
    }

    #registerCommand(client) {
        const command = {
            data: this.slashCommand(),
            execute: this.execute.bind(this)
        }
        client.commands.set(command.data.name, command);
    }

    constructor(linkData) {
        this.#blacklist = linkData.blacklistedChannels;
        this.#whitelist = linkData.whitelistedChannels;
        this.#subreddits = linkData.subreddits;
        this.#lookupCount = linkData.count;

        this.#command = new SlashCommandBuilder()
            .setName(linkData.name)
            .setDescription(linkData.description)
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
            )
        ;

        Global.registerCommandModule(this.#registerCommand.bind(this), this.slashCommandJSON.bind(this));
    }
}

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