import path from 'path';
import config from 'config';
import { Message } from 'discord.js';
import { DiscordBotRuntimeData } from '../api/discordbotruntimedata.js';
import { DiscordMessageCreateListener, TrackedWord, WordListener } from '../api/discordmessagelistener.js';
import { GetKoalaBotSystem } from '../api/koalabotsystem.js';
import { ListenerManager, ListenerPriority } from '../listenermanager.js';
import { readJsonFileSync } from '../sys/jsonreader.js';
import { getCommonLogger } from '../logging/logmanager.js';
import { DatabaseManager } from '../db/databasemanager.js';
import { MessageCountRepository } from '../db/messagecountrepository.js';
import { LeaderboardRepository } from '../db/leaderboardrepository.js';
import { BadWordEventRepository } from '../db/badwordeventrepository.js';

interface ProfanityConfigEntry {
    profanity: string;
    matches: string[];
}

function loadProfanityEntries(): ProfanityConfigEntry[] {
    const profanityPath = path.join(config.get<string>('Global.dataPath'), 'profanity.json');
    const entries = readJsonFileSync(profanityPath) as ProfanityConfigEntry[] | null;
    if (!entries || !Array.isArray(entries)) {
        getCommonLogger().logWarning(`DatabaseListener: Failed to load profanity config from ${profanityPath}.`);
        return [];
    }

    return entries;
}

function getConfiguredBadWords(): string[] {
    const raw = config.get<string>('Listeners.BadWordListener.badwords');
    return Array.from(
        new Set(
            raw
                .split(',')
                .map(word => word.trim())
                .filter(word => word.length > 0)
        )
    );
}

class DatabaseListener implements DiscordMessageCreateListener, WordListener {
    private readonly profanityEntries: ProfanityConfigEntry[];

    constructor() {
        this.profanityEntries = loadProfanityEntries();
    }

    async onDiscordMessageCreate(_runtimeData: DiscordBotRuntimeData, message: Message): Promise<void> {
        if (message.author.bot || !message.guildId) return;

        MessageCountRepository.incrementMessageCount(message.guildId, message.author.username).catch(() => {});

        const lowerContent = message.content.toLowerCase();
        for (const entry of this.profanityEntries) {
            if (!entry.profanity || !Array.isArray(entry.matches)) continue;

            const matched = entry.matches.some((regex) => {
                try {
                    return lowerContent.match(regex) != null;
                } catch {
                    return false;
                }
            });
            if (!matched) continue;

            LeaderboardRepository.incrementWordCount(message.guildId, message.author.username, entry.profanity).catch(() => {});
        }
    }

    async onWordDetected(_runtimeData: DiscordBotRuntimeData, word: TrackedWord, message: Message): Promise<void> {
        const userId = message.member?.user.id ?? message.author.id;
        const userName = message.member?.user.username ?? message.author.username;

        BadWordEventRepository.insert(
            message.channelId,
            word.word,
            userId,
            userName,
            Date.now()
        ).catch(() => {});
    }
}

if (DatabaseManager.isAvailable()) {
    const databaseListener = new DatabaseListener();
    ListenerManager.registerMessageCreateListener(databaseListener, ListenerPriority.Low);

    for (const badword of getConfiguredBadWords()) {
        GetKoalaBotSystem().registerWordListener(databaseListener, badword);
    }
}
