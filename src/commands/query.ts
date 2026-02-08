/*
	Ask AI a question without context
*/

import { SlashCommandBuilder } from 'discord.js';
import { OpenAiApi } from '../llm/api/openai.js';
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js';
import { PerformanceCounter } from '../performancecounter.js';
import { getCommonLogger } from '../logging/logmanager.js'
import { DiscordPlatform } from '../platform/discord/discordplatform.js';

import config from 'config';

class QueryCommand extends DiscordBotCommand {

    // @ts-expect-error todo cleanup tech debt
    async handle(interaction) {
        using perfCounter = PerformanceCounter.Create("handleQueryCommand(): ");

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
                    await this.handleDavinciQuery(interaction, question);
                }
                else {
                    await this.handleChatModelQuery(interaction, question, model);
                }
            } catch (e) {
                await getCommonLogger().logErrorAsync(`Exception during query for ${question}, got error ${e}`, interaction, true);
            }
        } catch (e) {

            await getCommonLogger().logErrorAsync(`Top level exception during query command, got error ${e}`, interaction, true);
        }        
    }

    // @ts-expect-error todo cleanup tech debt
    async handleChatModelQuery(interaction, question, ai_model) {
        try {
            const completion = await OpenAiApi.getInterface().chat.completions.create({
                model: ai_model,
                messages: [
                    { "role": "user", "content": question }
                ]
            });
            const responseText = completion.choices[0].message.content;
            getCommonLogger().logInfo(`Asked: ${question}, got: ${responseText}`);

            await DiscordPlatform.editAndSplitReply(interaction, `Query "${question}": ${responseText}`);
        }
        catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to get chat reply for ${question}, got error ${e}`, interaction, true);
        }
    }

    // @ts-expect-error todo cleanup tech debt
    async handleDavinciQuery(interaction, question) {
        try {
            const model = `text-davinci-003`;

            // @ts-expect-error todo cleanup tech debt
            const completion = await OpenAiApi.getInterface().createCompletion({
                model: `${model}`,
                prompt: `${question}`,
                stream: false,
                max_tokens: 4000,
            });

            const responseText = completion.data.choices[0].text;

            getCommonLogger().logInfo(`Asked: ${question}, got: ${responseText}`);
            await DiscordPlatform.editAndSplitReply(interaction, `Query "${question}": ${responseText}`);
        } catch (e) {
            await getCommonLogger().logErrorAsync(`Failed to get davinci reply for ${question}, got error ${e}`, interaction, true);
        }
    }

    get() {
        const queryCommand = new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(`Ask ${config.get<string>("Global.botName")} a question`)
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
                        { name: 'o1', value: 'o1' },
                        { name: 'o1-mini', value: 'o1-mini' },
                        { name: 'o3-mini', value: 'o3-mini' },
                        { name: 'chatgpt-4o-latest', value: 'chatgpt-4o-latest' },
                    )
                    .setRequired(false),
            )
            ;
        return queryCommand;
    }
}

registerDiscordBotCommand(new QueryCommand('query'), false);
