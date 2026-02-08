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
import { DatabaseManager } from '../db/databasemanager.js';
import { LeaderboardRepository } from '../db/leaderboardrepository.js';

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
    _leaderboardMap: Map<string, Map<string, ProfanityStats>> = new Map<string, Map<string, ProfanityStats>>();
    
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
        // @ts-expect-error todo cleanup tech debt
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
                // @ts-expect-error todo cleanup tech debt
                profanities.forEach(profanity => {
                    profanityLeaders.get(author)!.set(profanity.profanity, 0);
                });
            }        

            profanities.forEach((profanity: any) => {
                let currentLeader = this.getProfanityLeader(guildId, profanityLeaders, profanity.profanity);

                profanity.matches.every((regex: string) => {
                    if (discordStenographerMsg.message.toLowerCase().match(regex) != null) {
                        profanityLeaders.get(author)!.add(profanity.profanity);

                        // Fire-and-forget DB persistence
                        if (DatabaseManager.isAvailable()) {
                            LeaderboardRepository.incrementWordCount(guildId, author, profanity.profanity).catch(() => {});
                        }

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

        // @ts-expect-error todo cleanup tech debt
        return result;
    }

    // @ts-expect-error todo cleanup tech debt
    getProfanityLeader(guildId, profanityLeaders, profanity, perCapita = false, ignoreList = [])
    {
        try {
            let leader = null;
            let count = 0;
            let leaderMessageCount = 0;

            for (const [author, profanityStats] of profanityLeaders) {
                // @ts-expect-error todo cleanup tech debt
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

    // @ts-expect-error todo cleanup tech debt
    async showProfanityLeaderboard(interaction, perCapita = false)
    {
        try {
            const perCapitaString = perCapita ? `(per capita)` : `(total)`;

            const profanityLeaders = this._leaderboardMap.get(interaction.guildId);

            let outputString =
                "```Profanity Leaderboard " + `${perCapitaString}\n`
                + "-------------------------\n";
            
            // @ts-expect-error todo cleanup tech debt
            profanities.forEach(profanity => {
                // @ts-expect-error todo cleanup tech debt
                const lead = this.getProfanityLeader(interaction.guildId, profanityLeaders, profanity.profanity, perCapita, [Global.settings().get("BOT_NAME")] );

                outputString += `${profanity.profanity}(s):`.padEnd(12, " ");

                if (lead.count != 0) {
                    // @ts-expect-error todo cleanup tech debt
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

    // @ts-expect-error todo cleanup tech debt
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

                // @ts-expect-error todo cleanup tech debt
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

    // @ts-expect-error todo cleanup tech debt
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

    // @ts-expect-error todo cleanup tech debt
    async handleDisplayCustomLeaderboardCommand(interaction, options, ignoreList = [])
    {
        try {
            const guildId = interaction.guildId;

            // @ts-expect-error todo cleanup tech debt
            let profanity;
            let perCapita = false;

            // @ts-expect-error todo cleanup tech debt
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

            // @ts-expect-error todo cleanup tech debt
            let profanityMatches = [];
            profanityMatches[0] = profanity;

            // @ts-expect-error todo cleanup tech debt
            profanities.every(entry => {
                // @ts-expect-error todo cleanup tech debt
                if (entry.profanity === profanity) {
                    profanityMatches = entry.matches;
                    return false;
                }
                return true;
            });

            // @ts-expect-error todo cleanup tech debt
            let customLeaders = [];
            const messages = Stenographer.getGuildMessages(guildId);

            // Calculate the totals
            messages.forEach(discordMsg => {
                const author = discordMsg.author;

                // @ts-expect-error todo cleanup tech debt
                if (!ignoreList.includes(author)) {
                    // @ts-expect-error todo cleanup tech debt
                    if (!(author in customLeaders)) {
                        // @ts-expect-error todo cleanup tech debt
                        customLeaders[author] = 0;
                    }
        
                    // @ts-expect-error todo cleanup tech debt
                    profanityMatches.every(regex => {
                        if (discordMsg.message.toLowerCase().match(regex) != null) {
                            // @ts-expect-error todo cleanup tech debt
                            customLeaders[author]++;
                            return false;
                        }
                        return true;
                    });
                }
            });

            // Sort the totals for the leaderboard
            let sortedLeaders = [];
            // @ts-expect-error todo cleanup tech debt
            for (const key of Object.keys(customLeaders)) {
                // @ts-expect-error todo cleanup tech debt
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

    // @ts-expect-error todo cleanup tech debt
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
                        // @ts-expect-error todo cleanup tech debt
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

// Bulk-import in-memory leaderboard data to DB on first startup
if (DatabaseManager.isAvailable()) {
    (async () => {
        try {
            const rows: { guildId: string; userName: string; word: string; count: number }[] = [];
            const guildCaches = Stenographer.getAllGuildCaches();

            for (const [guildId, _cache] of guildCaches) {
                const profanityLeaders = leaderboardInstance.profanityLeaderboard()._leaderboardMap.get(guildId);
                if (!profanityLeaders) continue;

                for (const [author, stats] of profanityLeaders) {
                    profanities.forEach((profanity: any) => {
                        const count = stats.get(profanity.profanity);
                        if (count && count > 0) {
                            rows.push({ guildId, userName: author, word: profanity.profanity, count });
                        }
                    });
                }
            }

            if (rows.length > 0) {
                await LeaderboardRepository.bulkUpsert(rows);
            }

            // Also bulk-import message counts
            const countRows: { guildId: string; userName: string; count: number }[] = [];
            for (const [guildId, cache] of guildCaches) {
                for (const [author, count] of cache.getAuthorCounts()) {
                    if (count > 0) {
                        countRows.push({ guildId, userName: author, count });
                    }
                }
            }

            if (countRows.length > 0) {
                await LeaderboardRepository.bulkUpsertMessageCounts(countRows);
            }

            // Load DB data back into in-memory map (DB has lifetime-accurate counts)
            const leaderboardMap = leaderboardInstance.profanityLeaderboard()._leaderboardMap;
            for (const [guildId] of guildCaches) {
                const dbRows = await LeaderboardRepository.getAllForGuild(guildId);
                if (dbRows.length === 0) continue;

                if (!leaderboardMap.has(guildId)) {
                    leaderboardMap.set(guildId, new Map());
                }
                const guildLeaders = leaderboardMap.get(guildId)!;

                for (const row of dbRows) {
                    if (!guildLeaders.has(row.user_name)) {
                        guildLeaders.set(row.user_name, new ProfanityStats());
                        // Initialize all profanity slots
                        profanities.forEach((profanity: any) => {
                            guildLeaders.get(row.user_name)!.set(profanity.profanity, 0);
                        });
                    }
                    const currentCount = guildLeaders.get(row.user_name)!.get(row.word) ?? 0;
                    if (row.count > currentCount) {
                        guildLeaders.get(row.user_name)!.set(row.word, row.count);
                    }
                }

                // Load lifetime message counts from DB into the Stenographer cache
                // This fixes per-capita calculations: without this, profanity counts are
                // lifetime-accurate (from DB) but message counts only reflect the capped
                // log cache, producing inflated per-capita percentages after restart.
                const dbMessageCounts = await LeaderboardRepository.getAllMessageCountsForGuild(guildId);
                for (const row of dbMessageCounts) {
                    const cacheCount = Stenographer.getMessageCount(guildId, row.user_name);
                    if (row.count > cacheCount) {
                        Stenographer.setGuildAuthorMessageCount(guildId, row.user_name, row.count);
                    }
                }
            }
            getCommonLogger().logInfo('Leaderboard: Loaded lifetime counts from database.');
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to bulk-import leaderboard data to DB: ${e}`);
        }
    })();
}

class LeaderboardMessageListener implements DiscordMessageCreateListener {
    // @ts-expect-error todo cleanup tech debt
    async onDiscordMessageCreate(runtimeData, message) {
        await leaderboardInstance.profanityLeaderboard().updateProfanityLeaderboard(message);
    }
}

ListenerManager.registerMessageCreateListener(new LeaderboardMessageListener());
