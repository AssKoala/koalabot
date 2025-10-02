/*
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

import { toFile } from "openai";

// For getimg.ai
import fetch from 'node-fetch';
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js';

const INVALID_SEED = -1;

class ImageGenerationData {
    readonly prompt: string = '';
    readonly size: string = '1024x1024';
    readonly quality: string = 'standard';
    readonly forcePrompt: boolean = false;
    readonly promptPrepend: string = "I NEED to test how the tool works with extremely simple prompts. DO NOT add any detail, just use it AS-IS:";
    readonly model: string = "dall-e-3";
    readonly sd_model_checkpoint: string = 'Deliberate_v6.safetensors';
    readonly seed: number = INVALID_SEED;
    readonly steps: number = 4;
    readonly transparency: string = 'opaque';
    readonly base_images: string[] = [];

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
        this.steps = request.getSubcommand().getOptionValueNumber('steps', this.steps);
        this.seed = request.getSubcommand().getOptionValueNumber('seed', this.seed);
        this.transparency = request.getSubcommand().getOptionValueString('transparency', this.transparency);

        this.base_images = [];

        let base_images = request.getSubcommand().getOptionValueString("base_images", null);

        if (base_images != null) {
            const base_images_array = base_images.split('|');
            base_images_array.forEach(image => {
                this.base_images.push(image);
            });
        }
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

class ImageDownloadedFileInfo {
    fullpath: string;
    filename: string;
    seed: number;

    constructor(fullpath: string, filename: string, seed: number = INVALID_SEED) {
        this.fullpath = fullpath;
        this.filename = filename;
        this.seed = seed;
    }
}

class OpenAI {
    private static async getImageResponse(imageGenData: ImageGenerationData, interaction: ChatInputCommandInteraction) {
        using perfCounter = Global.getPerformanceCounter("image::getImageUrl(): ");
        let image_url = null;
        let error = null;
        let response = null;

        try {
            switch (imageGenData.model) {
                case 'dall-e-3':
                    // Create the image with OpenAI
                    response = await OpenAIHelper.getInterface().images.generate({
                        model: `${imageGenData.model}`,
                        prompt: `${imageGenData.getGeneratedPrompt()}`,
                        n: 1,
                        size: `${imageGenData.size}`,
                        quality: `${imageGenData.quality}`,
                    });
                    break;

                case 'gpt-image-1':                    
                    const quality = imageGenData.quality == 'standard' ? 'auto' : imageGenData.quality

                    if (imageGenData.base_images.length == 0) {
                        response = await OpenAIHelper.getInterface().images.generate({
                            model: `${imageGenData.model}`,
                            prompt: `${imageGenData.getGeneratedPrompt()}`,
                            size: `${imageGenData.size}`,
                            quality: quality,
                            background: `${imageGenData.transparency}`,
                        });
                    } else {
                        let baseImageFileList = [];                  

                        // Check if there are base images and download them somewhere temporary
                        for (let i = 0; i < imageGenData.base_images.length; i++) {
                            let downloadedFileInfo = await this.downloadUrlToFile(imageGenData.base_images[i]);
                            baseImageFileList.push(downloadedFileInfo.fullpath);
                        }

                        const images = await Promise.all(
                            baseImageFileList.map(async (file) =>
                                await toFile(fs.createReadStream(file), null, {
                                    type: "image/png",
                                })
                            ),
                        );

                        response = await OpenAIHelper.getInterface().images.edit({
                            model: `${imageGenData.model}`,
                            prompt: `${imageGenData.getGeneratedPrompt()}`,
                            size: `${imageGenData.size}`,
                            quality: quality,
                            background: `${imageGenData.transparency}`,
                            image: images
                        });

                        // Delete downloaded files
                        baseImageFileList.forEach((file) => { rm(file);});
                    }                    

                    break;
            }
            
            Global.logger().logInfo(`image::getImageUrl(): [Asked] _${imageGenData.getGeneratedPrompt()}_ [Used] _${response.data[0].revised_prompt}_ [Got] _${image_url}_`);
        } catch (e) {
            error = e;
            await Global.logger().logErrorAsync(`Exception occurred during image gen, asked: _${imageGenData.getGeneratedPrompt()}_, got _${e}_`, interaction, true);
        }

        return {
            response: response, error: error
        };
    } // getImageUrl

    private static async downloadUrlToFile(url: string, download_dir: string = Global.settings().get("TEMP_PATH")) {
        // Download the image temporarily
        await mkdir(download_dir, { recursive: true });

        const dl = new DownloaderHelper(url, download_dir);
        dl.on('error', (err) => Global.logger().logErrorAsync(`Failed to download image from _${url}_ to _${download_dir}_, got error _${err}_`));
        await dl.start();

        const downloaded_fullpath = dl.getDownloadPath();
        const downloaded_filename = downloaded_fullpath.split("/").at(-1).split(`\\`).at(-1);

        return new ImageDownloadedFileInfo(downloaded_fullpath, downloaded_filename);
    } // downloadUrlToFile

    private static async downloadBufferToFile(image_bytes: Buffer, download_dir: string = Global.settings().get("TEMP_PATH")) {
        // Download the image temporarily
        await mkdir(download_dir, { recursive: true });

        const hash = crypto.createHash('md5').update(image_bytes).digest('hex');
        const downloadFileName = `${hash}.png`;
        const downloadPath = `${download_dir}/${downloadFileName}`;

        fs.writeFileSync(downloadPath, image_bytes);

        return new ImageDownloadedFileInfo(downloadPath, downloadFileName);
    } // downloadUrlToFile

    static async download(imageGenData: ImageGenerationData, interaction: ChatInputCommandInteraction): Promise<ImageDownloadedFileInfo> {
        try {
            const result = await OpenAI.getImageResponse(imageGenData, interaction);

            if (result.error != null) {
                if (result.error.status == 400) {
                    Global.logger().logErrorAsync(`Got Nannied for prompt: _${imageGenData.getGeneratedPrompt()}_ with reason: _${result.error.message}_`, interaction, true);
                } else {
                    Global.logger().logErrorAsync(`Error getting image URL, got error _${result.error}_`, interaction, true);
                }
            } else if (imageGenData.model == 'dall-e-3') {
                const downloadedFileinfo = await OpenAI.downloadUrlToFile(result.response.data[0].url);
                return downloadedFileinfo;
            } else if (imageGenData.model == 'gpt-image-1') {
                const image_b64 = result.response.data[0].b64_json;
                const image_bytes = Buffer.from(image_b64, "base64");

                const downloadedFileinfo = await OpenAI.downloadBufferToFile(image_bytes);
                return downloadedFileinfo;
            }
        } catch (e) {
            await Global.logger().logErrorAsync(`Error generating OpenAI image: _${e}_`, interaction, true);
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
                await Global.logger().logErrorAsync(`Failed to write temp-image file, got ${e}`, interaction, true);
            }
            

            return new ImageDownloadedFileInfo(fullpath, filename);
        } catch (e) {
            await Global.logger().logErrorAsync(`Got error calling stable diffusion api: ${e}`, interaction, true);
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
                        ...(imageGenData.getSeed() != INVALID_SEED) && {seed: imageGenData.getSeed() },
                        output_format: "png",
                    })
            };

            const fetchResult = await fetch(url, options);

            if (fetchResult.ok) {
                const responseData = <any> await fetchResult.json();

                const hash = crypto.createHash('md5').update(responseData.image).digest('hex');
                const filename = hash + '.png';
                const fullpath = `${Global.settings().get("TEMP_PATH")}/${filename}`;

                const decoded = Buffer.from(responseData.image, "base64");
                try {
                    fs.writeFileSync(fullpath, decoded);
                    Global.logger().logInfo(`Successfully wrote temp-image to ${fullpath}`);
                } catch (e) {
                    await Global.logger().logErrorAsync(`Failed to write temp-image file, got ${e}`, interaction, true);
                }
                
                return new ImageDownloadedFileInfo(fullpath, filename, responseData.seed);
            } else {
                await Global.logger().logErrorAsync(`Failed to download image from Getimg.Ai, got error code ${fetchResult.status}, see here: https://docs.getimg.ai/reference/errors`, interaction, true);
            }
        } catch (e) {
            await Global.logger().logErrorAsync(`Got error calling getimg.ai flux api: ${e}`, interaction, true);
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
                case 'dall-e-3':
                    downloadedFileInfo = await OpenAI.download(imageGenData, interaction);
                    break;
                case 'gpt-image-1':
                    downloadedFileInfo = await OpenAI.download(imageGenData, interaction);
                    break;
                case 'stablediffusion':
                    downloadedFileInfo = await StableDiffusion.download(imageGenData, interaction);
                    break;
                case 'getimgai':
                    downloadedFileInfo = await GetimgAi.download(imageGenData, interaction);
                    break;
                default:
                    await Global.logger().logErrorAsync(`Unexpected model ${imageGenData.model}`, interaction, true);
                    return;
            }
    
            if (downloadedFileInfo != null) {
                // Create the attachment
                try {
                    const file = new AttachmentBuilder(downloadedFileInfo.fullpath);

                    let title = downloadedFileInfo.seed != INVALID_SEED ? `${downloadedFileInfo.seed.toString(36)} ` : "";
                    title += imageGenData.getGeneratedPrompt();

                    const embed = {
                        
                        title: `${this.runtimeData().settings().get("BOT_NAME")} x ${interaction.user.displayName}`.substring(0, 256),
                        description: title.substring(0, 4096),
                        image: {
                            url: `attachment://${downloadedFileInfo.filename}`,
                        }
                    }
    
                    await interaction.editReply({ embeds: [embed], files: [file] });
                } catch (e) {
                    await Global.logger().logErrorAsync(`Failed to generate/post images, got ${e}`, interaction, true);
                }
    
                try {
                    // Delete the file
                    await rm(downloadedFileInfo.fullpath);
                } catch (e) {
                    Global.logger().logErrorAsync(`Failed to delete image file, might need manual cleanup, got ${e}`);
                }
            } 
        } catch (e) {
            await Global.logger().logErrorAsync(`Top level exception during image, got error ${e}`, interaction, false);
        }
    } // handleImageCommand

    private appendGptImageSubCommand(imageCommand) {
        return imageCommand
                    .addSubcommandGroup((group) =>
                        group
                            .setName('gpt-image-1')
                            .setDescription('Generate an image using GPT Image')
                            .addSubcommand((subcommand) =>
                                subcommand
                                    .setName('generate')
                                    .setDescription('Generate an image using GPT Image')
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
                                                { name: 'portrait', value: '1024x1536' },
                                                { name: 'landscape', value: '1536x1024' },
                                                { name: 'auto', value: 'auto'}
                                            )
                                            .setRequired(false),
                                    )
                                    .addStringOption((option) =>
                                        option
                                            .setName('image_quality')
                                            .setDescription('Image quality to use')
                                            .addChoices(
                                                { name: 'low', value: 'low' },
                                                { name: 'medium', value: 'medium' },
                                                { name: 'high', value: 'high' },
                                                { name: 'auto', value: 'auto' },
                                            )
                                            .setRequired(false),
                                    )
                                    .addStringOption((option) =>
                                        option
                                            .setName('transparency')
                                            .setDescription('Enable transparent background')
                                            .addChoices(
                                                { name: 'enable', value: 'transparent' },
                                                { name: 'disable', value: 'opaque' },
                                            )
                                            .setRequired(false),
                                    )
                                    .addStringOption((option) =>
                                        option
                                            .setName('base_images')
                                            .setDescription('Set of base images to use (separate multiple with |)')
                                            .setRequired(false),
                                    )
                            )
                    );
    }

    private appendDalleSubCommand(imageCommand) {
        return imageCommand
                    .addSubcommandGroup((group) =>
                        group
                            .setName('dall-e-3')
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
                    );
    }

    private appendStableDiffusionSubCommand(imageCommand) {
        // Pull in checkpoints dynamically for use in the slash command we send to discord
        const checkpoints = this.runtimeData().settings().get("SD_CHECKPOINTS").split(',');

        let choices = [];

        const getEntry = function (checkpointString) {
            let split = checkpointString.split('(');
            let name = ''
            let value = '';
            
            if (split.length > 1) 
            {
                name = split[0];
                value = split[1].slice(0,-1);
            } else {
                name = split[0];
                value = name + ".safetensors"
            }

            return { name, value };
        };

        checkpoints.forEach((checkpoint) => {
            choices.push(getEntry(checkpoint));
        });

        return imageCommand
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
                                                choices
                                            )
                                    )
                            )
                    );
    }

    private appendGetimgAiFluxSubCommand(imageCommand) {
        return imageCommand
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
                                            .setMinValue(1)
                                            .setMaxValue(4)
                                    )
                                    .addIntegerOption((option) =>
                                        option
                                            .setName("seed")
                                            .setDescription("Set seed for deterministic generation (default random, range 1-2147483647")
                                            .setRequired(false)
                                            .setMinValue(1)
                                            .setMaxValue(2147483647)
                                    )
                            )
                    );
    }

    get() {
        let imageCommand = new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(`Ask ${Global.settings().get("BOT_NAME")} to generate an image`);

        const enabledSubCommands = this.runtimeData().settings().get("IMAGE_ENABLED_AI_LIST").split(',');

        enabledSubCommands.forEach((subcommand) => {
            switch (subcommand) {
                case 'dall-e-3':
                    imageCommand = this.appendDalleSubCommand(imageCommand);
                    break;
                case 'gpt-image-1':
                    imageCommand = this.appendGptImageSubCommand(imageCommand);
                    break;
                case 'stablediffusion':
                    imageCommand = this.appendStableDiffusionSubCommand(imageCommand);
                    break;
                case 'getimg.ai-flux': 
                    imageCommand = this.appendGetimgAiFluxSubCommand(imageCommand);
                    break;
                default:
                    this.runtimeData().logger().logErrorAsync(`Unexpected option in IMAGE_ENABLED_AI_LIST: ${subcommand}`);
                    break;
            }
        });
    
        return imageCommand;
    } // getImageCommand()
}

registerDiscordBotCommand(new ImageCommand('image'), false);

export { ImageGenerationData }
