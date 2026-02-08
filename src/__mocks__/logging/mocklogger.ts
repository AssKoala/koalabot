import * as Discord from "discord.js";

export class MockLogger {
    logDiscordMessage(_message: string): void {}
    logInfo(_message: string): void {}
    logDebug(_message: string): void {}
    logWarning(_message: string): void {}
    logFatal(_message: string, _shouldThrow: boolean) : void {}
    logError(_message: string) : void {}
    logErrorAsync(_message: string, _discordReply: Discord.ChatInputCommandInteraction, _editReply: boolean): Promise<void> {
        return Promise.resolve();
    }
}