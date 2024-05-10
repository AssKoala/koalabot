/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

    Allows querying the bot for system stuff.
*/

import { Common } from '../common.js';
import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js';
import { getDictDataEntryCount } from './dict.js'
import { Stenographer } from '../helpers/discordstenographer.js'
import { getAffirmationCount } from './affirmation.js'

async function showMemoryStats(interaction)
{
    try {
        const procMemUsage = process.memoryUsage();
        var memoryUsage = procMemUsage["rss"] / (1024 * 1024);
        var heapUsage = procMemUsage["heapTotal"] / (1024 * 1024);

        const msgCount = Stenographer.getInMemoryMessageCount();

        const outputString =
            "```Memory Stats\n"
            + "---------------------------------\n"
            + `Total Usage:      ${memoryUsage} MiB\n`
            + `Heap Usage:       ${heapUsage} MiB\n`
            + `Dict Entries:     ${getDictDataEntryCount()}\n`
            + `In-Mem Messages:  ${msgCount["count"]}/${msgCount["max"]}\n`
            + `Affirmations:     ${getAffirmationCount()}\n`
            + "```";

        await Common.editAndSplitReply(interaction, outputString);
    } catch (e) {
        await Common.logError(`Exception getting memory stats, got ${e}`, interaction, true);
    }
}

async function showCpuStats(interaction)
{
    try {
        const uptime = process.uptime();
        let uptimeStr;
        if (uptime < 60) {
            uptimeStr = `${uptime} seconds`;
        }
        else if (uptime > 60 && uptime < 3600) {
            uptimeStr = `${uptime / 60} minutes`;
        }
        else if (uptime > 3600 && uptime < 86400) {
            uptimeStr = `${uptime / (60 * 60)} hours`;
        }
        else {
            uptimeStr = `${uptime / (60 * 60 * 24)} days`;
        }

        const startCpu = process.cpuUsage();
        const now = Date.now();
        while (Date.now() - now < 500); // Get 500ms of cpu data
        const endCpu = process.cpuUsage(startCpu);

        const outputString =
            "```CPU Stats\n"
            + "---------------------------------\n"
            + `Uptime:        ${uptimeStr}\n`
            + `Platform:      ${process.platform}\n`
            + `pid:           ${process.pid}\n`
            + `Arch:          ${process.arch}\n`
            + `cpu (user):    ${endCpu["user"]}\n`
            + `cpu (system):  ${endCpu["system"]}\n`
            + "```";

        await Common.editAndSplitReply(interaction, outputString);
    } catch (e) {
        await Common.logError(`Exception getting cpu stats, got ${e}`, interaction, true);
    }
}

async function handleSystemCommand(interaction) {
    const start = Common.startTiming("handleSystemCommand(): ");

    try {
        await interaction.deferReply();

        for (let i = 0; i < interaction.options.data.length; i++)
        {
            const name = interaction.options.data[i].value;

            switch (name)
            {
                case 'memory':
                    await showMemoryStats(interaction);
                    break;
                case 'cpu':
                    await showCpuStats(interaction);
                    break;
                default:
                    break;
            }
        }        
    } catch (e) {   
        await Common.logError(`Top level exception during system command, got error ${e}`, interaction, true);
    }

    Common.endTiming(start);
}

function getSystemCommand()
{
    const systemCommand = new SlashCommandBuilder()
        .setName('system')
        .setDescription(`System commands`)
        .addStringOption((option) =>
            option
                .setName('command')
                .setDescription('System command to execute')
                .addChoices(
                    { name: 'memory', value: 'memory' },
                    { name: 'cpu', value: 'cpu' },
                )
                .setRequired(true),
        )
    ;

    return systemCommand;
}

function getSystemJSON()
{
    return getSystemCommand().toJSON();
}

function registerSystemCommand(client)
{
    const system = 
    {
        data: getSystemCommand(),
        async execute(interaction) {
            await handleSystemCommand(interaction);
        }
    }

    client.commands.set(system.data.name, system);
}

Common.registerCommandModule(registerSystemCommand, getSystemJSON);
