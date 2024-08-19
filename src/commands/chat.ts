/*
    AI chatbot functionality
*/

import { KoalaSlashCommandRequest } from '../koala-bot-interface/koala-slash-command.js';

import { SlashCommandOptionsOnlyBuilder, SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { OpenAIHelper } from '../helpers/openaihelper.js';
import { Stenographer, DiscordStenographerMessage } from '../helpers/discordstenographer.js';
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/DiscordBotCommand.js'

class ChatCommand extends DiscordBotCommand {
    
    static getTokens(msg): number {
        return msg.length / 4;
    }

    async handle(interaction: ChatInputCommandInteraction): Promise<void>  {
        using perfCounter = this.runtimeData().getPerformanceCounter("handleChatCommand(): ");

        try {    
            const slashCommandRequest = KoalaSlashCommandRequest.fromDiscordInteraction(interaction);
            const question = `${interaction.member.user.username}: ${slashCommandRequest.getOptionValueString('response')}`;
    
            try {
                let messageData = [];
                const discordBotId = this.runtimeData().bot().client().user.id;
                const discordBotName = this.runtimeData().bot().client().user.username;
    
                messageData.push({
                    "role": "system",
                    "content": `You are a helpful assistant named ${this.runtimeData().bot().client().user.username}<@${discordBotId}> in a chat room where users talk to each other in a username: text format`
                });
    
                const userQuestion = { "role": "user", "content": question };
    
                // start with the header and footer accounted for
                let tokens = ChatCommand.getTokens(messageData[0].content) + ChatCommand.getTokens(userQuestion.content);
    
                let maxTokens = slashCommandRequest.getOptionValueNumber('token_count', parseInt(this.runtimeData().settings().get("GPT_TOKEN_COUNT")));
                let model = slashCommandRequest.getOptionValueString('ai_model', "gpt-4o");
    
                // Set a maximum number of discrete messages
                const maxMessages = parseInt(this.runtimeData().settings().get("GPT_MAX_MESSAGES")) || 2048;
    
                Stenographer.getMessages().slice().reverse().every(entry => {
                    const msg = entry.getStandardDiscordMessageFormat();
    
                    const msgTokens = ChatCommand.getTokens(msg);
                    tokens += msgTokens;
    
                    if (tokens > maxTokens || messageData.length >= maxMessages)
                        return false;
    
                    if (entry.authorId == discordBotId) {
                        messageData.unshift({ "role": "assistant", "content": msg });
                    }
                    else {
                        messageData.unshift({ "role": "user", "content": msg });
                    }
    
                    return true;
                });
    
                messageData.push(userQuestion);
    
                // Add the question to the list of messages
                Stenographer.pushMessage(new DiscordStenographerMessage(
                    interaction.member.user.username,
                    interaction.member.user.id,
                    slashCommandRequest.getOptionValueString('response'),
                    Date.now
                ));
    
                // Trim message data length based on maximum length of array
                //  This is checked earlier, but this catches any additional
                //  messages that might be added before actually making the
                //  call to the completion.
                while (messageData.length > maxMessages) messageData.shift();
    
                const completion = await OpenAIHelper.getInterface().chat.completions.create({
                    model: model,
                    messages: messageData
                });
    
                const responseText = completion.choices[0].message.content;
    
                // Add the response to our list of stuff
                Stenographer.pushMessage(new DiscordStenographerMessage(
                    discordBotName,
                    discordBotId,
                    responseText,
                    Date.now
                ));
    
                this.runtimeData().logger().logInfo(`Asked: ${question}, got: ${responseText}`);
                await this.runtimeData().helpers().editAndSplitReply(interaction, `Query \"${question}\": ${responseText}`);
            } catch (e) {
                await this.runtimeData().logger().logError(`Exception getting chat reply to ${question}, got error ${e}`, interaction, true);
            }
        }
        catch (e) {
            await this.runtimeData().logger().logError(`Top level exception getting chat reply, got error ${e}`, interaction, true);
        }
    }

    get(): SlashCommandOptionsOnlyBuilder {
        const chatCommand = new SlashCommandBuilder()
                        .setName(this.name())
                        .setDescription(`Chat with ${this.runtimeData().settings().get("BOT_NAME")}`)
                        .addStringOption((option) =>
                            option
                                .setName('response')
                                .setDescription(`Response to ${this.runtimeData().settings().get("BOT_NAME")}`)
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
                                    { name: 'gpt-4o', value: 'gpt-4o' },
                                    { name: 'gpt-4-turbo', value: 'gpt-4-turbo' },
                                )
                                .setRequired(false),
                        )

                        ;
        return chatCommand;
    }

} 

registerDiscordBotCommand(new ChatCommand('chat'));
