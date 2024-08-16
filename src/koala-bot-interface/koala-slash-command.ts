import { ChatInputCommandInteraction } from 'discord.js';

export class KoalaSlashCommandRequest {

    private static fromDiscordSubcommand(interaction: ChatInputCommandInteraction): KoalaSlashCommandRequest 
    {
        if (interaction.options["_subcommand"]) {
            let subRequest = new KoalaSlashCommandRequest(interaction);

            subRequest.name = interaction.options["_subcommand"];
            subRequest.group = interaction.options.data[0].name;

            for (let i = 0; i < interaction.options.data[0].options[0].options.length; i++) {
                const name = interaction.options.data[0].options[0].options[i].name;
                const value = interaction.options.data[0].options[0].options[i].value;

                subRequest.options.set(name, value);
            }

            return subRequest;
        } else {
            return null;
        }
    }

    public static fromDiscordInteraction(interaction: ChatInputCommandInteraction): KoalaSlashCommandRequest 
    {
        let request = new KoalaSlashCommandRequest(interaction);

        request.name = interaction.commandName;
        request.subcommand = KoalaSlashCommandRequest.fromDiscordSubcommand(interaction);
        
        for (let i = 0; i < interaction.options.data.length; i++) {
            const name = interaction.options.data[i].name;
            const value = interaction.options.data[i].value;

            request.options.set(name, value);
        }

        return request;
    }

    private constructor(interaction: ChatInputCommandInteraction = null) {
        this.name = "";
        this.subcommand = null;
        this.group = null;
        this.options = new Map<string, string | number | boolean>();
        this.platformData = interaction;
    }

    readonly platformData: ChatInputCommandInteraction;

    private group: string;
    public getGroup(): string {
        return this.group;
    }

    private subcommand: KoalaSlashCommandRequest;
    public getSubcommand(): KoalaSlashCommandRequest
    {
        return this.subcommand;
    }

    public hasSubcommand(): boolean 
    {
        return this.getSubcommand() != null;
    }

    private name: string;
    public getName(): string {
        return this.name;
    }

    private options: Map<string, string | number | boolean>;

    public getOptionValue(key: string, defaultValue: string | number | boolean = "") {
        if (this.options.has(key)) {
            return this.options.get(key);
        } else {
            return defaultValue;
        }
    }

    public getOptionValueString(key: string, defaultValue: string = ""): string {
        try {
            return this.getOptionValue(key, defaultValue) as string;
        } catch {
            return defaultValue;
        }
        
    }

    public getOptionValueBoolean(key: string, defaultValue: boolean = false) {
        try {
            return this.getOptionValue(key, defaultValue) as boolean;
        } catch {
            return defaultValue;
        }
    }

    public getOptionValueNumber(key: string, defaultValue: number = 0) {
        try {
            const num = this.getOptionValue(key, defaultValue) as number;
            if (isNaN(num)) { return defaultValue;}
            else { return num; }
        } catch {
            return defaultValue;
        }
    }
}