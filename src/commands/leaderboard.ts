/*
    Allows querying the bot for leaderboard stuff.
*/

import { LoggerConcrete } from '../logging/logger.js';
import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js'
import { Stenographer } from '../app/stenographer/discordstenographer.js';
import { DiscordStenographerMessage } from "../app/stenographer/discordstenographermessage.js";
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js';
import { PerformanceCounter } from '../performancecounter.js'
import { getCommonLogger } from '../logging/logmanager.js';
import { readJsonFile } from '../sys/jsonreader.js';
import { DiscordPlatform } from '../platform/discord/discordplatform.js';

import config from 'config';

const profanities = await readJsonFile(`${config.get<string>("Global.dataPath")}/profanity.json`);

class ProfanityStats {
    private _profanityMap: Map<string, number> = new Map<string, number>();

    set(profanity: string, count: number) {
        this._profanityMap.set(profanity, count);
    }

    add(profanity: string) {
        this._profanityMap.set(profanity, this._profanityMap.get(profanity)! + 1);
    }

    get(profanity: string) {
        return this._profanityMap.get(profanity);
    }
}

class ProfanityLeaderboard {
    private _leaderboardMap: Map<string, Map<string, ProfanityStats>> = new Map<string, Map<string, ProfanityStats>>();
    
    recalculateProfanityLeaders()
    {
        using perfCounter = PerformanceCounter.Create("recalculateProfanityLeaders(): ");

        try {
            const guildeCaches = Stenographer.getAllGuildCaches();

            for (const [guildId, messageCache] of guildeCaches) {
                messageCache.messages().forEach(entry => {
                    this.addMessageToProfanityLeaderboard(entry);
                });
            }
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to calculate profanity leaders, got ${e}`);
        }
    }
    
    addMessageToProfanityLeaderboard(discordStenographerMsg: DiscordStenographerMessage)
    {
        // @ts-ignore
        let result = [];

        try {
            const author = discordStenographerMsg.author;
            const guildId = discordStenographerMsg.guildId;

            if (!this._leaderboardMap.has(guildId)) 
            {
                this._leaderboardMap.set(guildId, new Map<string, ProfanityStats>());
            }

            let profanityLeaders = this._leaderboardMap.get(guildId)!;

            if (!profanityLeaders.has(author)) {
                profanityLeaders.set(author, new ProfanityStats());
                // @ts-ignore
                profanities.forEach(profanity => {
                    profanityLeaders.get(author)!.set(profanity.profanity, 0);
                });
            }        

            profanities.forEach((profanity: any) => {
                let currentLeader = this.getProfanityLeader(guildId, profanityLeaders, profanity.profanity);

                profanity.matches.every((regex: string) => {
                    if (discordStenographerMsg.message.toLowerCase().match(regex) != null) {
                        profanityLeaders.get(author)!.add(profanity.profanity);
                        return false;
                    }
                    return true;
                });

                let newLeader = this.getProfanityLeader(guildId, profanityLeaders, profanity.profanity);

                if (!(currentLeader["leader"] === newLeader["leader"])) {
                    result.push({ "profanity": profanity.profanity, "leader": newLeader["leader"], "old_leader": currentLeader["leader"] });
                }
            });

            this._leaderboardMap.set(discordStenographerMsg.guildId, profanityLeaders);
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to add message to profanity leaderboard, got ${e}`);
            result = [];
        }

        // @ts-ignore
        return result;
    }

    // @ts-ignore
    getProfanityLeader(guildId, profanityLeaders, profanity, perCapita = false, ignoreList = [])
    {
        try {
            let leader = null;
            let count = 0;
            let leaderMessageCount = 0;

            for (const [author, profanityStats] of profanityLeaders) {
                // @ts-ignore
                if (ignoreList.includes(author)) continue;

                const authorTotalMessages = Stenographer.getMessageCount(guildId, author);

                if (leader != null) 
                {
                    if ((!perCapita && count < profanityStats.get(profanity))
                      || (perCapita && (count / leaderMessageCount) < (profanityStats.get(profanity) / authorTotalMessages))
                    ) {
                        count = profanityStats.get(profanity);
                        leader = author;
                        leaderMessageCount = authorTotalMessages;
                    }
                } else {
                    leader = author;
                    count = profanityStats.get(profanity);
                    leaderMessageCount = authorTotalMessages;
                }
            };

            return { "leader": leader, "count": count, "total": leaderMessageCount };
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to get profanity leader for ${profanity}, got error ${e}`);
        }

        return { "leader": "error", "count": 0 };
    };

    // @ts-ignore
    async showProfanityLeaderboard(interaction, perCapita = false)
    {
        try {
            const perCapitaString = perCapita ? `(per capita)` : `(total)`;

            const profanityLeaders = this._leaderboardMap.get(interaction.guildId);

            let outputString =
                "```Profanity Leaderboard " + `${perCapitaString}\n`
                + "-------------------------\n";
            
            // @ts-ignore
            profanities.forEach(profanity => {
                // @ts-ignore
                const lead = this.getProfanityLeader(interaction.guildId, profanityLeaders, profanity.profanity, perCapita, [Global.settings().get("BOT_NAME")] );

                outputString += `${profanity.profanity}(s):`.padEnd(12, " ");

                if (lead.count != 0) {
                    // @ts-ignore
                    const perCapitaValue = lead["count"] / lead["total"] * 100;

                    if (perCapita) outputString += `${lead["leader"]} with ${perCapitaValue.toPrecision(2)}%\n`;
                    else outputString += `${lead["leader"]} with ${lead["count"]}\n`;
                } else {
                    outputString += "No one has said this word!\n";
                }
            });

            outputString += "```";

            await DiscordPlatform.editAndSplitReply(interaction, outputString);
        } catch (e) {
            getCommonLogger().logErrorAsync(`Exception getting profanity leaderboard, got ${e}`, interaction, true);
        }
    }

    // @ts-ignore
    updateProfanityLeaderboard(message)
    {
        using perfCounter = PerformanceCounter.Create("updateProfanityLeaderboard(): ");

        try {
            if (message.author.bot) return;

            const stdMsg = LoggerConcrete.getStandardDiscordMessageFormat(message);
            let discordStenographerMsg = DiscordStenographerMessage.parseFromStandardMessageFormat(message.guildId, message.channelId, stdMsg);

            const result = this.addMessageToProfanityLeaderboard(discordStenographerMsg);

            if (result.length > 0) {
                let profanitiesInLead = "";
                let dethroned = "";

                // Figure out what this person is now the leader of
                result.forEach(entry => {
                    profanitiesInLead += `${entry.profanity},`;

                    if (!dethroned.includes(entry.old_leader)) {
                        dethroned += `${entry.old_leader},`;
                    }
                });

                // @ts-ignore
                let convertToOutput = function (items) {
                    // Remove trailing , and front whitespace then split
                    items = items.substring(0, items.length - 1).split(',');

                    if (items.length == 2) {
                        return `${items[0]} and ${items[1]}`;
                    } else if (items.length > 2) {
                        let toRet = "";
                        for (let i = 0; i < items.length - 1; i++) {
                            toRet += `${items[i]}, `;
                        }
                        toRet += `and ${items[items.length - 1]}`;
                        return toRet;
                    } else {
                        return items;
                    }
                };

                message.channel.send(`Congrats ${result[0].leader}, you've surpassed ${convertToOutput(dethroned)} at saying ${convertToOutput(profanitiesInLead)}!`);
            }
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to update profanity leaderboard, got ${e}`);
        }

        
    }

    // @ts-ignore
    async handleDisplayLeaderboardCommand(interaction, options)
    {
        try {
            for (let i = 0; i < options.length; i++) {
                const leaderboardName = options[i].options[0].value;

                switch (leaderboardName) {
                    case 'profanity':
                        await this.showProfanityLeaderboard(interaction);
                        break;
                    case 'profanity-per-capita':
                        await this.showProfanityLeaderboard(interaction, true);
                        break;
                    default:
                        break;
                }
            }
            
        } catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to handle leaderboard display command, got ${e}`, interaction, true);
        }
    }

    // @ts-ignore
    async handleDisplayCustomLeaderboardCommand(interaction, options, ignoreList = [])
    {
        try {
            const guildId = interaction.guildId;

            // @ts-ignore
            let profanity;
            let perCapita = false;

            // @ts-ignore
            options.forEach((opt) => {
                switch (opt.name) {
                    case `profanity`:
                        profanity = opt.value.toLowerCase();
                        break;
                    case `per_capita`:
                        perCapita = opt.value;
                        break;
                    default:
                        getCommonLogger().logErrorAsync(`Unexpected value when displaying custom leaderboard: ${opt.name}`);
                        break;
                }
            });

            // @ts-ignore
            let profanityMatches = [];
            profanityMatches[0] = profanity;

            // @ts-ignore
            profanities.every(entry => {
                // @ts-ignore
                if (entry.profanity === profanity) {
                    profanityMatches = entry.matches;
                    return false;
                }
                return true;
            });

            // @ts-ignore
            let customLeaders = [];
            const messages = Stenographer.getGuildMessages(guildId);

            // Calculate the totals
            messages.forEach(discordMsg => {
                const author = discordMsg.author;

                // @ts-ignore
                if (!ignoreList.includes(author)) {
                    // @ts-ignore
                    if (!(author in customLeaders)) {
                        // @ts-ignore
                        customLeaders[author] = 0;
                    }
        
                    // @ts-ignore
                    profanityMatches.every(regex => {
                        if (discordMsg.message.toLowerCase().match(regex) != null) {
                            // @ts-ignore
                            customLeaders[author]++;
                            return false;
                        }
                        return true;
                    });
                }
            });

            // Sort the totals for the leaderboard
            let sortedLeaders = [];
            // @ts-ignore
            for (const key of Object.keys(customLeaders)) {
                // @ts-ignore
                const count = customLeaders[key];
                if (count > 0)
                    sortedLeaders.push({ "author": key, "count": count });
            }
            sortedLeaders.sort((a, b) => {
                const a_total = perCapita ? Stenographer.getMessageCount(guildId, a.author) : 1;
                const b_total = perCapita ? Stenographer.getMessageCount(guildId, b.author) : 1;

                const left = a.count / a_total;
                const right = b.count / b_total;

                if (left > right) return -1;
                else if (left < right) return 1;
                else return 0;
            });
                

            try {
                const perCapitaString = perCapita ? `(per capita)` : `(total)`;

                let outputString =
                    "```" + `${profanity}` + ` Leaderboard ${perCapitaString}\n`
                    + "-------------------------\n";
                sortedLeaders.forEach(entry => {
                    outputString += `${entry.author}:`.padEnd(14, " ");
                    outputString += perCapita ? `${(100*(entry.count / Stenographer.getMessageCount(guildId, entry.author))).toPrecision(2)}%\n` : `${entry.count}\n`;
                });

                outputString += "```";

                await DiscordPlatform.editAndSplitReply(interaction, outputString);
            } catch (e) {
                getCommonLogger().logErrorAsync(`Exception getting profanity leaderboard, got ${e}`, interaction, true);
            }
        } catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to handle custom leaderboard, got ${e}`, interaction, true);
        }
    }
}

class LeaderboardCommand extends DiscordBotCommand {
    private _profanityLeaderboard: ProfanityLeaderboard = new ProfanityLeaderboard();
    profanityLeaderboard() { return this._profanityLeaderboard; }

    // @ts-ignore
    async handle(interaction)
    {
        using perfCounter = PerformanceCounter.Create("handleLeaderboardCommand(): ");

        try {
            await interaction.deferReply();

            for (let i = 0; i < interaction.options.data.length; i++) {
                const name = interaction.options.data[i].name;

                switch (name) {
                    case 'display':
                        await this._profanityLeaderboard.handleDisplayLeaderboardCommand(interaction, interaction.options.data[i].options);
                        break;
                    case 'custom':
                        // @ts-ignore
                        await this._profanityLeaderboard.handleDisplayCustomLeaderboardCommand(interaction, interaction.options.data[i].options, ["BOOBS", "BOOBS (Test)"]);
                        break;
                    default:
                        break;
                }
            }
        } catch (e) {
            await getCommonLogger().logErrorAsync(`Top level exception during vision, got error ${e}`, interaction, true);
        }        
    }

    get() {
        const leaderboardCommand = new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(`Leaderboard commands`)
            // Display leaderboard
            .addSubcommandGroup((group) =>
                group
                    .setName('display')
                    .setDescription('Display a leaderboard')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('leaderboard_name')
                            .setDescription('Leaderboard to display')
                            .addStringOption((option) =>
                                option
                                    .setName('leaderboard')
                                    .setDescription('Leaderboard to report')
                                    .addChoices(
                                        { name: 'profanity', value: 'profanity' },
                                        { name: 'profanity per capita', value: 'profanity-per-capita' },
                                    )
                                    .setRequired(true),
                            )

                    )
            
            )
            // Display custom leaderboard
            .addSubcommand(subcommand =>
                subcommand
                    .setName('custom')
                    .setDescription('Display a custom leaderboard')
                    .addStringOption((option) =>
                        option
                            .setName('profanity')
                            .setDescription('Profanity to display a leaderboard for (can be a regex)')
                            .setRequired(true),
                    )
                    .addBooleanOption((option) =>
                        option
                            .setName('per_capita')
                            .setDescription(`Generate a leaderboard relative to messages not raw totals`)
                            .setRequired(false)
                    )
            )
            ;

        return leaderboardCommand;
    }
}

import { ListenerManager } from '../listenermanager.js';
import { DiscordMessageCreateListener } from '../api/discordmessagelistener.js';

const leaderboardInstance = new LeaderboardCommand('leaderboard');
registerDiscordBotCommand(leaderboardInstance, false);

// Initial calculation of leaders
leaderboardInstance.profanityLeaderboard().recalculateProfanityLeaders();

class LeaderboardMessageListener implements DiscordMessageCreateListener {
    // @ts-ignore
    async onDiscordMessageCreate(runtimeData, message) {
        await leaderboardInstance.profanityLeaderboard().updateProfanityLeaderboard(message);
    }
}

ListenerManager.registerMessageCreateListener(new LeaderboardMessageListener());
