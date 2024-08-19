/*
    Allows querying the bot for system stuff.
*/

import { Global } from '../global.js';
import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js';
import { Stenographer } from '../helpers/discordstenographer.js'
import { getAffirmationCount } from './affirmation.js'
import { Dict } from './dict.js'
import fs from 'fs'
import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from '../api/DiscordBotCommand.js';

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
            + `Dict Entries:     ${Dict.getDictDataEntryCount()}\n`
            + `In-Mem Messages:  ${msgCount["count"]}/${msgCount["max"]}\n`
            + `Affirmations:     ${getAffirmationCount()}\n`
            + "```";

        await Global.editAndSplitReply(interaction, outputString);
    } catch (e) {
        await Global.logger().logError(`Exception getting memory stats, got ${e}`, interaction, true);
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

        await Global.editAndSplitReply(interaction, outputString);
    } catch (e) {
        await Global.logger().logError(`Exception getting cpu stats, got ${e}`, interaction, true);
    }
}

async function reboot(interaction) {
    try {
        let isSuper: boolean = false;

        if (interaction.member.id === "477563211835506710")
        {
            isSuper = true;
        }

        if (!isSuper) {
            await interaction.editReply("lol, wut, you don't get to reboob me.")
        }

        // write file to reboot spot 
        const targetFile = Global.settings().get("REBOOT_FILE");

        Global.logger().logWarning(`Attempting to reboot, writing to ${targetFile}`);
        await interaction.editReply(`Attempting to reboot, writing to ${targetFile}`);

        fs.writeFile(targetFile, `${interaction.member.id}:${interaction.channelId}`, err => {
            if (err) {
                Global.logger().logWarning(`Reboot Failed! Failed to write reboot info to ${targetFile}, got ${err}`);
                interaction.editReply(`Reboot Failed! Failed to write reboot info to ${targetFile}, got ${err}`);
                return false;
            } else {
                Global.logger().logWarning(`Wrote reboot info to ${targetFile}`);
                return true;
            }
        });

    } catch (e) {
        await Global.logger().logWarning(`Failed to restart, got ${e}`);
    }
}

class SystemCommand extends DiscordBotCommand {

    async handle(interaction) {
        using perfCounter = Global.getPerformanceCounter("handleSystemCommand(): ");

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
                    case 'reboot':
                        await reboot(interaction);
                        break;
                    default:
                        break;
                }
            }        
        } catch (e) {   
            await Global.logger().logError(`Top level exception during system command, got error ${e}`, interaction, true);
        }
    }

    get()
    {
        const systemCommand = new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(`System commands`)
            .addStringOption((option) =>
                option
                    .setName('command')
                    .setDescription('System command to execute')
                    .addChoices(
                        { name: 'memory', value: 'memory' },
                        { name: 'cpu', value: 'cpu' },
                        { name: 'reboob', value: 'reboot'}
                    )
                    .setRequired(true),
            )
        ;

        return systemCommand;
    }
}

registerDiscordBotCommand(new SystemCommand('system'), false);
