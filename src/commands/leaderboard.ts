/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

    Allows querying the bot for leaderboard stuff.
*/

import { Global } from '../global.js';
import { Logger } from '../logging/logger.js';
import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js'
import { Stenographer, DiscordStenographerMessage } from '../helpers/discordstenographer.js';

const profanities = await Global.readJsonFile(`${Global.settings().get("DATA_PATH")}/profanity.json`);

let profanityLeaders = [];

function recalculateProfanityLeaders()
{
    using perfCounter = Global.getPerformanceCounter("recalculateProfanityLeaders(): ");

    profanityLeaders = [];

    try {
        const messages = Stenographer.getMessages();

        messages.forEach(entry => {
            addMessageToProfanityLeaderboard(entry);
        });
    } catch (e) {
        Global.logger().logError(`Failed to calculate profanity leaders, got ${e}`);
    }

    
}

function addMessageToProfanityLeaderboard(discordStenographerMsg)
{
    let result = [];

    try {
        const author = discordStenographerMsg.author;

        if (!(author in profanityLeaders)) {
            profanityLeaders[author] = [];
            profanities.forEach(profanity => {

                profanityLeaders[author][profanity.profanity] = 0;
            });
        }        

        profanities.forEach(profanity => {
            let currentLeader = getProfanityLeader(profanity.profanity);

            profanity.matches.every(regex => {
                if (discordStenographerMsg.message.toLowerCase().match(regex) != null) {
                    profanityLeaders[author][profanity.profanity]++;
                    return false;
                }
                return true;
            });

            let newLeader = getProfanityLeader(profanity.profanity);

            if (!(currentLeader["leader"] === newLeader["leader"])) {
                result.push({ "profanity": profanity.profanity, "leader": newLeader["leader"], "old_leader": currentLeader["leader"] });
            }
        });
    } catch (e) {
        Global.logger().logError(`Failed to add message to profanity leaderboard, got ${e}`);
        result = [];
    }

    return result;
}

function getProfanityLeader(profanity, perCapita = false, ignoreList = [])
{
    try {
        let leader = null;
        let count = 0;
        let leaderMessageCount = 0;

        for (const key of Object.keys(profanityLeaders)) {
            if (ignoreList.includes(key)) continue;

            const keyTotalMessages = Stenographer.getMessageCount(key);

            if (leader != null) {
                if ((!perCapita && count < profanityLeaders[key][profanity])
                    || (perCapita && (count / leaderMessageCount) < (profanityLeaders[key][profanity] / keyTotalMessages))
                ) {
                    count = profanityLeaders[key][profanity];
                    leader = key;
                    leaderMessageCount = keyTotalMessages;
                }
            } else {
                leader = key;
                count = profanityLeaders[key][profanity];
                leaderMessageCount = keyTotalMessages;
            }
        };

        return { "leader": leader, "count": count, "total": leaderMessageCount };
    } catch (e) {
        Global.logger().logError(`Failed to get profanity leader for ${profanity}, got error ${e}`);
    }

    return { "leader": "error", "count": 0 };
};

async function showProfanityLeaderboard(interaction, perCapita = false)
{
    try {
        const perCapitaString = perCapita ? `(per capita)` : `(total)`;

        let outputString =
            "```Profanity Leaderboard " + `${perCapitaString}\n`
            + "-------------------------\n";
        profanities.forEach(profanity => {
            const lead = getProfanityLeader(profanity.profanity, perCapita, [ "BOOBS", "BOOBS (Test)"] );

            const perCapitaValue = lead["count"] / lead["total"] * 100;

            outputString += `${profanity.profanity}(s):`.padEnd(12, " ");

            if (perCapita) outputString += `${lead["leader"]} with ${perCapitaValue.toPrecision(2)}%\n`;
            else outputString += `${lead["leader"]} with ${lead["count"]}\n`;
        });

        outputString += "```";

        await Global.editAndSplitReply(interaction, outputString);
    } catch (e) {
        Global.logger().logError(`Exception getting profanity leaderboard, got ${e}`, interaction, true);
    }
}

function updateProfanityLeaderboard(message)
{
    using perfCounter = Global.getPerformanceCounter("updateProfanityLeaderboard(): ");

    try {
        if (message.author.bot) return;

        const stdMsg = Logger.getStandardDiscordMessageFormat(message);
        let discordStenographerMsg = DiscordStenographerMessage.parseFromStandardMessageFormat(stdMsg);

        const result = addMessageToProfanityLeaderboard(discordStenographerMsg);

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
        Global.logger().logError(`Failed to update profanity leaderboard, got ${e}`);
    }

    
}

async function handleDisplayLeaderboardCommand(interaction, options)
{
    try {
        for (let i = 0; i < options.length; i++) {
            const leaderboardName = options[i].options[0].value;

            switch (leaderboardName) {
                case 'profanity':
                    await showProfanityLeaderboard(interaction);
                    break;
                case 'profanity-per-capita':
                    await showProfanityLeaderboard(interaction, true);
                    break;
                default:
                    break;
            }
        }
        
    } catch (e) {
        await Global.logger().logError(`Failed to handle leaderboard display command, got ${e}`, interaction, true);
    }
    
}

async function handleDisplayCustomLeaderboardCommand(interaction, options, ignoreList = [])
{
    try {
        let profanity;
        let perCapita = false;

        options.forEach((opt) => {
            switch (opt.name) {
                case `profanity`:
                    profanity = opt.value.toLowerCase();
                    break;
                case `per_capita`:
                    perCapita = opt.value;
                    break;
                default:
                    Global.logger().logError(`Unexpected value when displaying custom leaderboard: ${opt.name}`);
                    break;
            }
        });

        let profanityMatches = [];
        profanityMatches[0] = profanity;

        profanities.every(entry => {
            if (entry.profanity === profanity) {
                profanityMatches = entry.matches;
                return false;
            }
            return true;
        });

        let customLeaders = [];
        const messages = Stenographer.getMessages();

        // Calculate the totals
        messages.forEach(discordMsg => {
            const author = discordMsg.author;

            if (!ignoreList.includes(author)) {
                if (!(author in customLeaders)) {
                    customLeaders[author] = 0;
                }
    
                profanityMatches.every(regex => {
                    if (discordMsg.message.toLowerCase().match(regex) != null) {
                        customLeaders[author]++;
                        return false;
                    }
                    return true;
                });
            }
        });

        // Sort the totals for the leaderboard
        let sortedLeaders = [];
        for (const key of Object.keys(customLeaders)) {
            const count = customLeaders[key];
            if (count > 0)
                sortedLeaders.push({ "author": key, "count": count });
        }
        sortedLeaders.sort((a, b) => {
            const a_total = perCapita ? Stenographer.getMessageCount(a.author) : 1;
            const b_total = perCapita ? Stenographer.getMessageCount(b.author) : 1;

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
                outputString += perCapita ? `${(100*(entry.count / Stenographer.getMessageCount(entry.author))).toPrecision(2)}%\n` : `${entry.count}\n`;
            });

            outputString += "```";

            await Global.editAndSplitReply(interaction, outputString);
        } catch (e) {
            Global.logger().logError(`Exception getting profanity leaderboard, got ${e}`, interaction, true);
        }
    } catch (e) {
        await Global.logger().logError(`Failed to handle custom leaderboard, got ${e}`, interaction, true);
    }
}

async function handleLeaderboardCommand(interaction)
{
    using perfCounter = Global.getPerformanceCounter("handleLeaderboardCommand(): ");

    try {
        await interaction.deferReply();

        for (let i = 0; i < interaction.options.data.length; i++) {
            const name = interaction.options.data[i].name;

            switch (name) {
                case 'display':
                    await handleDisplayLeaderboardCommand(interaction, interaction.options.data[i].options);
                    break;
                case 'custom':
                    await handleDisplayCustomLeaderboardCommand(interaction, interaction.options.data[i].options, ["BOOBS", "BOOBS (Test)"]);
                    break;
                default:
                    break;
            }
        }
    } catch (e) {
        await Global.logger().logError(`Top level exception during vision, got error ${e}`, interaction, true);
    }

    
}

function getLeaderboardCommand() {
    const leaderboardCommand = new SlashCommandBuilder()
        .setName('leaderboard')
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

function getLeaderboardJSON() {
    return getLeaderboardCommand().toJSON();
}

function registerLeaderboardCommand(client) {
    const leaderboard =
    {
        data: getLeaderboardCommand(),
        async execute(interaction) {
            await handleLeaderboardCommand(interaction);
        }
    }

    client.commands.set(leaderboard.data.name, leaderboard);

    // Initial calculation for profanity leaderboard
    recalculateProfanityLeaders();

    // Register for messages so we can update on the fly
    Global.bot().registerMessageListener(updateProfanityLeaderboard);
}

Global.registerCommandModule(registerLeaderboardCommand, getLeaderboardJSON);