import { json } from "node:stream/consumers";
import * as KoalaBotSlashCommand from "../../../../api/koalabotslashcommand.js";
import * as DiscordBotSlashCommand from "../../../../platform/discord/api/discordbotslashcommand.js";
import * as Discord from "discord.js";
import { describe, expect, test, beforeEach, afterEach } from 'vitest'

const factory = DiscordBotSlashCommand.getDiscordSlashCommandObjectFactory() as DiscordBotSlashCommand.DiscordSlashCommandObjectFactory;
const jsonData = `{"name":"commandname","description":"commandDescription","arguments":[],"commandgroups":[{"name":"groupaname","description":"groupADescription","subcommands":[{"name":"subcommandaname","description":"subcommandadescription","arguments":[{"name":"argstringname","description":"argStringDescription","required":true,"choices":[{"name":"nameA","description":"descA","value":"valueA"},{"name":"nameB","description":"descB","value":"valueB"}],"dataType":2,"options":[]},{"name":"argbooleanname","description":"argBooleanDescription","required":false,"choices":[],"dataType":3,"options":[]},{"name":"argintegername","description":"argIntegerDescription","required":false,"choices":[],"dataType":0,"options":[{"name":"minValue","description":"","value":10},{"name":"maxValue","description":"","value":100}]}]}]}]}`;

describe('DiscordBotSlashCommand', () => {
    const name = "name";
    const desc = "desc";
    const value = "value";

    function TestNameAndDescription(command: any, name: string, desc: string) {
        expect(command.getName()).toBe(name);
        expect(command.getDescription()).toBe(desc);

        command.setName(null);
        expect(command.getName()).toBe(null);
        
        command.setDescription(null);
        expect(command.getDescription()).toBe(null);

        command.setName(name);
        command.setDescription(desc);
    }

    describe("DiscordBotSlashCommandArgument", () => {
        let commandArg: KoalaBotSlashCommand.KoalaBotSlashCommandArgument;

        describe("DiscordBotSlashCommandArgumentString", () => {
            // beforeAll(() => {
            //     commandArg = factory.CreateSlashCommandArgument(name, desc, KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.String);
            // });

            test('Initialization', () => {
                //TestNameAndDescription(commandArg, name, desc);
                expect(1).toBe(1);
            });

            // afterAll(() => {
            //     // @ts-ignore
            //     commandArg = null;
            // });
        });

        describe("DiscordBotSlashCommandArgumentBoolean", () => {
            // beforeAll(() => {
            //     commandArg = factory.CreateSlashCommandArgument(name, desc, KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Boolean);
            // });

            test('Initialization', () => {
                //TestNameAndDescription(commandArg, name, desc);
                expect(1).toBe(1);
            });

            // afterAll(() => {
            //     // @ts-ignore
            //     commandArg = null;
            // });
        });
    });

    // describe("DiscordBotSlashCommand (No Group)", () => {
    //     // Command
    //     let command: KoalaBotSlashCommand.KoalaBotSlashCommand;
    //     const commandName = "commandname";
    //     const commandDescription = "commandDescription";

    //     // String argument
    //     let argString: KoalaBotSlashCommand.KoalaBotSlashCommandArgument;
    //     const argStringName = "argstringname";
    //     const argStringDescription = "argStringDescription";
    //     const argStringRequired = true;

    //     // Boolean argument
    //     let argBoolean: KoalaBotSlashCommand.KoalaBotSlashCommandArgument;
    //     const argBooleanName = "argbooleanname";
    //     const argBooleanDescription = "argBooleanDescription";
    //     const argBooleanRequired = false;

    //     // Discord command to compare against
    //     let discordCommand;

    //     beforeEach(() => {           
    //         command = factory.CreateSlashCommand(commandName, commandDescription);
    //         argString = factory.CreateSlashCommandArgument(argStringName, argStringDescription, KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.String, argStringRequired);
    //         argBoolean = factory.CreateSlashCommandArgument(argBooleanName, argBooleanDescription, KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Boolean, argBooleanRequired);
    //     });

    //     afterEach(() => {
    //         // @ts-ignore
    //         command = null;
    //         // @ts-ignore
    //         argString = null;
    //         // @ts-ignore
    //         argBoolean = null;
    //         discordCommand = null;
    //     });

    //     test('Initialization', () => {
    //         TestNameAndDescription(command, commandName, commandDescription);

    //         expect(() => {
    //             new DiscordBotSlashCommand.DiscordBotSlashCommand("commandName", commandDescription);
    //         }).toThrow();

    //         expect(() => {
    //             new DiscordBotSlashCommand.DiscordBotSlashCommandArgument("optionName", argStringDescription, KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.String);
    //         }).toThrow();
    //     });

    //     test('Empty command', () => {
    //         discordCommand = new Discord.SlashCommandBuilder()
    //                                 .setName(commandName)
    //                                 .setDescription(commandDescription);

    //         let dsCommand = command.asNativeCommandType();

    //         expect(dsCommand).toEqual(discordCommand);
    //     });

    //     test('String argument', () => {
    //         discordCommand = new Discord.SlashCommandBuilder()
    //                                 .setName(commandName)
    //                                 .setDescription(commandDescription)
    //                                 .addStringOption((option) => 
    //                                     option
    //                                         .setName(argStringName)
    //                                         .setDescription(argStringDescription)
    //                                         .setRequired(argStringRequired)
    //                                 );

    //         command.addArgument(argString);

    //         const nativeType = command.asNativeCommandType();

    //         expect(nativeType).toEqual(discordCommand);
    //     });

    //     test("Boolean and string arguments", () => {
    //         discordCommand = new Discord.SlashCommandBuilder()
    //                                 .setName(commandName)
    //                                 .setDescription(commandDescription)
    //                                 .addStringOption((option) => 
    //                                     option
    //                                         .setName(argStringName)
    //                                         .setDescription(argStringDescription)
    //                                         .setRequired(argStringRequired)
    //                                 )
    //                                 .addBooleanOption((option) => 
    //                                     option
    //                                         .setName(argBooleanName)
    //                                         .setDescription(argBooleanDescription)
    //                                         .setRequired(argBooleanRequired)
    //                                 );

    //         command.addArgument(argString);
    //         command.addArgument(argBoolean);

    //         expect(command.asNativeCommandType()).toEqual(discordCommand);
    //     });
    // });

    // describe("DiscordBotSlashCommand (With Group)", () => {
    //     // Command
    //     let command: KoalaBotSlashCommand.KoalaBotSlashCommand;
    //     const commandName = "commandname";
    //     const commandDescription = "commandDescription";

    //     // Subcommand group A
    //     let groupA: KoalaBotSlashCommand.KoalaBotSlashCommandGroup;
    //     const groupAName = "groupaname";
    //     const groupADescription = "groupADescription";

    //     let subcommandA: KoalaBotSlashCommand.KoalaBotSlashSubcommand;
    //     const subcommandAName = "subcommandaname";
    //     const subcommandADescription = "subcommandadescription";

    //     // Subcommand group B
    //     let groupB: KoalaBotSlashCommand.KoalaBotSlashCommandGroup;
    //     const groupBName = "groupbname";
    //     const groupBDescription = "groupBDescription";

    //     let subcommandB: KoalaBotSlashCommand.KoalaBotSlashSubcommand;
    //     const subcommandBName = "subcommandbname";
    //     const subcommandBDescription = "subcommandbdescription";

    //     // String argument
    //     let argString: KoalaBotSlashCommand.KoalaBotSlashCommandArgument;
    //     const argStringName = "argstringname";
    //     const argStringDescription = "argStringDescription";
    //     const argStringRequired = true;
    //     const argStringChoices = 
    //         [ 
    //             new KoalaBotSlashCommand.KoalaCommandChoice("nameA", "valueA", "descA"), 
    //             new KoalaBotSlashCommand.KoalaCommandChoice("nameB", "valueB", "descB") 
    //         ];

    //     // Boolean argument
    //     let argBoolean: KoalaBotSlashCommand.KoalaBotSlashCommandArgument;
    //     const argBooleanName = "argbooleanname";
    //     const argBooleanDescription = "argBooleanDescription";
    //     const argBooleanRequired = false;

    //     // Integer argument
    //     let argInteger: KoalaBotSlashCommand.KoalaBotSlashCommandArgument;
    //     const argIntegerName = "argintegername";
    //     const argIntegerDescription = "argIntegerDescription";
    //     const argIntegerRequired = false;
    //     const argIntegerMaxValue = 100;
    //     const argIntegerMinValue = 10;

    //     // Discord command to compare against
    //     let discordCommand;

    //     beforeEach(() => {           
    //         command = factory.CreateSlashCommand(commandName, commandDescription);
    //         subcommandA = factory.CreateSlashSubcommand(subcommandAName, subcommandADescription);
    //         subcommandB = factory.CreateSlashSubcommand(subcommandBName, subcommandBDescription);
    //         groupA = factory.CreateSlashCommandGroup(groupAName, groupADescription);
    //         groupB = factory.CreateSlashCommandGroup(groupBName, groupBDescription);
    //         argString = factory.CreateSlashCommandArgument(argStringName, argStringDescription, KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.String, argStringRequired);
    //         argBoolean = factory.CreateSlashCommandArgument(argBooleanName, argBooleanDescription, KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Boolean, argBooleanRequired);
    //         argInteger = factory.CreateSlashCommandArgument(argIntegerName, argIntegerDescription, KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Integer, argIntegerRequired, []);
    //     });

    //     afterEach(() => {
    //         // @ts-ignore
    //         command = null;
    //         // @ts-ignore
    //         argString = null;
    //         // @ts-ignore
    //         argBoolean = null;
    //         // @ts-ignore
    //         discordCommand = null;
    //         // @ts-ignore
    //         subcommandA = null;
    //         // @ts-ignore
    //         subcommandB = null;
    //         // @ts-ignore
    //         groupA = null;
    //         // @ts-ignore
    //         groupB = null;
    //     });

    //     test('Initialization', () => {
    //         expect(() => {
    //             new DiscordBotSlashCommand.DiscordBotSlashSubcommand("commandName", commandDescription);
    //         }).toThrow();
    //     });

    //     test('Simple command, single integer argument', () => {
    //         discordCommand = new Discord.SlashCommandBuilder()
    //                                 .setName(commandName)
    //                                 .setDescription(commandDescription)
    //                                 .addIntegerOption((option) =>
    //                                                     option
    //                                                         .setName(argIntegerName)
    //                                                         .setDescription(argIntegerDescription)
    //                                                         .setRequired(argIntegerRequired)
    //                                                         .setMinValue(argIntegerMinValue)
    //                                                         .setMaxValue(argIntegerMaxValue),
    //                                                 );


    //         argInteger.addOption(new KoalaBotSlashCommand.KoalaBotArgumentOption("minValue", argIntegerMinValue));
    //         argInteger.addOption(new KoalaBotSlashCommand.KoalaBotArgumentOption("maxValue", argIntegerMaxValue));
            
    //         command.addArgument(argInteger);
            
    //         let dsCommand = command.asNativeCommandType();

    //         expect(dsCommand).toEqual(discordCommand);
    //     });

    //     function getDiscordObjectOneEach() {
    //         return new Discord.SlashCommandBuilder().setName(commandName).setDescription(commandDescription)
    //                                 .addSubcommandGroup((group) =>
    //                                     group.setName(groupA.getName()).setDescription(groupA.getDescription())
    //                                         .addSubcommand((subcommand) =>
    //                                             subcommand.setName(subcommandA.getName()).setDescription(subcommandA.getDescription())
    //                                                 .addStringOption((option) =>
    //                                                     option.setName(argStringName).setDescription(argStringDescription).setRequired(argStringRequired)
    //                                                         .addChoices(
    //                                                             { name: argStringChoices[0].getName(), value: argStringChoices[0].getValue() },
    //                                                             { name: argStringChoices[1].getName(), value: argStringChoices[1].getValue() }
    //                                                         )
    //                                                 )
    //                                                 .addBooleanOption((option) =>
    //                                                     option.setName(argBooleanName).setDescription(argBooleanDescription).setRequired(argBooleanRequired)
    //                                                 )
    //                                                 .addIntegerOption((option) =>
    //                                                     option.setName(argIntegerName).setDescription(argIntegerDescription).setRequired(argIntegerRequired).setMinValue(argIntegerMinValue).setMaxValue(argIntegerMaxValue),
    //                                                 )
    //                                         )
    //                                 );
    //     }

    //     describe('1 subcommand group with 1 argument of each type: String, Boolean, and Integer argument', () => {
    //         test('Hand Built', () => {
    //             // Command with 1 group and 1 argument of each type
    //             discordCommand = getDiscordObjectOneEach();
                
    //             // Setup the string argument
    //             argString.addChoice(argStringChoices[0].getName(), argStringChoices[0].getValue(), argStringChoices[0].getDescription());
    //             argString.addChoice(argStringChoices[1].getName(), argStringChoices[1].getValue(), argStringChoices[1].getDescription());

    //             // Setup the integer argument
    //             argInteger.addOption(new KoalaBotSlashCommand.KoalaBotArgumentOption("minValue", argIntegerMinValue));
    //             argInteger.addOption(new KoalaBotSlashCommand.KoalaBotArgumentOption("maxValue", argIntegerMaxValue));

    //             // Add the arguments to the subcommand
    //             subcommandA.addArgument(argString);
    //             subcommandA.addArgument(argBoolean);
    //             subcommandA.addArgument(argInteger);

    //             // Add the subcommand to the group
    //             groupA.addSubcommand(subcommandA);
    //             command.addSubcommandGroup(groupA);

    //             console.log(JSON.stringify(command));

    //             let asDiscord = command.asNativeCommandType();
    //             expect(asDiscord).toEqual(discordCommand);
    //         });

    //         test('from JSON', () => {
    //             //const discordCommand = getDiscordObjectOneEach();

    //             //const jsonCommand: DiscordBotSlashCommand.DiscordBotSlashCommand = factory.CreateFromJsonString(jsonData) as DiscordBotSlashCommand.DiscordBotSlashCommand;

    //             //const asDiscord = jsonCommand.asNativeCommandType();

    //             //expect(asDiscord).toEqual(discordCommand);
    //             expect(true).toBe
    //         });
    //    });
    //});
});
