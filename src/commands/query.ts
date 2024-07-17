/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

	Ask AI a question without context
*/

import { Global } from '../global.js';
import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js';
import { OpenAIHelper } from '../helpers/openaihelper.js';

/**
 * Ask ChatGPT something without additional context
 * @param {Discord.interaction} interaction
 */
async function handleQueryCommand(interaction) {
    using perfCounter = Global.getPerformanceCounter("handleQueryCommand(): ");

    try {
        await interaction.deferReply();

        let question = "";
        let model = "gpt-4o";

        for (let i = 0; i < interaction.options.data.length; i++) {
            if (interaction.options.data[i].name === "question") {
                question = interaction.options.data[i].value;
            } else if (interaction.options.data[i].name === "ai_model") {
                model = interaction.options.data[i].value;
            }
        }

        try {
            if (model == "text-davinci-003") {
                await handleDavinciQuery(interaction, question);
            }
            else {
                await handleChatModelQuery(interaction, question, model);
            }
        } catch (e) {
            await Global.logger().logError(`Exception during query for ${question}, got error ${e}`, interaction, true);
        }
    } catch (e) {

        await Global.logger().logError(`Top level exception during query command, got error ${e}`, interaction, true);
    }

    
}

async function handleChatModelQuery(interaction, question, ai_model) {
    try {
        const completion = await OpenAIHelper.getInterface().chat.completions.create({
            model: ai_model,
            messages: [
                { "role": "user", "content": question }
            ]
        });
        const responseText = completion.choices[0].message.content;
        Global.logger().logInfo(`Asked: ${question}, got: ${responseText}`);

        //await interaction.editReply(`Query \"${question}\": ${responseText}`);
        await Global.editAndSplitReply(interaction, `Query \"${question}\": ${responseText}`);
    }
    catch (e) {
        await Global.logger().logError(`Failed to get chat reply for ${question}, got error ${e}`, interaction, true);
    }
}

async function handleDavinciQuery(interaction, question) {
    try {
        const model = `text-davinci-003`;

        const completion = await OpenAIHelper.getInterface().createCompletion({
            model: `${model}`,
            prompt: `${Global.settings().get("QUERY_PROMPT_HEADER")} ${question}`,
            stream: false,
            max_tokens: 4000,
        });

        const responseText = completion.data.choices[0].text;

        Global.logger().logInfo(`Asked: ${question}, got: ${responseText}`);
        await Global.editAndSplitReply(interaction, `Query \"${question}\": ${responseText}`);
    } catch (e) {

        await Global.logger().logError(`Failed to get davinci reply for ${question}, got error ${e}`, interaction, true);
    }
}

function getQueryCommand() {
    const queryCommand = new SlashCommandBuilder()
        .setName('query')
        .setDescription(`Ask ${Global.settings().get("BOT_NAME")} a question`)
        .addStringOption((option) =>
            option
                .setName('question')
                .setDescription('Question to ask')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('ai_model')
                .setDescription('AI Model to use')
                .addChoices(
                    { name: 'gpt-3.5-turbo', value: 'gpt-3.5-turbo' },
                    { name: 'gpt-4o', value: 'gpt-4o' },
                    { name: 'gpt-4-turbo', value: 'gpt-4-turbo' },
                    { name: 'davinci', value: 'text-davinci-003' },
                )
                .setRequired(false),
        )
        ;
    return queryCommand;
}

function registerQueryCommand(client) {
    const query =
    {
        data: getQueryCommand(),
        async execute(interaction) {
            await handleQueryCommand(interaction);
        }
    }

    client.commands.set(query.data.name, query);
}

function getQueryJSON() {
    return getQueryCommand().toJSON();
}

Global.registerCommandModule(registerQueryCommand, getQueryJSON);
