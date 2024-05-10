/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

    Allows ChatGPT question asking.
*/

import { Common } from '../common.js';
import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js';
import { OpenAI } from 'openai';
import { DownloaderHelper } from 'node-downloader-helper';
import { mkdir, rm } from 'node:fs/promises'
import { Stenographer, DiscordStenographerMessage } from '../helpers/discordstenographer.js';

// Setup openAI config
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/************************/
/* Vision */

/**
 * Handles a GPT vision request (ask GPT to analyze an image from a url)
 * @param {Discord.interaction} interaction
 */
async function handleVisionCommand(interaction) {
    const start = Common.startTiming("handleVisionCommand(): ");

    try {
        await interaction.deferReply();

        let detail = 'low';
        let url = "";
        let query = "";

        for (let i = 0; i < interaction.options.data.length; i++)
        {
            const name = interaction.options.data[i].name;

            switch (name)
            {
                case 'detail':
                    detail = interaction.options.data[i].value;
                    break;
                case 'image_url':
                    url = interaction.options.data[i].value; 
                    break;
                case 'query':
                    query = interaction.options.data[i].value; 
                    break;
                default:
                    break;
            }
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
              {
                "role": "user",
                "content": [
                  {"type": "text", "text": `${query}`},
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

        await Common.editAndSplitReply(interaction, `Query: \"${query}\" Image: ${url}: ${responseText}`);
    } catch (e) {   
        await Common.logError(`Top level exception during vision, got error ${e}`, interaction, true);
    }

    Common.endTiming(start);
}

function getVisionCommand()
{
    const visionCommand = new SlashCommandBuilder()
        .setName('vision')
        .setDescription(`Ask ${process.env.BOT_NAME} to analyze an image`)
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
    ;

    return visionCommand;
}

function registerVisionCommand(client)
{
    const vision = 
    {
        data: getVisionCommand(),
        async execute(interaction) {
            await handleVisionCommand(interaction);
        }
    }

    client.commands.set(vision.data.name, vision);
}

function getVisionJSON()
{
    return getVisionCommand().toJSON();
}

/************************/
/* Image */

/**
 * Handles a GPT image command (generate an image using DALL-E 3)
 * @param {Discord.interaction} interaction
 */
async function handleImageCommand(interaction) {
    const start = Common.startTiming("handleImageCommand(): ");

    try {
        await interaction.deferReply();

        let description;
        let size = '1024x1024';
        let quality = 'standard';
        let forcePrompt = false;
        let promptPrepend = "I NEED to test how the tool works with extremely simple prompts. DO NOT add any detail, just use it AS-IS:";

        for (let i = 0; i < interaction.options.data.length; i++)
        {
            const name = interaction.options.data[i].name;

            switch (name) {
                case 'image_details':
                    description = interaction.options.data[i].value;
                    break;
                case 'image_size':
                    size = interaction.options.data[i].value;
                    break;
                case 'image_quality':
                    quality = interaction.options.data[i].value;
                    break;
                case 'force_prompt':
                    forcePrompt = interaction.options.data[i].value == 'true';
                    break;
                default:
                    break;
            }
        }

        try {
            let prompt = description;

            if (forcePrompt == true) {
                prompt = promptPrepend + prompt;
            }

            // Create the image with OpenAI
            const response = await openai.images.generate({
                model: "dall-e-3",
                prompt: `${prompt}`,
                n: 1,
                size: `${size}`,
                quality: `${quality}`,
            });
            const image_url = response.data[0].url;
            
            Common.logInfo(`Asked: ${prompt}, got ${image_url}`);

            // Download the image temporarily
            const download_dir = "./temp-images/";
            await mkdir(download_dir, { recursive: true });

            const dl = new DownloaderHelper(image_url, download_dir);
            dl.on('error', (err) => Common.logError(`Failed to download image for ${description}, got error ${err}`));
            await dl.start();
            
            const downloaded_fullpath = dl.getDownloadPath();
            const downloaded_filename = downloaded_fullpath.split("/").at(-1).split(`\\`).at(-1);

            // Create the attachment
            const file = new AttachmentBuilder(downloaded_fullpath);
            const embed = {
                title: description,
                image: {
                    url: `attachment://${downloaded_filename}`,
                }
            }

            await interaction.editReply({ embeds: [embed], files: [file]});

            // Delete the file
            await rm(downloaded_fullpath);
        } catch (e) {
            await Common.logError(`Exception generating image of ${description}, got error ${e}`, interaction, true);    
        }

    } catch (e) {
        
        await Common.logError(`Top level exception during image, got error ${e}`, interaction, false);
    }

    Common.endTiming(start);
}

function getImageCommand()
{
    const imageCommand = new SlashCommandBuilder()
        .setName('image')
        .setDescription(`Ask ${process.env.BOT_NAME} to generate an image`)
        .addStringOption((option) =>
            option
                .setName('image_details')
                .setDescription('Details of what to generate')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('image_size')
                .setDescription('Image size to generate')
                .addChoices(
                    { name: 'square', value: '1024x1024' },
                    { name: 'tall', value: '1024x1792' },
                    { name: 'wide', value: '1792x1024' },
                )
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName('image_quality')
                .setDescription('Image quality to use')
                .addChoices(
                    { name: 'standard', value: 'standard' },
                    { name: 'hd', value: 'hd' },
                )
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName('force_prompt')
                .setDescription('Attempt to disable additional details and execute prompt as-is')
                .addChoices(
                    { name: 'enable', value: 'true' },
                    { name: 'disable', value: 'false' },
                )
                .setRequired(false),
        )
    ;

    return imageCommand;
}


function registerImageCommand(client)
{
    const image = 
    {
        data: getImageCommand(),
        async execute(interaction) {
            await handleImageCommand(interaction);
        }
    }

    client.commands.set(image.data.name, image);
}

function getImageJSON()
{
    return getImageCommand().toJSON();
}

/************************/
/* Query */

/**
 * Ask ChatGPT something without additional context
 * @param {Discord.interaction} interaction
 */
async function handleQueryCommand(interaction)
{
    const start = Common.startTiming("handleQueryCommand(): ");

    try {
        await interaction.deferReply();
        
        let question = "";
        let model = "gpt-4-turbo";

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
            await Common.logError(`Exception during query for ${question}, got error ${e}`, interaction, true);    
        }
    } catch (e) {
        
        await Common.logError(`Top level exception during query command, got error ${e}`, interaction, true);
    }

    Common.endTiming(start);
}

async function handleChatModelQuery(interaction, question, ai_model)
{
    try {
        const completion = await openai.chat.completions.create({
            model: ai_model,
            messages: [
                {"role": "user", "content": question}
            ]
        });
        const responseText = completion.choices[0].message.content;
        Common.logInfo(`Asked: ${question}, got: ${responseText}`);

        //await interaction.editReply(`Query \"${question}\": ${responseText}`);
        await Common.editAndSplitReply(interaction, `Query \"${question}\": ${responseText}`);
    }
    catch (e)
    {
        await Common.logError(`Failed to get chat reply for ${question}, got error ${e}`, interaction, true);
    }
}

async function handleDavinciQuery(interaction, question)
{
    try {
        const model = `text-davinci-003`;

        const completion = await openai.createCompletion({
            model: `${model}`,
            prompt: `${process.env.QUERY_PROMPT_HEADER} ${question}`,
            stream: false,
            max_tokens: 4000,
        });

        const responseText = completion.data.choices[0].text;

        Common.logInfo(`Asked: ${question}, got: ${responseText}`);
        await Common.editAndSplitReply(interaction, `Query \"${question}\": ${responseText}`);
    } catch (e) {
        
        await Common.logError(`Failed to get davinci reply for ${question}, got error ${e}`, interaction, true);
    }
}

function getQueryCommand()
{
    const queryCommand = new SlashCommandBuilder()
        .setName('query')
        .setDescription(`Ask ${process.env.BOT_NAME} a question`)
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
                    { name: 'gpt-4', value: 'gpt-4' },
                    { name: 'davinci', value: 'text-davinci-003' },
                )
                .setRequired(false),
        )
    ;
    return queryCommand;
}

function registerQueryCommand(client)
{
    const query = 
    {
        data: getQueryCommand(),
        async execute(interaction) {
            await handleQueryCommand(interaction);
        }
    }

    client.commands.set(query.data.name, query);
}

function getQueryJSON()
{
    return getQueryCommand().toJSON();
}

function getTokens(msg)
{
    return msg.length / 4;
}

/************************/
/* Chat */

/**
 * Handle Chat type ChatGPT query where logs are passed to ChatGPT
 * @param {Discord.interaction} interaction
 */
async function handleChatCommand(interaction)
{
    const start = Common.startTiming("handleChatCommand(): ");

    try {
        await interaction.deferReply();

        const question = `${interaction.member.user.username}: ${interaction.options.data[0].value}`;

        try {
            let messageData = [];
            const discordBotId = Common.getDiscordClient().user.id;
            const discordBotName = Common.getDiscordClient().user.username;

            messageData.push({"role": "system", 
                "content": `You are a helpful assistant named ${Common.getDiscordClient().user.username}<@${discordBotId}> in a chat room where users talk to each other in a username: text format`});

            const userQuestion = {"role": "user", "content": question};
            
            // start with the header and footer accounted for
            let tokens = getTokens(messageData[0].content) + getTokens(userQuestion.content);

            let maxTokens = process.env.GPT_TOKEN_COUNT;
            for (let i = 0; i < interaction.options.data.length; i++)
            {
                const name = interaction.options.data[i].name;

                if (name == 'token_count')
                {
                    maxTokens = parseInt(interaction.options.data[i].value);
                }
            }

            // Set a maximum number of discrete messages
            const maxMessages = process.env.GPT_MAX_MESSAGES || 2048;

            Stenographer.getMessages().slice().reverse().every(entry => {
                const msg = entry.getStandardDiscordMessageFormat();
                
                const msgTokens = getTokens(msg);
                tokens += msgTokens;

                if (tokens > maxTokens || messageData.length >= maxMessages)
                    return false;

                if (entry.authorId == discordBotId)
                {
                    messageData.unshift({"role": "assistant", "content": msg});        
                }
                else
                {
                    messageData.unshift({"role": "user", "content": msg});
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

            const completion = await openai.chat.completions.create({
                model: "gpt-4-turbo",
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

            Common.logInfo(`Asked: ${question}, got: ${responseText}`);
            await Common.editAndSplitReply(interaction, `Query \"${question}\": ${responseText}`);
        } catch (e) {
            await Common.logError(`Exception getting chat reply to ${question}, got error ${e}`, interaction, true);    
        }
    }
    catch (e)
    {
        await Common.logError(`Top level exception getting chat reply, got error ${e}`, interaction, true);
    }

    Common.endTiming(start);
}

function getChatCommand()
{
    const chatCommand = new SlashCommandBuilder()
        .setName('chat')
        .setDescription(`Chat with ${process.env.BOT_NAME}`)
        .addStringOption((option) =>
            option
                .setName('response')
                .setDescription(`Response to ${process.env.BOT_NAME}`)
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
    ;
    return chatCommand;
}

function registerChatCommand(client)
{
    const chat = 
    {
        data: getChatCommand(),
        async execute(interaction) {
            await handleChatCommand(interaction);
        }
    }

    client.commands.set(chat.data.name, chat);
}

function getChatJSON()
{
    return getChatCommand().toJSON();
}

Common.registerCommandModule(registerQueryCommand, getQueryJSON);
Common.registerCommandModule(registerChatCommand, getChatJSON);
Common.registerCommandModule(registerImageCommand, getImageJSON);
Common.registerCommandModule(registerVisionCommand, getVisionJSON);
