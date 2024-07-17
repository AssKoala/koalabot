/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

	AI Vision processing (view images and describe them)
*/

import { Global } from '../global.js';
import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js';
import { OpenAIHelper } from '../helpers/openaihelper.js';

/**
 * Handles a GPT vision request (ask GPT to analyze an image from a url)
 * @param {Discord.interaction} interaction
 */
async function handleVisionCommand(interaction) {
    using perfCounter = Global.getPerformanceCounter("handleVisionCommand(): ");

    try {
        await interaction.deferReply();

        let detail = 'low';
        let url = "";
        let query = "";
        let model = 'gpt-4o';

        for (let i = 0; i < interaction.options.data.length; i++) {
            const name = interaction.options.data[i].name;

            switch (name) {
                case 'detail':
                    detail = interaction.options.data[i].value;
                    break;
                case 'image_url':
                    url = interaction.options.data[i].value;
                    break;
                case 'query':
                    query = interaction.options.data[i].value;
                    break;
                case 'ai_model':
                    model = interaction.options.data[i].value;
                    break;
                default:
                    Global.logger().logError(`handleVisionCommand::unknown option ${name}`);
                    break;
            }
        }

        const response = await OpenAIHelper.getInterface().chat.completions.create({
            model: model,
            messages: [
                {
                    "role": "user",
                    "content": [
                        { "type": "text", "text": `${query}` },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": `${url}`,
                                "detail": `${detail}`
                            },
                        },
                    ],
                }
            ],
            max_tokens: 2048,
        })

        const responseText = response.choices[0].message.content;

        await Global.editAndSplitReply(interaction, `Query: \"${query}\" Image: ${url}: ${responseText}`);
    } catch (e) {
        await Global.logger().logError(`Top level exception during vision, got error ${e}`, interaction, true);
    }

    
}

function getVisionCommand() {
    const visionCommand = new SlashCommandBuilder()
        .setName('vision')
        .setDescription(`Ask ${Global.settings().get("BOT_NAME")} to analyze an image`)
        .addStringOption((option) =>
            option
                .setName('image_url')
                .setDescription('Url of image to analyze')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription('Query about the image')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('detail')
                .setDescription('Image size to generate')
                .addChoices(
                    { name: 'low', value: 'low' },
                    { name: 'high', value: 'high' },
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

    return visionCommand;
}

function registerVisionCommand(client) {
    const vision =
    {
        data: getVisionCommand(),
        async execute(interaction) {
            await handleVisionCommand(interaction);
        }
    }

    client.commands.set(vision.data.name, vision);
}

function getVisionJSON() {
    return getVisionCommand().toJSON();
}

Global.registerCommandModule(registerVisionCommand, getVisionJSON);
