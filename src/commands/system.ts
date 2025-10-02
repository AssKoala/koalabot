/*
    Allows querying the bot for system stuff.
*/

import { Global } from '../global.js';
import { SlashCommandBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { Stenographer } from '../app/stenographer/discordstenographer.js'
import { getAffirmationCount } from './affirmation.js'
import { Dict } from './dict.js'
import { VersionInformation } from '../version.js';
import fs from 'fs'
import { EOL } from 'node:os'
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js';
import crypto from 'crypto'
import fsPromise from 'node:fs/promises'
import { GetBadWordSaveFileName, GetBadWordSaveFilePath, GetBadWordSaveFolder } from '../listeners/badwordlistener.js';

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
        var memoryUsage = (procMemUsage["rss"] / (1024 * 1024)).toFixed(2);
        var heapUsage = (procMemUsage["heapTotal"] / (1024 * 1024)).toFixed(2);

        const msgCount = Stenographer.getInMemoryMessageCount();

        const outputString =
            "```Memory Stats\n"
            + "---------------------------------\n"
            + `Total Usage:      ${memoryUsage} MiB\n`
            + `Heap Usage:       ${heapUsage} MiB\n`
            + `Dict Entries:     ${Dict.getDictDataEntryCount()}\n`
            + `In-Mem Messages:  ${msgCount["count"]} (Per-cache max: ${msgCount["max"]})\n`
            + `Affirmations:     ${getAffirmationCount()}\n`
            + "```";

        await Global.editAndSplitReply(interaction, outputString);
    } catch (e) {
        await Global.logger().logErrorAsync(`Exception getting memory stats, got ${e}`, interaction, true);
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
        await Global.logger().logErrorAsync(`Exception getting cpu stats, got ${e}`, interaction, true);
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
                process.exit();
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
        Global.logger().logErrorAsync(`Failed to get version info, got ${e}`, interaction, true);
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
                Global.logger().logErrorAsync(`Unknown core subcommand(${coreCommandName}.)`, interaction, true);
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
            await Global.logger().logErrorAsync(`Top level exception during system command, got error ${e}`, interaction, true);
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
                        Global.logger().logErrorAsync(`Unexpected option found in system: ${parameter.name}`);
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
                        await fsPromise.rm(filePath);
                    } catch (e) {
                        Global.logger().logErrorAsync(`Failed to delete temporary logfile, might need manual cleanup, got ${e}`);
                    }
                }
            }
            catch (e) {
                Global.logger().logErrorAsync(`Failed to read log file, got ${e}`, interaction, true);
            }
        } catch (e) {
            await Global.logger().logErrorAsync(`Top level error tailing the log, got ${e}`, interaction, true);
        }
    }

    private async handleEnvironmentSubcommand(interaction) {
        try {
            if (!Administration.isSuper(interaction.member.id)) {
                await interaction.editReply("You aren't super, this will be reported. https://imgs.xkcd.com/comics/incident.png");
                return;
            }

            const subCommand = interaction.options.data[0].options[0];
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
                            default:
                                break;
                        }
                    }

                    if (variableName == "") {
                        // List all when a value isnt provided.
                        messageResponse = `Listing registered settings:\n`;

                        this.runtimeData().settings().getAllSettings().forEach(setting => {
                            messageResponse += `- ${setting}\n`;
                        });
                    } else {
                        if (this.runtimeData().settings().has(variableName)) {
                            const variableValue = this.runtimeData().settings().get(variableName);
                            messageResponse = `${variableName}=${variableValue}`;
                        } else {
                            const potential = this.runtimeData().settings().search(variableName);
    
                            if (potential.length > 0) {
                                messageResponse = `${variableName} not found, did you mean:\n`;
                                potential.forEach((value) => {
                                    messageResponse += `- ${value}\n`; 
                                });
                            } else {
                                messageResponse = `${variableName} not found and no alternatives found with that substring.`;
                            }                        
                        }
                    }                    
                }
                break;

                case 'set':
                {
                    let variableName;
                    let variableValue;

                    const options = interaction.options.data[0].options[0].options;

                    for (let i = 0; i < options.length; i++) {
                        switch (options[i].name) {
                            case 'name':
                                variableName = options[i].value;
                                break;
                            case 'value':
                                variableValue = options[i].value; 
                                break;
                            default:
                                break;
                        }
                    }

                    if (this.runtimeData().settings().has(variableName)) {
                        messageResponse = `${variableName} was ${this.runtimeData().settings().get(variableName)}, setting to ${variableValue}`;
                        const result = this.runtimeData().settings().set(variableName, variableValue);

                        messageResponse = (result ? "SUCCESS: " : "FAILED: ") + messageResponse;
                    } else {
                        messageResponse = `${variableName} not found or not registered. Check spelling or use get to find the right name.`;
                    }                    
                }
                break;

                default:
                    messageResponse = "Unknown variable";
            }
            
            await interaction.editReply(messageResponse);
        } catch (e) {
            this.runtimeData().logger().logErrorAsync(`${e}`, interaction, false);
        }
    }

    private async handleBadWordSubcommand(interaction) {
        try {
            const subCommand = interaction.options.data[0].options[0];
            let messageResponse = "";

            switch (subCommand.name) {
                case 'list':
                {
                    const saveFolder = GetBadWordSaveFolder();
                    let list = ''

                    fs.readdirSync(saveFolder).forEach(file => {
                        list += `${file}, `;
                    });

                    await interaction.editReply(list.slice(0, -2));
                }
                break;

                case 'load':
                    const filePath = GetBadWordSaveFilePath(subCommand.options[1].value, subCommand.options[0].value);
                    try 
                    {
                        const file = new AttachmentBuilder(filePath);

                        const embed = {
                            title: `Badword save file`,
                            article: {
                                url: `attachment://${filePath}`,
                            }
                        };

                        await interaction.editReply({ embeds: [embed], files: [file] });
                    } catch (e) {
                        await this.runtimeData().logger().logErrorAsync(`Failed to load file ${filePath}, got ${e}`, interaction, true);
                    }
                break;

                default:
                    await interaction.editReply(messageResponse);
            }
        } catch (e) {
            await Global.logger().logErrorAsync(`Top level error handling badword command, got ${e}`, interaction, true);
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
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral});
                    await this.handleLogSubcommand(interaction);
                    break;
                case 'environment':
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral});
                    await this.handleEnvironmentSubcommand(interaction);
                    break;
                case 'badword':
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral});
                    await this.handleBadWordSubcommand(interaction);
                    break;
                default:
                    Global.logger().logErrorAsync(`Unimplemented system command option: ${interaction.options._group}`, interaction, true);
                    break;
            }
        } catch (e) {   
            await Global.logger().logErrorAsync(`Top level exception during system command, got error ${e}`, interaction, true);
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
                                    .setDescription('Environment Variable to get (empty for all)')
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
                    )
            )
            // Badword commands
            .addSubcommandGroup((group) =>
                group
                    .setName('badword')
                    .setDescription('Badword log management')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('list')
                            .setDescription('List badword logs')

                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('load')
                            .setDescription('Load badword log (Epheremal)')
                            .addStringOption((option) =>
                                option
                                    .setName('channelid')
                                    .setDescription('Discord ChannelId to load (if available)')
                                    .setRequired(true)
                            )
                            .addStringOption((option) =>
                                option
                                    .setName('badword')
                                    .setDescription('Badword to load')
                                    .setRequired(true)
                            )
                    )
            )
        ;

        return systemCommand;
    }
}

registerDiscordBotCommand(new SystemCommand('system'), false);
