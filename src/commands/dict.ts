/*
    Manages the dict (dictionary) module where users can define words/phrases 
    and lookup definitions.
*/
// TODO: Remove Global here -- legacy issues
import { KoalaSlashCommandRequest } from '../koala-bot-interface/koala-slash-command.js';
import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js';
import { readJsonFile } from '../sys/jsonreader.js'
import { PerformanceCounter } from '../performancecounter.js';
import { getCommonLogger } from '../logging/logmanager.js'
import * as Discord from 'discord.js';
import fs from 'fs'

import config from 'config';

export class Dict {
    private dictData: any;
    private readonly dictDataPath: string;
    
    private static instance: Dict = new Dict();
    private constructor(dataPath = `${config.get<string>("Global.dataPath")}/dictdata.json`) {
        this.dictDataPath = dataPath;
    }

    static async init() {
        // Register the command itself, we can load the rest after the fact
        registerDiscordBotCommand(new DictCommand('dict'), false);
        registerDiscordBotCommand(new DefineCommand('define'), false);
        registerDiscordBotCommand(new IndexCommand('index'), false);

        Dict.instance.dictData = await readJsonFile(Dict.instance.dictDataPath);
        Dict.sortDictData();
    }

    /**
     * Sorts the dict data that's been loaded -- enforces ordering even if the
     * file has been edited outside the program
     */
    static sortDictData() {
        using perfCounter = PerformanceCounter.Create("sortDictData(): ");
        try {
            Dict.instance.dictData.sort((a: any, b: any) => {
                //console.log(sortDictData(): `${a.entry} compareTo ${b.entry} == ${a.entry.localeCompare(b.entry)}`);
                return a.entry.localeCompare(b.entry, undefined, { sensitivity: 'accent' })
            });
            getCommonLogger().logInfo(`Sorted ${this.getDictDataEntryCount()} dictionary items.`);
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to sort dict data, got ${e}`);
        }
        
    }

    static getDictDataEntryCount() {
        try {
            return Dict.instance.dictData.length;
        } catch (e) {
            getCommonLogger().logErrorAsync(`dict data not defined, got ${e}`);
            return 0;
        }
    }

    /**
     * Flush the dictionary data to disk in JSON format.
     * 
     * The data should flush out sorted, though it will be sorted on load just in case.
     */
    static async flushDictData() {
        using perfCounter = PerformanceCounter.Create("flushDictData(): ");
        try {
            const jsonString = JSON.stringify(Dict.instance.dictData, null, 2);
            fs.writeFile(Dict.instance.dictDataPath, jsonString, err => {
                if (err) {
                    getCommonLogger().logErrorAsync(`Error flushing dict data file, got ${err}`);
                    return false;
                } else {
                    getCommonLogger().logInfo('Successfully wrote dict data');
                    return true;
                }
            });
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to flush dict data to disk, got error ${e}`);
        }
        
    }

    /**
     * Binary search array.  If array is unsorted, behavior is undefined
     * @param { [object] } array - array of objects
     * @param {object} target - target object to find
     * @param {function(left,right)} compareFunc - Function comparing left and right
     * @returns the index of target in the array, -1 if not found
     */
    static getIndexOf(array: any, target: any, compareFunc: any) {
        try {
            let start = 0;
            let end = array.length - 1;
            let iterations = 0;

            while (start <= end) {
                let middle = Math.floor((start + end) / 2);

                let result = compareFunc(array[middle], target);
                //console.log(`getIndexOf(): compare(${array[middle]}, ${target}) == ${result}`);

                if (result === 0) {
                    return middle;
                } else if (result < 0) {
                    start = middle + 1;
                } else {
                    end = middle - 1;
                }
                iterations++;
            }
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to getIndexOf(${array},${target},${compareFunc}), got ${e}`);
        }

        return -1;
    }

    /**
     * Find the dictionary entryName and return the author and definition associated with it.
     * @param {string} entryName - Entry we're looking for
     * @returns { [string, string] } - Array containing author, definition.  Null if not found 
     */
    static findDictionaryEntry(entryName: any) {
        try {
            let result = this.getIndexOf(Dict.instance.dictData, entryName,
                (x: any, y: any) => {
                    const left = x.entry;
                    const right = y;
                    const result = left.localeCompare(right, undefined, { sensitivity: 'accent' });
                    //console.log(`findDictionaryEntry(): ${left} compareTo ${right} == ${result}`);

                    return result;
                });

            if (result != -1) {
                return { "author": Dict.instance.dictData[result].author, "definition": Dict.instance.dictData[result].definition };
            }
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to find dictionary entry ${entryName}, got ${e}`);
        }

        return null;
    }

    /**
     * Handles the /dict command
     * @param {Discord.interaction} interaction - interaction message to reply to
     */
    static async handleDictCommand(interaction: Discord.ChatInputCommandInteraction) {
        using perfCounter = PerformanceCounter.Create("handleDictCommand(): ");

        try {
            await interaction.deferReply();

            const slashCommandRequest = KoalaSlashCommandRequest.fromDiscordInteraction(interaction);

            if (interaction.options.data.length < 1) {
                await getCommonLogger().logErrorAsync(`Invalid interaction object sent to dict, data length 0!`, interaction, true);
                return;
            }

            const dictRequested = slashCommandRequest.getOptionValueString('phrase').trim();

            if (dictRequested == '') {
                await interaction.editReply("DICT entry for what, /dict WHAT");
                return;
            }

            const result = this.findDictionaryEntry(dictRequested);

            if (result != null) {
                await interaction.editReply(`**DICT:** **${dictRequested}** = ${result.definition} [added by: ${result.author}]`);
            } else {
                await interaction.editReply(`**DICT:** No definition for ${dictRequested}`);
            }
        } catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to handle DICT command, got error: ${e}`, interaction, true);
        }
        
    }

    /**
     * Handles the /define command
     * @param {Discord.interaction} interaction - discord interaction to reply to
     */
    static async handleDefineCommand(interaction: Discord.ChatInputCommandInteraction) {
        using perfCounter = PerformanceCounter.Create("handleDefineCommand(): ");

        try {
            if (interaction.options.data.length < 1) {
                await getCommonLogger().logErrorAsync(`Invalid interaction object sent to dict, data length 0!`, interaction);
                return;
            }

            if (interaction.options.data.length < 2) {
                await interaction.reply('Missing entries for define command, need phrase and definiton plzsir');
                getCommonLogger().logWarning(`Failed to get data for define command, got ${interaction.options.data}`);
                return;
            }

            let entryName: string = '', definition: string = '';

            interaction.options.data.forEach(option => {
                if (option.name === 'phrase') {
                    entryName = option.value!.toString().trim();
                } else if (option.name === 'definition') {
                    definition = option.value!.toString().trim();
                }
            });

            if (entryName == '') {
                await interaction.reply('Missing entry name for define command, need phrase to define.');
                return;
            }

            let existingEntry: any = this.findDictionaryEntry(entryName);

            if (existingEntry === null) {
                const newEntry =
                {
                    "author": interaction.user.username,
                    "entry": entryName,
                    "definition": definition
                }

                Dict.instance.dictData.push(newEntry);
                Dict.sortDictData(); // insertion sort would be faster but screw it I'm lazy
                Dict.flushDictData();

                await interaction.reply(`**DICT:** Definition for ${entryName} added successfully.`);
            } else {
                await interaction.reply(`**DICT:** Definition for ${entryName} already exists as: ${existingEntry[1]} by ${existingEntry[0]}`);
            }
        } catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to set definition, got error ${e}`, interaction);
        }

        
    }

    /**
     * Handles the /index command
     * @param {Discord.interaction} interaction - discord interaction to reply to
     */
    static async handleIndexCommand(interaction: Discord.ChatInputCommandInteraction) {
        using perfCounter = PerformanceCounter.Create("handleIndexCommand(): ");

        try {
            await interaction.deferReply();

            const search_string = interaction.options.data[0].value!.toString().trim().toLowerCase();

            const matches = Dict.instance.dictData.filter((entry: any) => entry.definition.toLowerCase().includes(search_string));

            let outputString;

            if (matches.length > 0) {
                outputString = `Search string ${search_string} found in entries: `;
                for (let i = 0; i < matches.length; i++) {
                    if (i > 0) {
                        outputString += ", ";
                    }
                    outputString += "\"" + matches[i].entry + "\"";
                }
            } else {
                outputString = `Search string ${search_string} not found in entries.`;
            }

            await interaction.editReply(outputString);

        } catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to handle index command, got error ${e}`);
        }

        
    }
}

class DictCommand extends DiscordBotCommand {
    async handle(interaction: Discord.ChatInputCommandInteraction) {
        return Dict.handleDictCommand(interaction);
    }

    get() {
        const dictCommand = new Discord.SlashCommandBuilder()
                        .setName(this.name())
                        .setDescription('Retrieve a definition')
                        .addStringOption((option) =>
                            option
                                .setName('phrase')
                                .setDescription('Phrase to look up')
                                .setRequired(true),
                        );

        return dictCommand;
    }
}

class DefineCommand extends DiscordBotCommand {
    async handle(interaction: Discord.ChatInputCommandInteraction) {
        return Dict.handleDefineCommand(interaction);
    }

    get() {
        // discord define command
        const defineCommand = new Discord.SlashCommandBuilder()
                .setName(this.name())
                .setDescription('Define a phrase')
                .addStringOption((option) =>
                    option
                        .setName('phrase')
                        .setDescription('Phrase to define')
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName('definition')
                        .setDescription('Definition of the phrase')
                        .setRequired(true),
                )
        ;

        return defineCommand
    }
}

class IndexCommand extends DiscordBotCommand {
    async handle(interaction: Discord.ChatInputCommandInteraction) {
        return Dict.handleIndexCommand(interaction);
    }

    get() {
        // discord index command
        const indexCommand = new Discord.SlashCommandBuilder()
                .setName(this.name())
                .setDescription("Search dict entries")
                .addStringOption((option) =>
                    option
                        .setName('search_string')
                        .setDescription('String to look for (case insensitive)')
                        .setRequired(true),
                )
        ;

        return indexCommand;
    }
}
