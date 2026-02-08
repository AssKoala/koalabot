import { Collection } from "discord.js";
import { DiscordClientCommandType } from "../platform/discord/discordbot.ts";

declare module "discord.js" {
  export interface Client {
    commands: Collection<string, DiscordClientCommandType>;
  }

  export interface ClientOptions {
    autoReconnect: boolean;
  }
}