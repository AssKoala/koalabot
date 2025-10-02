export enum KoalaBotSlashCommandArgumentType {
    Integer,
    Number,
    String,
    Boolean,
    Any,
    None
}

export class KoalaCommand {
    name: string;
    description: string;

    constructor(name: string = undefined, description: string = undefined) {
        this.name = name;
        this.description = description;
    }

    getName(): string {
        return this.name;
    }   
    
    setName(name: string) {
        this.name = name;
    }
    
    getDescription(): string {
        return this.description;
    }

    setDescription(description: string): void {
        this.description = description;
    }
}

export type KoalaBotArgumentOptionValueType = number | string | boolean;

export class KoalaBotArgumentOption {
    constructor(name: string, value: KoalaBotArgumentOptionValueType, description: string = "") {
        this.name = name;
        this.description = description;
        this.value = value;
    }

    name: string;
    description: string;
    value: KoalaBotArgumentOptionValueType;
}

export class KoalaCommandChoice {
    private name: string;
    private description: string;
    private value: any;
    
    constructor(name: string, value: any, description: string = "") {
        this.name = name;
        this.value = value;
        this.description = description;
    }

    hasValue() { return this.value !== null; }

    getName(): string { return this.name;}
    getDescription(): string { return this.description; }
    getValue(): any { return this.value; }
    
    setName(name: string) { this.name = name; }
    setDescription(description: string) { this.description = description; }
    setValue(value: any) { this.value = value; }
}

export class KoalaBotSlashCommandArgument extends KoalaCommand {
    private required: boolean;
    private choices: KoalaCommandChoice[];
    private dataType: KoalaBotSlashCommandArgumentType;
    private options: KoalaBotArgumentOption[];

    setDataType(dataType: KoalaBotSlashCommandArgumentType) {
        this.dataType = dataType;
    }

    getDataType(): KoalaBotSlashCommandArgumentType {
        return this.dataType;
    }

    isRequired(): boolean {
        return this.required;
    }

    setRequired(required: boolean): void {
        this.required = required;
    }

    addChoice(name: string, value: string, description: string= "") {
        this.choices.push(new KoalaCommandChoice(name, value, description));
    }

    getChoices(): KoalaCommandChoice[] {
        return this.choices;
    }

    getOption(name: string) {
        return this.options.find(option => option.name === name);
    }

    addOption(option: KoalaBotArgumentOption, overwrite: boolean = false) {
        const index = this.options.findIndex(entry => entry.name == option.name);

        if (index !== -1) {
            if (overwrite) {
                this.options[index] = option;
            } else {
                throw new TypeError("Entry with the same name already exists, set overwrite=true to overwrite");
            }
        } else {
            this.options.push(option);
        }
    }

    hasOption(name: string) {
        return this.options.find(option => option.name === name) != undefined;
    }

    constructor(name: string, description: string, type: KoalaBotSlashCommandArgumentType, required: boolean = false, choices: KoalaCommandChoice[] = [], options: KoalaBotArgumentOption[] = []) {
        super(name, description);

        this.required = required;
        this.choices = choices;
        this.options = options;
        this.dataType = type;
    }
}

export class KoalaBotSlashSubcommand extends KoalaCommand {
    protected arguments: KoalaBotSlashCommandArgument[] = [];

    getArguments(): KoalaBotSlashCommandArgument[] {
        return this.arguments;
    }

    hasArgument(argumentName: string): boolean {
        return this.getArgument(argumentName) != undefined;
    }

    addArgument(argument: KoalaBotSlashCommandArgument, overwrite: boolean = false) {
        const index = this.arguments.findIndex(entry => entry.getName() == argument.getName());

        if (index !== -1) {
            if (overwrite) {
                this.arguments[index] = argument;
            } else {
                throw new TypeError("Entry with the same name already exists, set overwrite=true to overwrite");
            }
        } else {
            this.arguments.push(argument);
        }
    }

    getArgument(argumentName: string): KoalaBotSlashCommandArgument {
        return this.arguments.find(entry => entry.getName() == argumentName);
    }
}

export class KoalaBotSlashCommandGroup extends KoalaCommand {
    subcommands: KoalaBotSlashSubcommand[] = [];

    getSubCommands(): KoalaBotSlashSubcommand[] {
        return this.subcommands;
    }

    addSubcommand(subcommand: KoalaBotSlashSubcommand) {
        this.subcommands.push(subcommand)
    }

    toJSON() {
        return {
            name: this.getName(),
            description: this.getDescription(),
            subcommands: Array.from(this.subcommands.values())
        }
    }
}

export class KoalaBotSlashCommand extends KoalaBotSlashSubcommand {
    private commandgroups: KoalaBotSlashCommandGroup[] = [];

    getGroups() : KoalaBotSlashCommandGroup[] {
        return this.commandgroups;
    }

    getGroup(group: string): KoalaBotSlashCommandGroup {
        return this.commandgroups.find(entry => entry.name === group);
    }

    hasSubcommandGroup(group: string): boolean {
        return this.commandgroups.find(entry => entry.name === group) !== undefined;
    }

    getSubcommands(group: string): KoalaBotSlashSubcommand[] {
        if (this.hasSubcommandGroup(group)) {
            return this.getGroup(group).subcommands;
        }

        throw new Error(`Group: ${group} doesn't exist`);
    }

    addSubcommandGroup(group: KoalaBotSlashCommandGroup) {
        if (this.hasSubcommandGroup(group.getName())) {
            const index = this.commandgroups.findIndex(entry => entry.name == group.name);
            this.commandgroups[index] = group;
        } else {
            this.commandgroups.push(group);
        }
    }

    addSubcommandToGroup(group: string, subCommand: KoalaBotSlashSubcommand, description: string = "", create: boolean = true): void {
        if (!this.hasSubcommandGroup(group) && create)
        { 
            this.commandgroups.push(new KoalaBotSlashCommandGroup(group, description));
        } else {
            throw new Error("Group already exists");
        }

        const existingEntry = this.commandgroups.find(entry => entry.getName() == group);

        if (existingEntry != undefined) {
            existingEntry.addSubcommand(subCommand);
        } else {
            throw new Error("Internal error: Failed to find or create group.");
        }
    }

    asNativeCommandType() {
        throw new Error("Base type unattached to real implementation");
    }
}

export interface SlashCommandObjectFactoryInstance {
    CreateSlashCommand(name: string, description: string): KoalaBotSlashCommand;
    CreateSlashCommandGroup(name: string, description: string): KoalaBotSlashCommandGroup;
    CreateSlashSubcommand(name: string, description: string): KoalaBotSlashSubcommand;
    CreateSlashCommandArgument(name: string, description: string, type: KoalaBotSlashCommandArgumentType, required: boolean, choices: KoalaCommandChoice[]): KoalaBotSlashCommandArgument;
    CreateFromJsonString(jsonString: string): KoalaBotSlashCommand;
}

export class SlashCommandObjectFactory {
    private static _slashCommandObjectFactory: SlashCommandObjectFactoryInstance = null;

    GetSlashCommandObjectFactory(): SlashCommandObjectFactoryInstance {
        return SlashCommandObjectFactory._slashCommandObjectFactory;
    }

    SetSlashCommandObjectFactory(factory): void {
        SlashCommandObjectFactory._slashCommandObjectFactory = factory;
    }
}
