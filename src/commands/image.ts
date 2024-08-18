/*
    BottyMcBotFace: 2cpu channel bot

    Licensed under GPLv3
	
    Copyright 2022, Jose M Caban (asskoala@gmail.com)

    AI Image Generation
*/

import { KoalaSlashCommandRequest } from '../koala-bot-interface/koala-slash-command.js';

import { Global } from '../global.js';
import { SlashCommandBuilder, AttachmentBuilder, ChatInputCommandInteraction } from 'discord.js';
import { OpenAIHelper } from '../helpers/openaihelper.js';
import { DownloaderHelper } from 'node-downloader-helper';
import { mkdir, rm } from 'node:fs/promises';
import { got } from 'got';
import fs from 'node:fs';
import crypto from 'crypto';

// For getimg.ai
import fetch from 'node-fetch';
import { BasicCommand, DiscordBotCommand, registerDiscordBotCommand } from '../api/DiscordBotCommand.js';

class ImageGenerationData {
    readonly prompt: string = '';
    readonly size: string = '1024x1024';
    readonly quality: string = 'standard';
    readonly forcePrompt: boolean = false;
    readonly promptPrepend: string = "I NEED to test how the tool works with extremely simple prompts. DO NOT add any detail, just use it AS-IS:";
    readonly model: string = "dalle";
    readonly sd_model_checkpoint: string = 'Deliberate_v6.safetensors';
    readonly seed: number = 0;
    readonly steps: number = 4;

    private isSizeValid(image_size: string): boolean {
        try {
            const width = parseInt(image_size.split('x')[0]);
            const height = parseInt(image_size.split('x')[1]);

            return true;
        } catch (e) {
            return false;
        }
    }

    constructor(request: KoalaSlashCommandRequest) {
        this.model = request.getSubcommand().getGroup();
        this.prompt = request.getSubcommand().getOptionValueString('image_details');
        this.size = request.getSubcommand().getOptionValueString('image_size', this.size);
        this.quality = request.getSubcommand().getOptionValueString('image_quality', this.quality);
        this.forcePrompt = request.getSubcommand().getOptionValueBoolean('force_prompt', this.forcePrompt);
        this.sd_model_checkpoint = request.getSubcommand().getOptionValueString('sd_model_checkpoint', this.sd_model_checkpoint);
        this.steps = Math.min(6, Math.max(1, request.getSubcommand().getOptionValueNumber('steps', this.steps)));
        this.seed = Math.min(2147483647, Math.max(0, request.getSubcommand().getOptionValueNumber('seed', this.seed)));
    }

    getSteps(): number {
        return this.steps;
    }

    getSeed(): number {
        return this.seed;
    }

    getGeneratedPrompt() {
        if (this.forcePrompt) {
            return this.promptPrepend + this.prompt;
        }
        else {
            return this.prompt;
        }        
    }

    getWidth() {
        return this.size.split('x')[0];
    }

    getHeight() {
        return this.size.split('x')[1];
    }
}

interface ImageDownloadedFileInfo {
    fullpath: string;
    filename: string;
}

class OpenAI {
    private static async getImageUrl(imageGenData: ImageGenerationData, interaction: ChatInputCommandInteraction) {
        using perfCounter = Global.getPerformanceCounter("image::getImageUrl(): ");
        let image_url = null;
        let error = null;

        try {

            // Create the image with OpenAI
            const response = await OpenAIHelper.getInterface().images.generate({
                model: "dall-e-3",
                prompt: `${imageGenData.getGeneratedPrompt()}`,
                n: 1,
                size: `${imageGenData.size}`,
                quality: `${imageGenData.quality}`,
            });

            image_url = response.data[0].url;

            Global.logger().logInfo(`Asked: ${imageGenData.getGeneratedPrompt()}, got ${image_url}`);
        } catch (e) {
            error = e;
            await Global.logger().logError(`Exception occurred during image gen, asked: ${imageGenData.getGeneratedPrompt()}, got ${e}`, interaction, true);
        }

        return {
            image_url: image_url, error: error
        };
    } // getImageUrl

    private static async downloadUrlToFile(url: string, download_dir: string = Global.settings().get("TEMP_PATH")) {
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
    } // downloadUrlToFile

    static async download(imageGenData: ImageGenerationData, interaction: ChatInputCommandInteraction): Promise<ImageDownloadedFileInfo> {
        try {
            const result = await OpenAI.getImageUrl(imageGenData, interaction);

            if (result.error != null) {
                Global.logger().logError(`Error getting image URL, got error ${result.error}`);
            } else {
                const downloadedFileinfo = await OpenAI.downloadUrlToFile(result.image_url);
                return downloadedFileinfo;
            }
        } catch (e) {
            await Global.logger().logError(`Unexpected error generating OpenAI image, got ${e}`, interaction, true);
        }

        return null;
    } // download
} // class OpenAI

class StableDiffusion {
    static async download(imageGenData: ImageGenerationData, interaction: ChatInputCommandInteraction): Promise<ImageDownloadedFileInfo> {
        try {
            const payload = {
                "prompt": imageGenData.getGeneratedPrompt(),
                "steps": 25,
                "width": imageGenData.getWidth(),
                "height": imageGenData.getHeight(),
                "override_settings": {
                    "sd_model_checkpoint": imageGenData.sd_model_checkpoint
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
    } // download
} // class StableDiffusion

class GetimgAi {
    static async download(imageGenData: ImageGenerationData, interaction: ChatInputCommandInteraction): Promise<ImageDownloadedFileInfo> {
        try {
            const url = 'https://api.getimg.ai/v1/flux-schnell/text-to-image';
            const options = {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                    authorization: `Bearer ${Global.settings().get("GETIMG_AI_API_KEY")}`
                },
                body: JSON.stringify(
                    {
                        prompt: imageGenData.getGeneratedPrompt(), 
                        width: imageGenData.getWidth(), 
                        height: imageGenData.getHeight(),
                        steps: imageGenData.getSteps(),
                        ...(imageGenData.getSeed() != 0) && {seed: imageGenData.getSeed() },
                        output_format: "png",
                    })
            };

            const fetchResult = await fetch(url, options);
            const responseData = <any> await fetchResult.json();

            const hash = crypto.createHash('md5').update(responseData.image).digest('hex');
            const filename = hash + '.png';
            const fullpath = `${Global.settings().get("TEMP_PATH")}/${filename}`;

            const decoded = Buffer.from(responseData.image, "base64");
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
            await Global.logger().logError(`Got error calling getimg.ai flux api: ${e}`, interaction, true);
        }
        return null;
    }
}

class ImageCommand extends DiscordBotCommand {
    async handle(interaction) {
        using perfCounter = Global.getPerformanceCounter("handleImageCommand(): ");
    
        try {
            await interaction.deferReply();
    
            const slashCommandInfo = KoalaSlashCommandRequest.fromDiscordInteraction(interaction);
            const imageGenData = new ImageGenerationData(slashCommandInfo);
    
            let downloadedFileInfo: ImageDownloadedFileInfo = null;
    
            switch (imageGenData.model) {
                case 'dalle':
                    downloadedFileInfo = await OpenAI.download(imageGenData, interaction);
                    break;
                case 'stablediffusion':
                    downloadedFileInfo = await StableDiffusion.download(imageGenData, interaction);
                    break;
                case 'getimgai':
                    downloadedFileInfo = await GetimgAi.download(imageGenData, interaction);
                    break;
                default:
                    await Global.logger().logError(`Unexpected model ${imageGenData.model}`, interaction, true);
                    return;
            }
    
            if (downloadedFileInfo != null) {
                // Create the attachment
                try {
                    const file = new AttachmentBuilder(downloadedFileInfo.fullpath);
                    const embed = {
                        title: imageGenData.getGeneratedPrompt().substring(0, 256),
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
            } else {
                await interaction.editReply("Failed to download image, got null result.");
            }
        } catch (e) {
            await Global.logger().logError(`Top level exception during image, got error ${e}`, interaction, false);
        }
    } // handleImageCommand

    get() {
        const imageCommand = new SlashCommandBuilder()
            .setName(this.name())
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
            // getimg.ai
            .addSubcommandGroup((group) =>
                group
                    .setName('getimgai')
                    .setDescription('Generate an image using getimg.ai')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('generate_flux')
                            .setDescription('Generate an image using getimg.ai')
                            .addStringOption((option) =>
                                option
                                    .setName('image_details')
                                    .setDescription('Details of what to generate')
                                    .setRequired(true)
                            )
                            .addStringOption((option) =>
                                option
                                    .setName('image_size')
                                    .setDescription('Image size to generate (1024x1024 default, range 256-1280x256-1280)')
                                    .setRequired(false)
                            )
                            .addIntegerOption((option) =>
                                option
                                    .setName("steps")
                                    .setDescription("Number of steps to take (default 4, range 1-4)")
                                    .setRequired(false)
                            )
                            .addIntegerOption((option) =>
                                option
                                    .setName("seed")
                                    .setDescription("Set seed for deterministic generation (default random, range 1-2147483647")
                                    .setRequired(false)
                            )
                    )
            )
            ;
    
        return imageCommand;
    } // getImageCommand()
}

registerDiscordBotCommand(new ImageCommand('image'), false);

export { ImageGenerationData }
