/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

    Manages the dict (dictionary) module where users can define words/phrases 
    and lookup definitions.

    Data is stored on disk in a JSON file and that data is always stored sorted.

    When new entries are added, the data is also immediately sorted.  This is done
    to make lookups O(logn) rather than devolving into O(n).
*/

import { Common } from '../common.js';
import dictData from './../data/dictdata.json' assert { type: 'json' }
import fs from 'fs'
import { SlashCommandBuilder } from 'discord.js';

/**
 * Sorts the dict data that's been loaded -- enforces ordering even if the
 * file has been edited outside the program
 */
function sortDictData()
{
    const start = Common.startTiming("sortDictData(): ");
    try {
        dictData.sort((a, b) => {
            a.entry.localeCompare(b.entry)
        });
    } catch (e) {
        Common.logError(`Failed to sort dict data, got ${e}`);
    }
    Common.endTiming(start);
}

function getDictDataEntryCount()
{
    try {
        return dictData.length;
    } catch (e) {
        Common.logError(`dict data not defined, got ${e}`);
        return 0;
    }
}

/**
 * Flush the dictionary data to disk in JSON format.
 * 
 * The data should flush out sorted, though it will be sorted on load just in case.
 */
async function flushDictData()
{
    const start = Common.startTiming("flushDictData(): ");
    try {
        const jsonString = JSON.stringify(dictData, null, 2);
        fs.writeFile('./data/dictdata.json', jsonString, err => {
            if (err) {
                Common.logError(`Error flushing dict data file, got ${err}`);
                return false;
            } else {
                Common.logInfo('Successfully wrote dict data');
                return true;
            }
        });
    } catch (e) {
        Common.logError(`Failed to flush dict data to disk, got error ${e}`);
    }
    Common.endTiming(start);
}

/**
 * 
 * @param {string} author - author of the dictionary entry
 * @returns copy of a default dictionary entry, null if fails
 */
function getDefaultDictEntry(author = "")
{
    return { "author": author, "entry": "", "definition": "" };
}

/**
 * Binary search array.  If array is unsorted, behavior is undefined
 * @param { [object] } array - array of objects
 * @param {object} target - target object to find
 * @param {function(left,right)} compareFunc - Function comparing left and right
 * @returns the index of target in the array, -1 if not found
 */
function getIndexOf(array, target, compareFunc)
{
    try {
        let start = 0;
        let end = array.length - 1;
        let iterations = 0;

        while (start <= end) {
            let middle = Math.floor((start + end) / 2);

            let result = compareFunc(array[middle], target);

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
        Common.logError(`Failed to getIndexOf(${array},${target},${compareFunc}), got ${e}`);
    }
    
    return -1;
}

/**
 * Find the dictionary entryName and return the author and definition associated with it.
 * @param {string} entryName - Entry we're looking for
 * @returns { [string, string] } - Array containing author, definition.  Null if not found 
 */
function findDictionaryEntry(entryName)
{
    try {
        let result = getIndexOf(dictData, entryName,
            (x, y) => {
                const left = x.entry.toLowerCase();
                const right = y.toLowerCase();

                return left.localeCompare(right);
            });

        if (result != -1) {
            return { "author": dictData[result].author, "definition": dictData[result].definition };
        }
    } catch (e) {
        Common.logError(`Failed to find dictionary entry ${entryName}, got ${e}`);
    }

    return null;
}

/**
 * Handles the /dict command
 * @param {Discord.interaction} interaction - interaction message to reply to
 */
async function handleDictCommand(interaction)
{
    const start = Common.startTiming("handleDictCommand(): ");

    try {
        await interaction.deferReply();

        if (interaction.options.data.length < 1) {
            await Common.logError(`Invalid interaction object sent to dict, data length 0!`, interaction, true);
            return;
        }

        const dictRequested = interaction.options.data[0].value.trim();

        if (dictRequested == '') {
            await interaction.editReply("DICT entry for what, /dict WHAT");
            return;
        }

        const result = findDictionaryEntry(dictRequested);

        if (result != null) {
            await interaction.editReply(`**DICT:** **${dictRequested}** = ${result.definition} [added by: ${result.author}]`);
        } else {
            await interaction.editReply(`**DICT:** No definition for ${dictRequested}`);
        }
    } catch (e) {
        await Common.logError(`Failed to handle DICT command, got error: ${e}`, interaction, true);
    }
    Common.endTiming(start);
}

/**
 * Handles the /define command
 * @param {Discord.interaction} interaction - discord interaction to reply to
 */
async function handleDefineCommand(interaction)
{
    const start = Common.startTiming("handleDefineCommand(): ");

    try {
        if (interaction.options.data.length < 1) {
            await Common.logError(`Invalid interaction object sent to dict, data length 0!`, interaction);
            return;
        }

        if (interaction.options.data.length < 2)
        {
            await interaction.reply('Missing entries for define command, need phrase and definiton plzsir');
            Common.logWarning(`Failed to get data for define command, got ${options.data}`);
            return;
        }

        const entryName = interaction.options.data[0].value.trim();
        const definition = interaction.options.data[1].value.trim();
        let existingEntry = findDictionaryEntry(entryName);

        if (existingEntry === null) {
            let newEntry = getDefaultDictEntry(interaction.user.username);
            newEntry.entry = entryName;
            newEntry.definition = definition;

            dictData.push(newEntry);
            sortDictData(); // insertion sort would be faster but screw it I'm lazy
            flushDictData();

            await interaction.reply(`**DICT:** Definition for ${entryName} added successfully.`);
        } else {
            await interaction.reply(`**DICT:** Definition for ${entryName} already exists as: ${existingEntry[1]} by ${existingEntry[0]}`);
        }
    } catch (e) {
        await Common.logError(`Failed to set definition, got error ${e}`, interaction);
    }

    Common.endTiming(start);
}

/**
 * Handles the /index command
 * @param {Discord.interaction} interaction - discord interaction to reply to
 */
async function handleIndexCommand(interaction)
{
    const start = Common.startTiming("handleIndexCommand(): ");

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
        await Common.logError(`Failed to handle index command, got error ${e}`);
    }

    Common.endTiming(start);
}

// discord dict command
const dictCommand = new SlashCommandBuilder()
        .setName('dict')
        .setDescription('Retrieve a definition')
        .addStringOption((option) =>
            option
                .setName('phrase')
                .setDescription('Phrase to look up')
                .setRequired(true),
        )    
;

// discord define command
const defineCommand = new SlashCommandBuilder()
        .setName('define')
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

// discord index command
const indexCommand = new SlashCommandBuilder()
        .setName('index')
        .setDescription("Search dict entries")
        .addStringOption((option) =>
            option
                .setName('search_string')
                .setDescription('String to look for (case insensitive)')
                .setRequired(true),
        )
;

// register the dict command
function registerDictCommand(client)
{
    const dict = 
    {
        data: dictCommand,
        async execute(interaction) {
            await handleDictCommand(interaction);
        }
    }

    client.commands.set(dict.data.name, dict);
}

// retrieve the dict command as JSON
function getDictJSON()
{
    return dictCommand.toJSON();
}

// register the define command
function registerDefineCommand(client)
{
    const define = 
    {
        data: defineCommand,
        async execute(interaction) {
            await handleDefineCommand(interaction);
        }
    }

    client.commands.set(define.data.name, define);
}

// retrieve the define command as JSON
function getDefineJSON()
{
    return defineCommand.toJSON();
}

// register the index command
function registerIndexCommand(client)
{
    const index = 
    {
        data: indexCommand,
        async execute(interaction) {
            await handleIndexCommand(interaction);
        }
    }

    client.commands.set(index.data.name, index);
}

// retrieve the index command as JSON
function getIndexJSON()
{
    return indexCommand.toJSON();
}

Common.registerCommandModule(registerDictCommand, getDictJSON);
Common.registerCommandModule(registerDefineCommand, getDefineJSON);
Common.registerCommandModule(registerIndexCommand, getIndexJSON);

export { sortDictData, getDictDataEntryCount }
