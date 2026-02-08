/*
    AI chatbot functionality
*/
import { KoalaSlashCommandRequest } from '../koala-bot-interface/koala-slash-command.js';

import * as Discord from 'discord.js';
import { Stenographer } from '../app/stenographer/discordstenographer.js';
import { DiscordStenographerMessage } from "../app/stenographer/discordstenographermessage.js";
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js'
import { PerformanceCounter } from '../performancecounter.js';

import { LLMInteractionMessageFactory } from '../llm/llminteractionmessage.js';
import { LLMBotManager } from '../llm/llmbot.js';

import config from 'config';

class ChatCommand extends DiscordBotCommand {
    async handle(interaction: Discord.ChatInputCommandInteraction): Promise<void>  {
        using perfCounter = PerformanceCounter.Create("handleChatCommand(): ");
        
        const msg = LLMInteractionMessageFactory.createFromDiscordChatInputCommandInteraction(interaction);
        const koalaSlashCommand = KoalaSlashCommandRequest.fromDiscordInteraction(interaction);

        // Throw this into the stenographer otherwise the robot won't know what's going on since we 
        // funnel it as if it was just a regular message.
        Stenographer.pushMessage(new DiscordStenographerMessage(
            msg.getGuildId(),
            msg.getChannelId(),
            interaction.user.username,
            interaction.user.id,
            koalaSlashCommand.getOptionValueString('response'),
            Date.now()
        ));

        return LLMBotManager.getLLMBot(msg.getAiModel())?.handleUserInteraction(this.runtimeData(), msg);
    }

    get(): Discord.SlashCommandOptionsOnlyBuilder {
        const models = config.get<string>("Chat.AiModels.enabledModels").split(",")
                                .map((model: string) => {
                                    return { name: model, value: model };
                                });

        const chatCommand = new Discord.SlashCommandBuilder()
                        .setName(this.name())
                        .setDescription(`Chat with ${config.get("Global.botName")}`)
                        .addStringOption((option) =>
                            option
                                .setName('response')
                                .setDescription(`Response to ${config.get("Global.botName")}`)
                                .setRequired(true),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('token_count')
                                .setDescription('Max Tokens to use (This costs money assholes)')
                                .addChoices(
                                    { name: 'extra_low', value: '8192' },
                                    { name: 'default', value: '24576' },
                                    { name: 'high', value: '73728' },
                                    { name: 'max', value: '128000' },
                                )
                                .setRequired(false),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('ai_model')
                                .setDescription('AI Model to use')
                                .addChoices(
                                    ...models
                                )
                                .setRequired(false),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('ai_prompt')
                                .setDescription('Prompt to tell the robot how to behave, e.g. You are a helpful assistant.')
                                .setRequired(false),
                        )
                        .addBooleanOption((option) => 
                            option
                                .setName('use_guild_log')
                                .setDescription(`Use logs from all channels in server, not just channel. Default is true for /chat, false for @${config.get("Global.botName")}`)
                                .setRequired(false),
                        )
                        .addStringOption((option) => 
                            option
                                .setName('override_channel_id')
                                .setDescription(`Use logs from specific channel when guild (whole server) logs are disabled.`)
                                .setRequired(false),
                        )

                        ;
        return chatCommand;
    }

} 

const chatInstance = new ChatCommand('chat');
registerDiscordBotCommand(chatInstance);
