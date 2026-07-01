import { UserSettingsManager } from '../app/user/usersettingsmanager.js';
import { ListenerManager } from '../listenermanager.js';
import { DiscordMessageCreateListener } from '../api/discordmessagelistener.js';
import { DiscordBotRuntimeData } from '../api/discordbotruntimedata.js';
import { getCommonLogger } from '../logging/logmanager.js';
import * as Honcho from '@honcho-ai/sdk';
import * as Discord from 'discord.js';
import config from 'config';

function storedUserName(userName: string): string {
    return `discord-user-${userName}`
}

function storedSessionName(sessionId: string): string {
    return `discord-channel-${sessionId}`
}

export class HonchoRuntimeData {
    constructor(readonly peer: Honcho.Peer, readonly session: Honcho.Session) {
        this.peer = peer;
        this.session = session;
    }

    async selfObservations() {
        return await this.peer.conclusions.list();
    }

    async observationsOf(userName: string) {
        return await this.peer.conclusionsOf(storedUserName(userName)).list();
    }
}

export class HonchoModule implements DiscordMessageCreateListener {
    /* Singleton */
    private static module: HonchoModule;
    static init() {
        this.module = new HonchoModule();
        ListenerManager.registerMessageCreateListener(this.module);
    }
    static get(): HonchoModule {
        return this.module;
    }

    /* Honcho functionality */
    private honcho: Honcho.Honcho;

    constructor() {
        const environment = config.get<string>('Modules.Honcho.Config.environment');

        if (environment !== 'local' && environment !== 'production') {
            throw new Error(`Invalid Honcho environment: ${environment}`);
        }

        this.honcho = new Honcho.Honcho({
            workspaceId: config.get<string>('Modules.Honcho.Config.workspaceId') || config.get<string>('Global.botName'),
            apiKey: config.get<string>('Modules.Honcho.Config.apiKey'),
            environment: environment,
            baseURL: config.get<string>('Modules.Honcho.Config.baseUrl'),
            timeout: config.get<number>('Modules.Honcho.Config.timeout'),
            maxRetries: config.get<number>('Modules.Honcho.Config.maxRetries')
        });
    }

    async getRuntimeData(userId: string, sessionId: string): Promise<HonchoRuntimeData> {
        const peer = await this.honcho.peer(storedUserName(userId));
        const session = await this.honcho.session(storedSessionName(sessionId));
        return new HonchoRuntimeData(peer, session);
    }

    async onDiscordMessageCreate(runtimeData: DiscordBotRuntimeData, message: Discord.Message) {
        try {
            // LLM responses are handled by the llm bot
            if (message.author.id != runtimeData.botId() && message.content.length > 0)
            {
                const userData = UserSettingsManager.get().get(message.author.username);
                if (!userData.chatSettings.useHoncho) {
                    getCommonLogger().logDebug(`HonchoModule::onDiscordMessageCreate(): User ${message.author.username} has useHoncho set to false, skipping message logging.`);
                    return;
                }
                
                await this.pushMessageToHoncho(
                    message.author.id, 
                    message.channelId, 
                    message.content);
            }
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to log ${message} to stenographer, got ${e}`);
        }
    }

    async pushMessageToHoncho(userId: string, sessionId: string, message: string) {
        try {
            const honchoRuntimeData = await this.getRuntimeData(userId, sessionId);
            await honchoRuntimeData.session.addMessages([honchoRuntimeData.peer.message(message)]);
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to push message to honcho, got ${e}`);
        }
    }

    async getSystemPrompt(botId: string, userId: string, sessionId: string): Promise<string> {
        try {
            const honchoRuntimeData = await this.getRuntimeData(userId, sessionId);
            
            const context = await honchoRuntimeData.session.context({
                summary: true,
                tokens: 3000,
                peerTarget: storedUserName(userId)
            });

            if (context.peerRepresentation) {
                return config.get<string>("Modules.Honcho.Constants.systemPromptPrefix") + context.peerRepresentation;
            }
        } catch (e) {
            getCommonLogger().logErrorAsync(`Failed to get system prompt from honcho, got ${e}`);
        }

        return '';
    }
}
