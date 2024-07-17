/*
    BottyMcBotFace: 2cpu channel bot

    Licensed under GPLv3
	
    Copyright 2022, Jose M Caban (asskoala@gmail.com)

    AI Image Generation
*/

import { Global } from '../global.js';
import { SlashCommandBuilder, AttachmentBuilder, Utils } from 'discord.js';
import { OpenAIHelper } from '../helpers/openaihelper.js';
import { DownloaderHelper } from 'node-downloader-helper';
import { mkdir, rm } from 'node:fs/promises';
import { got } from 'got';
import fs from 'node:fs';
import crypto from 'crypto';

class ImageGenerationData {
    #prompt = '';
    #size = '1024x1024';
    #quality = 'standard';
    #forcePrompt = false;
    #promptPrepend = "I NEED to test how the tool works with extremely simple prompts. DO NOT add any detail, just use it AS-IS:";
    #model = "dalle";
    #sd_model_checkpoint = 'Deliberate_v6.safetensors';

    #isSizeValid(image_size) {
        try {
            const width = parseInt(image_size.split('x')[0]);
            const height = parseInt(image_size.split('x')[1]);

            return true;
        } catch (e) {
            return false;
        }
    }

    constructor(interaction) {
        this.#model = interaction.options.data[0].name;

        for (let i = 0; i < interaction.options.data[0].options[0].options.length; i++) {
            const name = interaction.options.data[0].options[0].options[i].name;
            const value = interaction.options.data[0].options[0].options[i].value;

            switch (name) {
                case 'image_details':
                    this.#prompt = value;
                    break;
                case 'image_size':
                    if (this.#isSizeValid(value)) {
                        this.#size = value;
                    }
                    break;
                case 'image_quality':
                    this.#quality = value;
                    break;
                case 'force_prompt':
                    this.#forcePrompt = (value == 'true');
                    break;
                case 'sd_model_checkpoint':
                    this.#sd_model_checkpoint = value;
                    break;
                default:
                    break;
            }
        }
    }

    model() {
        return this.#model;
    }

    prompt() {
        if (this.#forcePrompt) {
            return this.#promptPrepend + this.#prompt;
        }
        else {
            return this.#prompt;
        }        
    }

    size() {
        return this.#size;
    }

    width() {
        return this.#size.split('x')[0];
    }

    height() {
        return this.#size.split('x')[1];
    }

    sd_model_checkpoint() {
        return this.#sd_model_checkpoint;
    }

    quality() {
        return this.#quality;
    }

    forcedPrompt() {
        return this.#forcePrompt;
    }

    promptPrepend() {
        return this.#promptPrepend;
    }
}

class OpenAI {
    static async #getImageUrl(imageGenData, interaction) {
        using perfCounter = Global.getPerformanceCounter("image::getImageUrl(): ");
        let image_url = null;
        let error = null;

        try {

            // Create the image with OpenAI
            const response = await OpenAIHelper.getInterface().images.generate({
                model: "dall-e-3",
                prompt: `${imageGenData.prompt()}`,
                n: 1,
                size: `${imageGenData.size()}`,
                quality: `${imageGenData.quality()}`,
            });

            image_url = response.data[0].url;

            Global.logger().logInfo(`Asked: ${imageGenData.prompt()}, got ${image_url}`);
        } catch (e) {
            error = e;
            await Global.logger().logError(`Exception occurred during image gen, asked: ${imageGenData.prompt()}, got ${e}`, interaction, true);
        }

        

        return {
            image_url: image_url, error: error
        };
    }

    static async #downloadUrlToFile(url, download_dir = Global.settings().get("TEMP_PATH")) {
        // Download the image temporarily
        await mkdir(download_dir, { recursive: true });

        const dl = new DownloaderHelper(url, download_dir);
        dl.on('error', (err) => Global.logger().logError(`Failed to download image from ${url} to ${download_dir}, got error ${err}`));
        await dl.start();

        const downloaded_fullpath = dl.getDownloadPath();
        const downloaded_filename = downloaded_fullpath.split("/").at(-1).split(`\\`).at(-1);

        return {
            "fullpath": downloaded_fullpath,
            "filename": downloaded_filename,
        }
    }

    static async download(imageGenData, interaction) {
        try {
            const result = await OpenAI.#getImageUrl(imageGenData, interaction);

            if (result.error != null) {
                Global.logger().logError(`Error getting image URL, got error ${result.error}`);
            } else {
                const downloadedFileinfo = await OpenAI.#downloadUrlToFile(result.image_url);
                return downloadedFileinfo;
            }
        } catch (e) {
            await Global.logger().logError(`Unexpected error generating OpenAI image, got ${e}`, interaction, true);
        }

        return null;
    }
}

class StableDiffusion {
    static async download(imageGenData, interaction) {
        try {
            const payload = {
                "prompt": imageGenData.prompt(),
                "steps": 25,
                "width": imageGenData.width(),
                "height": imageGenData.height(),
                "override_settings": {
                    "sd_model_checkpoint": imageGenData.sd_model_checkpoint()
                }
            };

            const address = Global.settings().has("SD_WEBUI_ADDRESS") ? Global.settings().get("SD_WEBUI_ADDRESS") : "127.0.0.0:7860"
            const data = <any> await got.post(`http://${address}/sdapi/v1/txt2img`, { json: payload }).json();

            const hash = crypto.createHash('md5').update(data.images[0]).digest('hex');
            const filename = hash + '.png';
            const fullpath = `${Global.settings().get("TEMP_PATH")}/${filename}`;

            const decoded = Buffer.from(data.images[0], "base64");
            try {
                fs.writeFileSync(fullpath, decoded);
                Global.logger().logInfo(`Successfully wrote temp-image to ${fullpath}`);
            } catch (e) {
                await Global.logger().logError(`Failed to write temp-image file, got ${e}`, interaction, true);
            }
            

            return {
                "fullpath": fullpath,
                "filename": filename,
            }
        } catch (e) {
            await Global.logger().logError(`Got error calling stable diffusion api: ${e}`, interaction, true);
        }

        return null;
    }
}

/**
 * Handles a GPT image command (generate an image using DALL-E 3)
 * @param {Discord.interaction} interaction
 */
async function handleImageCommand(interaction) {
    using perfCounter = Global.getPerformanceCounter("handleImageCommand(): ");

    try {
        await interaction.deferReply();

        const imageGenData = new ImageGenerationData(interaction);

        let downloadedFileInfo = null;

        switch (imageGenData.model()) {
            case 'dalle':
                downloadedFileInfo = await OpenAI.download(imageGenData, interaction);
                break;
            case 'stablediffusion':
                downloadedFileInfo = await StableDiffusion.download(imageGenData, interaction);
                break;
            default:
                await Global.logger().logError(`Unexpected model ${imageGenData.model()}`, interaction, true);
                return;
        }

        if (downloadedFileInfo != null) {
            // Create the attachment
            try {
                const file = new AttachmentBuilder(downloadedFileInfo.fullpath);
                const embed = {
                    title: imageGenData.prompt().substring(0, 256),
                    image: {
                        url: `attachment://${downloadedFileInfo.filename}`,
                    }
                }

                await interaction.editReply({ embeds: [embed], files: [file] });
            } catch (e) {
                await Global.logger().logError(`Failed to generate/post images, got ${e}`, interaction, true);
            }

            try {
                // Delete the file
                await rm(downloadedFileInfo.fullpath);
            } catch (e) {
                Global.logger().logError(`Failed to delete image file, might need manual cleanup, got ${e}`);
            }   
        }
    } catch (e) {
        await Global.logger().logError(`Top level exception during image, got error ${e}`, interaction, false);
    }

    
}

function getImageCommand() {
    const imageCommand = new SlashCommandBuilder()
        .setName('image')
        .setDescription(`Ask ${Global.settings().get("BOT_NAME")} to generate an image`)
        // Dall-E command group
        .addSubcommandGroup((group) =>
            group
                .setName('dalle')
                .setDescription('Generate an image using Dall-E')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('generate')
                        .setDescription('Generate an image using Dall-E')
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
                )
        )
        // Stable Diffusion
        .addSubcommandGroup((group) =>
            group
                .setName('stablediffusion')
                .setDescription('Generate an image using Stable Diffusion')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('generate')
                        .setDescription('Generate an image using Stable Diffusion')
                        .addStringOption((option) =>
                            option
                                .setName('image_details')
                                .setDescription('Details of what to generate')
                                .setRequired(true)
                        )
                        .addStringOption((option) =>
                            option
                                .setName('image_size')
                                .setDescription('Image size to generate (1024x1024 default)')
                                .setRequired(false)
                        )
                        .addStringOption((option) =>
                            option
                                .setName('sd_model_checkpoint')
                                .setDescription('Stable Diffusion Model (deliberate default)')
                                .setRequired(false)
                                .addChoices(
                                    { name: 'deliberate', value: 'Deliberate_v6.safetensors' },
                                    { name: 'dreamshaper', value: 'dreamshaper_8.safetensors' },
                                    { name: 'nsfw', value: 'newrealityxl-global-nsfw.safetensors' },
                                    { name: 'lofi', value: 'lofi_v4.safetensors' },
                                    { name: 'anime', value: 'storeBoughtGyozaMix_winterholiday2023edi.safetensors' },
                                    { name: 'illustrated', value: '2dn_2.safetensors' },
                                )
                        )
                )
        )
        ;

    return imageCommand;
}

function registerImageCommand(client) {
    const image =
    {
        data: getImageCommand(),
        async execute(interaction) {
            await handleImageCommand(interaction);
        }
    }

    client.commands.set(image.data.name, image);
}

function getImageJSON() {
    return getImageCommand().toJSON();
}

Global.registerCommandModule(registerImageCommand, getImageJSON);

export { ImageGenerationData }
