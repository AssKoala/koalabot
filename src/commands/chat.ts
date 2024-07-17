/*
    BottyMcBotFace: 2cpu channel bot

    Licensed under GPLv3
	
    Copyright 2024, Jose M Caban (asskoala@gmail.com)

    AI chatbot functionality
*/

import { Global } from '../global.js';
import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js';
import { OpenAIHelper } from '../helpers/openaihelper.js';
import { Stenographer, DiscordStenographerMessage } from '../helpers/discordstenographer.js';

function getTokens(msg) {
    return msg.length / 4;
}

/**
 * Handle Chat type ChatGPT query where logs are passed to ChatGPT
 * @param {Discord.interaction} interaction
 */
async function handleChatCommand(interaction) {
    using perfCounter = Global.getPerformanceCounter("handleChatCommand(): ");

    try {
        await interaction.deferReply();

        const question = `${interaction.member.user.username}: ${interaction.options.data[0].value}`;

        try {
            let messageData = [];
            const discordBotId = Global.bot().client().user.id;
            const discordBotName = Global.bot().client().user.username;

            messageData.push({
                "role": "system",
                "content": `You are a helpful assistant named ${Global.bot().client().user.username}<@${discordBotId}> in a chat room where users talk to each other in a username: text format`
            });

            const userQuestion = { "role": "user", "content": question };

            // start with the header and footer accounted for
            let tokens = getTokens(messageData[0].content) + getTokens(userQuestion.content);

            let maxTokens = parseInt(Global.settings().get("GPT_TOKEN_COUNT"));
            let model = "gpt-4o";

            for (let i = 0; i < interaction.options.data.length; i++) {
                const name = interaction.options.data[i].name;

                switch (name) {
                    case 'token_count':
                        maxTokens = parseInt(interaction.options.data[i].value);
                        break;
                    case 'ai_model':
                        model = interaction.options.data[i].value;
                        break;
                    case 'response':
                        // Nothing to do
                        break;
                    default:
                        Global.logger().logError(`handleChatCommand()::Unknown option ${name}!`);
                }
            }

            // Set a maximum number of discrete messages
            const maxMessages = parseInt(Global.settings().get("GPT_MAX_MESSAGES")) || 2048;

            Stenographer.getMessages().slice().reverse().every(entry => {
                const msg = entry.getStandardDiscordMessageFormat();

                const msgTokens = getTokens(msg);
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
                interaction.options.data[0].value,
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

            Global.logger().logInfo(`Asked: ${question}, got: ${responseText}`);
            await Global.editAndSplitReply(interaction, `Query \"${question}\": ${responseText}`);
        } catch (e) {
            await Global.logger().logError(`Exception getting chat reply to ${question}, got error ${e}`, interaction, true);
        }
    }
    catch (e) {
        await Global.logger().logError(`Top level exception getting chat reply, got error ${e}`, interaction, true);
    }

    
}

function getChatCommand() {
    const chatCommand = new SlashCommandBuilder()
        .setName('chat')
        .setDescription(`Chat with ${Global.settings().get("BOT_NAME")}`)
        .addStringOption((option) =>
            option
                .setName('response')
                .setDescription(`Response to ${Global.settings().get("BOT_NAME")}`)
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

function registerChatCommand(client) {
    const chat =
    {
        data: getChatCommand(),
        async execute(interaction) {
            await handleChatCommand(interaction);
        }
    }

    client.commands.set(chat.data.name, chat);
}

function getChatJSON() {
    return getChatCommand().toJSON();
}

Global.registerCommandModule(registerChatCommand, getChatJSON);