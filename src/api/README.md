# KoalaBot API
## Overview
The KoalaBot API is meant to make it easy to add custom slash commands to the bot.

The goal is to do what it does well and easily.  What it doesn't do, it doesn't even attempt to do.

## API Overview
The API is split into a few classes.  In general, a custom command simply needs to use the _DiscordBotCommand_ class to do what they want to do.

### DiscordBotCommand
This is base class to use to create a command.  All you need to do is create a new command file (convention is commandname.ts) and add it to the $COMMAND_LIST env parameter.

Implementing the command is pretty straight forward and just requires extending and implementing the DiscordBotRuntime abstract class.

```javascript
import { DiscordBotCommand, registerDiscordBotCommand } from '../api/discordbotcommand.js'

class MyCommand extends DiscrdBotCommand {
  async handle(interaction: ChatInputCommandInteraction) {
    try {
      interaction.reply('Example Reply!!');
    } catch (e) {
      this.runtimeData().logger().logError(`Failed to do myCommand, got error: ${e}`);
    }
  }

  get(): SlashCommandOptionsOnlyBuilder {
        return new SlashCommandBuilder()
                      .setName(this.name())
                      .setDescription('My Command is amazing');
  }
}

registerDiscordBotCommand(new MyCommand('myslashcommand')); // Register for processing
```

From there you can do whatever you want.  If you add dependencies that aren't in the package.json, you'll need to create your own docker image, but, at that point, you should be able to figure that out since the [Dockerfile](../../buildsys/docker/Dockerfile) is in the [buildsys](../../buildsys) directory.

### DiscordMessageListener
Simple interface to get called in the chain of message callbacks.

```javascript
export interface DiscordMessageCreateListener {
    onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message): Promise<void>;
}

export interface DiscordReactionAddListener {
    onMessageReactionAdd(runtimeData: DiscordBotRuntimeData, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void>;
}
```

As an example of a simple listener:
```javascript
class SimpleListener implements DiscordMessageCreateListener, DiscordReactionAddListener {
    async onMessageCreate(runtimeData: DiscordBotRuntimeData, message: Message) {
        message.reply(`I listened!`);
    }

    async onMessageReactionAdd(runtimeData: DiscordBotRuntimeData, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): {
        console.log('Got a message reaction!\n');
    }
}
const simpleListener = new SimpleListener();
ListenerManager.registerMessageCreateListener(simpleListener);
ListenerManager.registerMessageReactionAddListener(simpleListener);
```

### DiscordBotRuntimeData
Provides a container for all instance information for a given command.  Currently doesn't do anything but detach commands from the bot instance itself, but, long term, can be used to segment servers in the Stenographer and such.

Interface below:
```javascript
export class DiscordBotRuntimeData {
    logger(): Logger;
    bot(): Bot; 
    helpers(): DiscordBotHelpers;
    settings(): SettingsManager;
    getPerformanceCounter(description: string);
}
```

### DiscordBotHelpers
Helper functions for api users.

```javascript
export class DiscordBotHelpers {
  // Edit a reply and automatically split it into multiple if its too long
  editAndSplitReply(interaction: ChatInputCommandInteraction, message: string): Promise<void>;

  // Read a JSON file and return the data that was loaded
  readJsonFile(path: string): Promise<any>;

  // Get a performance counter.
  //   Should just have to do const myvar = helper.getPerformanceCounter(); to get counters.
  //   Performance counters automically cleanup at the end of scope, so store in a variable
  //   and keep alive as long as you need to time something.
  getPerformanceCounter(): PerformanceCounter;
}
```
