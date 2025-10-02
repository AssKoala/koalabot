import * as KoalaBotSlashCommand from '../../../api/koalabotslashcommand.js';
import * as Discord from 'discord.js';

export class DiscordNativeChoice<T> implements Discord.APIApplicationCommandOptionChoice<T> {
    constructor(name: string, value: T) {
        this.name = name;
        this.value = value;
    }

    name: string;
    // TODO localization
    value: T;
}

export type DiscordNativeObjectType = Discord.SlashCommandStringOption | Discord.SlashCommandBooleanOption | Discord.SlashCommandIntegerOption;

export class DiscordBotSlashCommandArgument extends KoalaBotSlashCommand.KoalaBotSlashCommandArgument {
    appendDiscordCommand(command) {
        const nativeObject = this.asNativeObject();

        switch(this.getDataType()) {
            case KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.String:
                command.addStringOption(nativeObject);
                break;
            case KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Boolean:
                command.addBooleanOption(nativeObject);
                break;
            case KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Number:
                command.addNumberOption(nativeObject);
                break;
            case KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Integer:
                command.addIntegerOption(nativeObject);
                break;
            default:
                throw new TypeError("Argument type not supported by Discord");
        }
    }

    private configureChoices<T>(nativeObject) {
        if (this.getChoices().length > 0) {
            nativeObject.setChoices(this.getNativeChoices<T>());
        }
    }

    private configureAutocomplete(nativeObject) {
        if (this.hasOption("autocomplete")) {
            nativeObject.setAutocomplete(this.getOption("autocomplete").value as boolean);
        }
    }

    private configureNumericalConstraints<T>(nativeObject) {
        if (this.hasOption("minValue")) {
            nativeObject.setMinValue(this.getOption("minValue").value as T);
        }

        if (this.hasOption("maxValue")) {
            nativeObject.setMaxValue(this.getOption("maxValue").value as T);
        }
    }

    private configureStringConstraints(nativeObject) {
        if (this.hasOption("minLength")) {
            nativeObject.setMinLength(this.getOption("minLength").value as number);
        }

        if (this.hasOption("maxLength")) {
            nativeObject.setMaxLength(this.getOption("maxLength").value as number);
        }
    }

    asNativeObject() {
        let nativeObject: DiscordNativeObjectType = null;

        switch(this.getDataType()) {
            case KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.String:
                nativeObject = new Discord.SlashCommandStringOption();

                // string options support choices, autocomplete, and string constraints
                this.configureChoices<string>(nativeObject);
                this.configureAutocomplete(nativeObject);
                this.configureStringConstraints(nativeObject);
                break;

            case KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Number:
                nativeObject = new Discord.SlashCommandIntegerOption();
            case KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Integer:
                nativeObject = (nativeObject == null) ? new Discord.SlashCommandIntegerOption() : nativeObject;

                // Integer and Number supports choices, autocomplete, and constraints
                this.configureChoices(nativeObject);
                this.configureAutocomplete(nativeObject);
                this.configureNumericalConstraints(nativeObject);
                break;

            case KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Boolean:
                nativeObject = new Discord.SlashCommandBooleanOption();
                // boolean option doesn't support any additional parameters
                break;

            default:
                throw new TypeError("Argument type not supported by Discord");
        }

        nativeObject.setName(this.getName());
        nativeObject.setDescription(this.getDescription());
        nativeObject.setRequired(this.isRequired());

        return nativeObject;
    }

    private getNativeChoices<T>(): DiscordNativeChoice<T>[] {
        let nativeChoices: DiscordNativeChoice<T>[] = [];

        this.getChoices().forEach((choice) => {
            nativeChoices.push(new DiscordNativeChoice(choice.getName(), choice.getValue()));
        });
        return nativeChoices;
    }

    constructor(name: string, description: string, type: KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType, required: boolean = false, choices: KoalaBotSlashCommand.KoalaCommandChoice[] = []) {
        super(name, description, type, required, choices);

        if (name.toLocaleLowerCase() != name) {
            throw new Error("Argument name must be lowercase");
        }

        if (    this.getDataType() != KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.String 
            &&  this.getDataType() != KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Boolean
            &&  this.getDataType() != KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Number
            &&  this.getDataType() != KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType.Integer) 
        {
            throw new TypeError("Argument type not supported by Discord");
        }
    }
}

export class DiscordBotSlashSubcommand extends KoalaBotSlashCommand.KoalaBotSlashSubcommand {
    constructor(name: string, description: string) {
        super(name, description);

        if (this.getName().toLowerCase() != this.getName()) {
            throw new Error("Command name must be lowercase");
        }
    }

    appendDiscordCommand(discordBuilder) {
        let subcommand = new Discord.SlashCommandSubcommandBuilder();

        subcommand.setName(this.getName());
        subcommand.setDescription(this.getDescription());

        this.getArguments().forEach((argument) => {
           (argument as DiscordBotSlashCommandArgument).appendDiscordCommand(subcommand);
        });

        discordBuilder.addSubcommand(subcommand);
    }
}

export class DiscordBotSlashCommand extends KoalaBotSlashCommand.KoalaBotSlashCommand {
    constructor(name: string = undefined, description: string = undefined) {
        super(name, description);

        if (this.getName().toLowerCase() != this.getName()) {
            throw new Error("Command name must be lowercase");
        }
    }

    override asNativeCommandType(): Discord.SlashCommandOptionsOnlyBuilder | Discord.SlashCommandSubcommandsOnlyBuilder {
        if (this.getArguments().length > 0 && this.getGroups().length > 0) {
            throw new TypeError("Discord doesn't support global arguments and subcommands");
        }

        let discordCommand = new Discord.SlashCommandBuilder();
        discordCommand.setName(this.getName());
        discordCommand.setDescription(this.getDescription());

        if (this.getGroups().length > 0) {
            this.getGroups().forEach((group) => {

                let subgroup = new Discord.SlashCommandSubcommandGroupBuilder();
                subgroup.setName(group.name);
                subgroup.setDescription(group.description);
    
                this.getSubcommands(group.name).forEach((subCommand) => {
                    let sc = subCommand as DiscordBotSlashSubcommand;
                    sc.appendDiscordCommand(subgroup);
                });

                discordCommand.addSubcommandGroup(subgroup);
            });
        } else if (this.getArguments().length > 0) {
            this.getArguments().forEach((argument) => {
                (argument as DiscordBotSlashCommandArgument).appendDiscordCommand(discordCommand);
            });
        } 

        return discordCommand;
    }
}

export class DiscordSlashCommandObjectFactory implements KoalaBotSlashCommand.SlashCommandObjectFactoryInstance {
        CreateSlashCommand(name: string, description: string): KoalaBotSlashCommand.KoalaBotSlashCommand {
            return new DiscordBotSlashCommand(name, description);
        }

        CreateSlashCommandGroup(name: string, description: string): KoalaBotSlashCommand.KoalaBotSlashCommandGroup {
            return new KoalaBotSlashCommand.KoalaBotSlashCommandGroup(name, description);
        }

        CreateSlashSubcommand(name: string, description: string): KoalaBotSlashCommand.KoalaBotSlashSubcommand {
            return new DiscordBotSlashSubcommand(name, description);
        }

        CreateSlashCommandArgument(name: string, description: string, type: KoalaBotSlashCommand.KoalaBotSlashCommandArgumentType, 
            required: boolean = false, choices: KoalaBotSlashCommand.KoalaCommandChoice[] = []): KoalaBotSlashCommand.KoalaBotSlashCommandArgument 
        {
            return new DiscordBotSlashCommandArgument(name, description, type, required, choices);
        }

        CreateFromJsonString(jsonString: string): KoalaBotSlashCommand.KoalaBotSlashCommand {
            const command: DiscordBotSlashCommand = Object.assign(new DiscordBotSlashCommand("",""), JSON.parse(jsonString));
            //const command = JSON.parse(jsonString) as KoalaBotSlashCommand.KoalaBotSlashCommand;
            return command;
        }
}

const discordSlashCommandObjectFactory: DiscordSlashCommandObjectFactory = new DiscordSlashCommandObjectFactory();

export function getDiscordSlashCommandObjectFactory(): KoalaBotSlashCommand.SlashCommandObjectFactoryInstance {
    return discordSlashCommandObjectFactory;
}
