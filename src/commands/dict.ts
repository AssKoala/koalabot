/*
    Manages the dict (dictionary) module where users can define words/phrases 
    and lookup definitions.
*/
// TODO: Remove Global here -- legacy issues
import { Global } from '../global.js';
import fs from 'fs'
import { SlashCommandBuilder } from 'discord.js';
import { KoalaSlashCommandRequest } from '../koala-bot-interface/koala-slash-command.js';
import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from '../api/DiscordBotCommand.js';

const dictDataPath = `${Global.settings().get("DATA_PATH")}/dictdata.json`
const dictData = await Global.readJsonFile(dictDataPath);

class Dict {

    static init() {
        this.sortDictData();
    }

    /**
     * Sorts the dict data that's been loaded -- enforces ordering even if the
     * file has been edited outside the program
     */
    static sortDictData() {
        using perfCounter = Global.getPerformanceCounter("sortDictData(): ");
        try {
            dictData.sort((a, b) => {
                //console.log(sortDictData(): `${a.entry} compareTo ${b.entry} == ${a.entry.localeCompare(b.entry)}`);
                return a.entry.localeCompare(b.entry, undefined, { sensitivity: 'accent' })
            });
            Global.logger().logInfo(`Sorted ${this.getDictDataEntryCount()} dictionary items.`);
        } catch (e) {
            Global.logger().logError(`Failed to sort dict data, got ${e}`);
        }
        
    }

    static getDictDataEntryCount() {
        try {
            return dictData.length;
        } catch (e) {
            Global.logger().logError(`dict data not defined, got ${e}`);
            return 0;
        }
    }

    /**
     * Flush the dictionary data to disk in JSON format.
     * 
     * The data should flush out sorted, though it will be sorted on load just in case.
     */
    static async flushDictData() {
        using perfCounter = Global.getPerformanceCounter("flushDictData(): ");
        try {
            const jsonString = JSON.stringify(dictData, null, 2);
            fs.writeFile(dictDataPath, jsonString, err => {
                if (err) {
                    Global.logger().logError(`Error flushing dict data file, got ${err}`);
                    return false;
                } else {
                    Global.logger().logInfo('Successfully wrote dict data');
                    return true;
                }
            });
        } catch (e) {
            Global.logger().logError(`Failed to flush dict data to disk, got error ${e}`);
        }
        
    }

    /**
     * Binary search array.  If array is unsorted, behavior is undefined
     * @param { [object] } array - array of objects
     * @param {object} target - target object to find
     * @param {function(left,right)} compareFunc - Function comparing left and right
     * @returns the index of target in the array, -1 if not found
     */
    static getIndexOf(array, target, compareFunc) {
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
            Global.logger().logError(`Failed to getIndexOf(${array},${target},${compareFunc}), got ${e}`);
        }

        return -1;
    }

    /**
     * Find the dictionary entryName and return the author and definition associated with it.
     * @param {string} entryName - Entry we're looking for
     * @returns { [string, string] } - Array containing author, definition.  Null if not found 
     */
    static findDictionaryEntry(entryName) {
        try {
            let result = this.getIndexOf(dictData, entryName,
                (x, y) => {
                    const left = x.entry;
                    const right = y;
                    const result = left.localeCompare(right, undefined, { sensitivity: 'accent' });
                    //console.log(`findDictionaryEntry(): ${left} compareTo ${right} == ${result}`);

                    return result;
                });

            if (result != -1) {
                return { "author": dictData[result].author, "definition": dictData[result].definition };
            }
        } catch (e) {
            Global.logger().logError(`Failed to find dictionary entry ${entryName}, got ${e}`);
        }

        return null;
    }

    /**
     * Handles the /dict command
     * @param {Discord.interaction} interaction - interaction message to reply to
     */
    static async handleDictCommand(interaction) {
        using perfCounter = Global.getPerformanceCounter("handleDictCommand(): ");

        try {
            await interaction.deferReply();

            const slashCommandRequest = KoalaSlashCommandRequest.fromDiscordInteraction(interaction);

            if (interaction.options.data.length < 1) {
                await Global.logger().logError(`Invalid interaction object sent to dict, data length 0!`, interaction, true);
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
            await Global.logger().logError(`Failed to handle DICT command, got error: ${e}`, interaction, true);
        }
        
    }

    /**
     * Handles the /define command
     * @param {Discord.interaction} interaction - discord interaction to reply to
     */
    static async handleDefineCommand(interaction) {
        using perfCounter = Global.getPerformanceCounter("handleDefineCommand(): ");

        try {
            if (interaction.options.data.length < 1) {
                await Global.logger().logError(`Invalid interaction object sent to dict, data length 0!`, interaction);
                return;
            }

            if (interaction.options.data.length < 2) {
                await interaction.reply('Missing entries for define command, need phrase and definiton plzsir');
                Global.logger().logWarning(`Failed to get data for define command, got ${interaction.options.data}`);
                return;
            }

            const entryName = interaction.options.data[0].value.trim();
            const definition = interaction.options.data[1].value.trim();
            let existingEntry = this.findDictionaryEntry(entryName);

            if (existingEntry === null) {
                const newEntry =
                {
                    "author": interaction.user.username,
                    "entry": entryName,
                    "definition": definition
                }

                dictData.push(newEntry);
                Dict.sortDictData(); // insertion sort would be faster but screw it I'm lazy
                Dict.flushDictData();

                await interaction.reply(`**DICT:** Definition for ${entryName} added successfully.`);
            } else {
                await interaction.reply(`**DICT:** Definition for ${entryName} already exists as: ${existingEntry[1]} by ${existingEntry[0]}`);
            }
        } catch (e) {
            await Global.logger().logError(`Failed to set definition, got error ${e}`, interaction);
        }

        
    }

    /**
     * Handles the /index command
     * @param {Discord.interaction} interaction - discord interaction to reply to
     */
    static async handleIndexCommand(interaction) {
        using perfCounter = Global.getPerformanceCounter("handleIndexCommand(): ");

        try {
            await interaction.deferReply();

            const search_string = interaction.options.data[0].value.trim().toLowerCase();

            const matches = dictData.filter(entry => entry.definition.toLowerCase().includes(search_string));

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
            await Global.logger().logError(`Failed to handle index command, got error ${e}`);
        }

        
    }
}

class DictCommand extends DiscordBotCommand {
    async handle(interaction) {
        return Dict.handleDictCommand(interaction);
    }

    get() {
        const dictCommand = new SlashCommandBuilder()
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
    async handle(interaction) {
        return Dict.handleDefineCommand(interaction);
    }

    get() {
        // discord define command
        const defineCommand = new SlashCommandBuilder()
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
    async handle(interaction) {
        return Dict.handleIndexCommand(interaction);
    }

    get() {
        // discord index command
        const indexCommand = new SlashCommandBuilder()
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

Dict.init();
registerDiscordBotCommand(new DictCommand('dict'), false);
registerDiscordBotCommand(new DefineCommand('define'), false);
registerDiscordBotCommand(new IndexCommand('index'), false);

export { Dict }//sortDictData, getDictDataEntryCount }
