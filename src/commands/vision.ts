/*
	AI Vision processing (view images and describe them)
*/

import { SlashCommandBuilder, AttachmentBuilder, Utils, ChatInputCommandInteraction } from 'discord.js';
import { OpenAiApi } from '../llm/api/openai.js';
import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js';
import config from 'config';
import { PerformanceCounter } from '../performancecounter.js';
import { getCommonLogger } from '../logging/logmanager.js';
import { DiscordPlatform } from '../platform/discord/discordplatform.js'

class VisionCommand extends DiscordBotCommand {
    
    async handle(interaction: ChatInputCommandInteraction) {
        using perfCounter = PerformanceCounter.Create("handleVisionCommand(): ");

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
                        detail = interaction.options.data[i].value!.toString();
                        break;
                    case 'image_url':
                        url = interaction.options.data[i].value!.toString();
                        break;
                    case 'query':
                        query = interaction.options.data[i].value!.toString();
                        break;
                    case 'ai_model':
                        model = interaction.options.data[i].value!.toString();
                        break;
                    default:
                        getCommonLogger().logErrorAsync(`handleVisionCommand::unknown option ${name}`);
                        break;
                }
            }

            const response = await OpenAiApi.getInterface().chat.completions.create({
                model: model,
                messages: [
                    {
                        "role": "user",
                        "content": [
                            { "type": "text", "text": `${query}` },
                            {

                                // @ts-expect-error todo cleanup tech debt
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

            await DiscordPlatform.editAndSplitReply(interaction, `Query: \"${query}\" Image: ${url}: ${responseText}`);
        } catch (e) {
            await getCommonLogger().logErrorAsync(`Top level exception during vision, got error ${e}`, interaction, true);
        }

        
    }

    get() {
        const visionCommand = new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(`Ask ${config.get<string>("Global.botName")} to analyze an image`)
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
}

registerDiscordBotCommand(new VisionCommand('vision'), false);
