/*
    Allows querying the bot for system stuff.
*/

import { Global } from '../global.js';
import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { Stenographer } from '../helpers/discordstenographer.js'
import { getAffirmationCount } from './affirmation.js'
import { Dict } from './dict.js'
import { VersionInformation } from '../version.js';
import fs from 'fs'
import { EOL } from 'node:os'
import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from '../api/DiscordBotCommand.js';
import crypto from 'crypto'
import { rm } from 'node:fs/promises'

class Administration {
    static isSuper(memberId: string): boolean {
        const superUsers = Global.settings().get("SUDO_LIST").split(",");

        let isSuper: boolean = false;

        superUsers.forEach(
            (user: string) => {
                if (memberId == user)
                    isSuper = true;
            }
        );

        return isSuper;
    }
}

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
        if (!Administration.isSuper(interaction.member.id)) {
            await interaction.editReply("You aren't super, this will be reported. https://imgs.xkcd.com/comics/incident.png");
            return;
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

async function showVersionInformation(interaction) {
    try {
        interaction.editReply(`Version: ${VersionInformation.versionNumber}`);
    } catch (e) {
        Global.logger().logError(`Failed to get version info, got ${e}`, interaction, true);
    }
}

class SystemCommand extends DiscordBotCommand {

    private async handleDisplaySubcommand(interaction, subcommandOptions) {
        const coreCommandName = subcommandOptions[0].options[0].value;

        switch (coreCommandName) {
            case 'memory':
                await showMemoryStats(interaction);
                break;
            case 'cpu':
                await showCpuStats(interaction);
                break;
            case 'version':
                await showVersionInformation(interaction);
                break;
            default:
                Global.logger().logError(`Unknown core subcommand(${coreCommandName}.)`, interaction, true);
        }
    }

    private async handleCoreSubcommand(interaction) {
        try {
            const subcommand = interaction.options.data[0].options[0].name;

            switch (subcommand) {
                case 'display':
                    await this.handleDisplaySubcommand(interaction, interaction.options.data[0].options);
                    break;
                case 'reboob':
                    await reboot(interaction);
                    break;
            }
        } catch (e) {   
            await Global.logger().logError(`Top level exception during system command, got error ${e}`, interaction, true);
        }
    }

    private async handleLogSubcommand(interaction) {
        try {
            if (!Administration.isSuper(interaction.member.id)) {
                await interaction.editReply("You aren't super, this will be reported. https://imgs.xkcd.com/comics/incident.png");
                return;
            }

            let count: number = 5;
            let pasteDirectly: boolean = false;

            for (let i = 0; i < interaction.options.data[0].options[0].options.length; i++) {
                const parameter = interaction.options.data[0].options[0].options[i];
                
                switch (parameter.name) {
                    case 'count':
                        count = parameter.value;
                        break;
                    case 'paste_directly':
                        pasteDirectly = parameter.value;
                        break;
                    default:
                        Global.logger().logError(`Unexpected option found in system: ${parameter.name}`);
                        break;
                }
            }

            let tailOutput = null;

            try {
                const data = fs.readFileSync(Global.logManager().getGlobalLogFullPath(), 'utf8');

                const lines = data.split(EOL);

                for (let i = Math.max(0, lines.length - count - 1); i < lines.length; i++) {
                    tailOutput += `${lines[i]}\n`;
                }

                if (pasteDirectly) {
                    await Global.editAndSplitReply(interaction, `Last ${count} lines from log:${EOL}${tailOutput}`);
                } else {
                    // Store the data into a temp file to attach to discord
                    const hash = crypto.createHash('md5').update(tailOutput).digest("hex");
                    const filePath = `${Global.settings().get("TEMP_PATH")}/${hash}.txt`;

                    fs.writeFileSync(filePath, tailOutput, 'utf8');

                    const file = new AttachmentBuilder(filePath);
                    const embed = {
                        title: `Last ${count} lines from log`,
                        article: {
                            url: `attachment://${filePath}`,
                        }
                    }
    
                    // Send the reply
                    await interaction.editReply({ embeds: [embed], files: [file] });

                    // Delete the temporary file
                    try {
                        await rm(filePath);
                    } catch (e) {
                        Global.logger().logError(`Failed to delete temporary logfile, might need manual cleanup, got ${e}`);
                    }
                }
            }
            catch (e) {
                Global.logger().logError(`Failed to read log file, got ${e}`, interaction, true);
            }
        } catch (e) {
            await Global.logger().logError(`Top level error tailing the log, got ${e}`, interaction, true);
        }
    }

    private async handleEnvironmentSubcommand(interaction) {
        try {
            if (!Administration.isSuper(interaction.member.id)) {
                await interaction.editReply("You aren't super, this will be reported. https://imgs.xkcd.com/comics/incident.png");
                return;
            }

            const subCommand = interaction.options.data[0].options[0];
            let privateReply = true;
            let messageResponse = "";

            switch (subCommand.name) {
                case 'get':
                {
                    let variableName = "";

                    const options = interaction.options.data[0].options[0].options;

                    for (let i = 0; i < options.length; i++) {
                        switch (options[i].name) {
                            case 'name':
                                variableName = options[i].value;
                                break;
                            case 'private':
                                privateReply = options[i].value; 
                                break;
                            default:
                                messageResponse = `Invalid value: ${options[i].name}`;
                                break;
                        }
                    }
                    
                    if (this.runtimeData().settings().has(variableName)) {
                        const variableValue = this.runtimeData().settings().get(variableName);
                        messageResponse = `${variableName}=${variableValue}`;
                    } else {
                        messageResponse = `${variableName} not found`;
                    }
                }
                break;

                case 'set':
                {
                    messageResponse = "set is not implemented, environment variables are read only";
                    // let variableName;
                    // let variableValue;

                    // const options = interaction.options.data[0].options[0].options;

                    // for (let i = 0; i < options.length; i++) {
                    //     switch (options[i].name) {
                    //         case 'name':
                    //             variableName = options[i].value;
                    //             break;
                    //         case 'value':
                    //             variableValue = options[i].value; 
                    //             break;
                    //         case 'private':
                    //             privateReply = options[i].value;
                    //             break;
                    //         default:
                    //             messageResponse = `Invalid value: ${options[i].name}`;
                    //             break;
                    //     }
                    // }

                    // if (messageResponse != "") {
                    //     if (this.runtimeData().settings().has(variableName)) {
                    //         messageResponse = `${variableName} was ${this.runtimeData().settings().get(variableName)}, setting to ${variableValue}`;
                    //     } else {
                    //         messageResponse = `New ${variableName} setting to ${variableValue}`;
                    //     }
                        
                    // }
                }
                break;

                default:
                    messageResponse = "Unknown variable";
            }
            
            await interaction.reply({content: messageResponse, ephemeral: privateReply});
        } catch (e) {
            this.runtimeData().logger().logError(`${e}`, interaction, false);
        }
    }

    async handle(interaction) {
        using perfCounter = Global.getPerformanceCounter("handleSystemCommand(): ");

        // This function must defer the interaction if needed, it's not autodeferred.

        try {
            switch (interaction.options._group) {
                case 'core':
                    await interaction.deferReply();
                    await this.handleCoreSubcommand(interaction);
                    break;
                case 'log':
                    await interaction.deferReply({ephemeral: true});
                    await this.handleLogSubcommand(interaction);
                    break;
                case 'environment':
                    await this.handleEnvironmentSubcommand(interaction);
                    break;
                default:
                    Global.logger().logError(`Unimplemented system command option: ${interaction.options._group}`, interaction, true);
                    break;
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
            // OS commands
            .addSubcommandGroup((group) =>
                group
                    .setName('core')
                    .setDescription('Core system information')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('display')
                            .setDescription('Display system information')
                            .addStringOption((option) =>
                                option
                                    .setName('command')
                                    .setDescription('System command to execute')
                                    .addChoices(
                                        { name: 'memory', value: 'memory' },
                                        { name: 'cpu', value: 'cpu' },
                                        { name: 'version', value: 'version' },
                                    )
                                    .setRequired(true),
                            )
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('reboob')
                            .setDescription('Restart system')
                    )
            )
            // Logging commands
            .addSubcommandGroup((group) =>
                group
                    .setName('log')
                    .setDescription('Logging access')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('tail')
                            .setDescription('Tail the logs')
                            .addIntegerOption((option) =>
                                option
                                    .setName('count')
                                    .setDescription('Number of lines to display')
                                    .setRequired(false)
                                    .setMinValue(5)
                                    .setMaxValue(5000),
                            )
                            .addBooleanOption((option) =>
                                option
                                    .setName("paste_directly")
                                    .setDescription('Paste log directly into chat (BE CAREFUL WITH THIS)')
                                    .setRequired(false)
                            )
                    )
            )
            // Environment commands
            .addSubcommandGroup((group) =>
                group
                    .setName('environment')
                    .setDescription('Environment Variable Management')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('get')
                            .setDescription('Get variable value')
                            .addStringOption((option) =>
                                option
                                    .setName('name')
                                    .setDescription('Environment Variable to get')
                                    .setRequired(true)
                            )
                            .addBooleanOption((option) =>
                                option
                                    .setName('private')
                                    .setDescription('Print publically')
                                    .setRequired(false)
                            )
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('set')
                            .setDescription('Set variable value')
                            .addStringOption((option) =>
                                option
                                    .setName('name')
                                    .setDescription('Environment variable to set')
                                    .setRequired(true)
                            )
                            .addStringOption((option) =>
                                option
                                    .setName('value')
                                    .setDescription('New environment variable value')
                                    .setRequired(true)
                            )
                            .addBooleanOption((option) =>
                                option
                                    .setName('private')
                                    .setDescription('Print publically')
                                    .setRequired(false)
                            )
                    )
            )
        ;

        return systemCommand;
    }
}

registerDiscordBotCommand(new SystemCommand('system'), false);
