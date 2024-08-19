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
import { DiscordBotCommand } from '../api/DiscordBotCommand.js'
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
                      .setDescription('Affirmations to get you through the day');
  }
}
```

From there you can do whatever you want.  If you add dependencies that aren't in the package.json, you'll need to create your own docker image, but, at that point, you should be able to figure that out since the [Dockerfile](../../buildsys/docker/Dockerfile) is in the [buildsys](../../buildsys) directory.
