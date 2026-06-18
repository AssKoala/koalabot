/*
    Manages the dict (dictionary) module where users can define words/phrases 
    and lookup definitions.
*/
// TODO: Remove Global here -- legacy issues
import { KoalaSlashCommandRequest } from '../koala-bot-interface/koala-slash-command.js';
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js';
import { readJsonFile } from '../sys/jsonreader.js'
import { PerformanceCounter } from '../performancecounter.js';
import { getCommonLogger } from '../logging/logmanager.js'
import { DiscordPlatform }  from '../platform/discord/discordplatform.js';
import * as Discord from 'discord.js';
import fs from 'fs/promises';

import config from 'config';

type DictEntry = {
    author: string;
    entry: string;
    definition: string;
}

export class Dict {
    private dictMap: Map<string, DictEntry> = new Map<string, DictEntry>();    
    private readonly dictDataPath: string;
    
    private static instance: Dict = new Dict();
    private static get(): Dict { return Dict.instance; }

    private constructor(dataPath = `${config.get("Global.dataPath")}/dictdata.json`) {
        this.dictDataPath = dataPath;
    }

    static async init() {
        // Register the command itself, we can load the rest after the fact
        registerDiscordBotCommand(new DictCommand('dict'), false);
        registerDiscordBotCommand(new DefineCommand('define'), false);
        registerDiscordBotCommand(new IndexCommand('index'), false);

        await Dict.reloadDictData();
    }

    static getDictDataEntryCount() {
        try {
            return Dict.get().dictMap.size;
        } catch (e) {
            getCommonLogger().logErrorAsync(`dict data not defined, got ${e}`);
            return 0;
        }
    }

    static async clearDictData(flush: boolean = false) {
        Dict.get().dictMap.clear();
        
        if (flush) {
            return Dict.flushDictData();
        }

        return true;
    }

    static async reloadDictData() {
        using _perfCounter = PerformanceCounter.Create("reloadDictData(): ");

        const rawDictData = await readJsonFile(Dict.instance.dictDataPath) as DictEntry[];

        if (rawDictData != undefined) {
            await Dict.clearDictData();
            for (const entry of rawDictData) {
                Dict.get().dictMap.set(entry.entry.toLocaleLowerCase(), entry);
            }
        }
    }

    /**
     * Flush the dictionary data to disk in JSON format.
     * 
     * The data should flush out sorted, though it will be sorted on load just in case.
     */
    static async flushDictData() {
        using _perfCounter = PerformanceCounter.Create("flushDictData(): ");

        try {
            const jsonString = JSON.stringify(Array.from(Dict.get().dictMap.values()), null, 2);
            await fs.writeFile(Dict.get().dictDataPath, jsonString);
            getCommonLogger().logInfo('Successfully wrote dict data');
            return true;
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to flush dict data to disk, got error ${e}`);
            return false;
        }
    }

    static findDictionaryEntry(entryName: string): DictEntry | undefined {
        return this.get().dictMap.get(entryName.toLocaleLowerCase());
    }

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

            if (result != undefined) {
                await interaction.editReply(`**DICT:** **${dictRequested}** = ${result.definition} [added by: ${result.author}]`);
            } else {
                await interaction.editReply(`**DICT:** No definition for ${dictRequested}`);
            }
        } catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to handle DICT command, got error: ${e}`, interaction, true);
        }
        
    }

    static async handleDefineCommand(interaction: Discord.ChatInputCommandInteraction) {
        using perfCounter = PerformanceCounter.Create("handleDefineCommand(): ");

        try {
            await interaction.deferReply();

            if (interaction.options.data.length < 1) {
                await getCommonLogger().logErrorAsync(`Invalid interaction object sent to dict, data length 0!`, interaction);
                return;
            }

            if (interaction.options.data.length < 2) {
                await interaction.editReply('Missing entries for define command, need phrase and definiton plzsir');
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
                await interaction.editReply('Missing entry name for define command, need phrase to define.');
                return;
            }

            const existingEntry = this.findDictionaryEntry(entryName);

            if (existingEntry === undefined) {
                const newEntry =
                {
                    "author": interaction.user.username,
                    "entry": entryName,
                    "definition": definition
                }
                this.get().dictMap.set(entryName.toLocaleLowerCase(), newEntry);
                const success = await Dict.flushDictData();

                if (success) {
                    await interaction.editReply(`**DICT:** Definition for ${entryName} added successfully.`);
                } else {
                    await interaction.editReply(`**DICT:** Definition for ${entryName} added successfully. However, failed to flush data to disk, so it may not be saved, check error logs for details.`);
                }
                
            } else {
                await interaction.editReply(`**DICT:** Definition for ${entryName} already exists as: ${existingEntry.definition} by ${existingEntry.author}`);
            }
        } catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to set definition, got error ${e}`, interaction, true);
        }        
    }

    static async handleIndexCommand(interaction: Discord.ChatInputCommandInteraction) {
        using perfCounter = PerformanceCounter.Create("handleIndexCommand(): ");

        try {
            await interaction.deferReply();

            const search_string = interaction.options.data[0].value!.toString().trim().toLowerCase();

            const dictMatches = Array.from(this.get().dictMap.values()).filter((entry: DictEntry) => entry.entry.toLowerCase().includes(search_string));
            const defMatches = Array.from(this.get().dictMap.values()).filter((entry: DictEntry) => entry.definition.toLowerCase().includes(search_string));

            let outputString = '';

            if (dictMatches.length > 0) {
                outputString += `Search string ${search_string} found in entry name(s): `;
                for (let i = 0; i < dictMatches.length; i++) {
                    if (i > 0) {
                        outputString += ", ";
                    }
                    outputString += "\"" + dictMatches[i].entry + "\"";
                }
                outputString += "\n";
            } else {
                outputString += `Search string ${search_string} not found in entries.\n`;
            }

            if (defMatches.length > 0) {
                outputString += `Search string ${search_string} found in definition(s) for: `;
                for (let i = 0; i < defMatches.length; i++) {
                    if (i > 0) {
                        outputString += ", ";
                    }
                    outputString += "\"" + defMatches[i].entry + "\"";
                }
                outputString += "\n";
            } else {
                outputString += `Search string ${search_string} not found in definitions.\n`;
            }

            outputString += "Use /dict [entry] to see the definition.";

            await DiscordPlatform.editAndSplitReply(interaction, outputString);

        } catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to handle index command, got error ${e}`, interaction, true);
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

    override async onConfigReload(): Promise<void> {
        return Dict.reloadDictData();
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
