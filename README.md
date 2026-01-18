# KoalaBot

Simple, turnkey discord bot to do various stuff that was once handled by IRC bots but also does other, new things good too.  Like ChatGPT and others, it supports that.

The bot is made to be extensible by using the API functionality to do pretty much whatever you want for slash commands.  There's probably a lot of stuff you can't do, but what you _can_ do can be done really well.

## Running using Docker
- Install Docker Engine: https://docs.docker.com/engine/install/
- Create override config with required settings (see below).
- Copy [Example compose.yml](compose.yml) somewhere locally.
- Modify the compose.yml to meet your specific needs.  See docker compose documentation: https://docs.docker.com/compose/
- Run bot: ```docker compose -f compose.yml up -d```

### Adding custom commands
See [api folder](src/api) for API documentation.

- Choose a release number you like (semantic versioning is api.major.patch, all releases with the same api guarantee api compatibility)
- Modify your docker compose with the new file, e.g. 
```
volumes:
  - ~/myCommands/myNewCommand.js:/bot/build/commands/myNewCommand.js
```

## configuration
All bot features can be configured by overriding the various options listed in *config/default.json5*.

The particularly confidential (and required) options can also be overridden via environment variables.  See *config/custom-environment-variables.json5* the full list.

## High level program flow

### Bot

bot.js contains all the discord bot code.

On startup, systems are loaded in an orderly fashion and the commands are read in.  These then dynamically register themselves based on the config.

LLMBots all run concurrently and individual users can select which AI model they prefer using the settings command, overriding the host default.  This is broadly respected for all functionality.

Each module is passed in the discord interaction when discord sends a matching command.  Each command implements their own functionality independent of any other, though shared functionality (e.g. user settings) can be accessed via the instance object passed into the handler.

#### LLMBot Functionality
LLMBot's are enabled based on the configuration.  Models can be disabled by overriding the Chat.enabledModels config option.

API keys are not validated, so models can be enabled that won't actually work when used.

The bot will automatically respond to @ commands.  If a message contains embedded image or a user replies to the bot's image generation message, the bot will use the images as input for either vision or image editing commands.  Not all models support all functionality, but GPT-5.x models have the most support.  The other models broadly support the same features, but API and internal implementation differences mean they don't quite work as well at any given moment.

## Available Commands

Commands must be enabled by adding the (lower case) command name to the command list variable in the .env file.

E.g. to enable the affirmation and chat commands only in the .env:
```COMMAND_LIST="affirmation,chat"```

<details>
<summary>Affirmation</summary>

![Affirmation sample output](src/doc/commands/affirmation.png)

Return the user a random affirmation when calling the /affirmation slash command.  
  
Affirmations must be in $DATA_PATH/affirmations.json

JSON is formatted as an array as follows:
```
[
{
  "author": "Jimmy Patterson",
  "entry": "The beatings will continue until morale improves."
},
{
  "author": "Napeloen",
  "entry": "A winter invasion sounds lovely."
}
]
```
</details>
<details>
<summary>Chat</summary>

![Chat sample output](src/doc/commands/chat.png)
  
Query ChatGPT using conversation history using /chat slash command.  This requires an [OpenAI API Key](https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key).

Use this to ask the bot to summarize the channel conversation or that sort of thing.

There's nothing special to setup other than adding the API key and enabling the command via the env command list.  The bot will load logs on startup to repopulate the chat in-memory log that's sent to ChatGPT.
</details>
<details>
<summary>Coinflip</summary>

![Coinflip sample output](src/doc/commands/coinflip.png)
 
Adds /coinflip slash command
</details>
<details>
<summary>Diceroll</summary>

![Diceroll sample output](src/doc/commands/diceroll.png)
  
Adds /diceroll slash command
</details>
<details>
<summary>Dict</summary>

![Dict sample output](src/doc/commands/dict.png)
  
Adds /dict, /define, and /index slash commands.

This command creates/reads and updates $DATA_PATH/dictdata.json that holds random definitions from users.  /define defines a new entry, /dict looks up an entry, and /index searches entries for a given string.

Example JSON:
```
[
  {
    "author": "AssKoala",
    "entry": "cheese",
    "definition": "look, I love cheese"
  },
  {
    "author": "Swank",
    "entry": "swank on love",
    "definition": "I love AssKoala"
  }
]
```
</details>
<details>
<summary>Image</summary>

![Image sample output](src/doc/commands/image.png)
  
Adds /image slash command

Depending on what Image API's you want access to, you need to define different variables to the .env file.

Currently, the bot supports OpenAI's DALL-E API, Stable Diffusion through [stablediffusion-web-ui](https://github.com/AUTOMATIC1111/stable-diffusion-webui), and getimg.ai FLUX.  Appropriate .env parameters must be provided for given subcommands to actually work.
</details>
<details>
<summary>Leaderboard</summary>

![Leaderboard sample output](src/doc/commands/leaderboard.png)
  
Adds /leaderboard slash command.

Leaderboard command searches logs and generates a list of entries for a given search string/word.  Additionally, supports a "profanity" leaderboard that will display a number of uses leaderboard based on $DATA_PATH/profanity.json.

JSON matches support regex.

JSON is array of entries, e.g.
```
[
    {
        "profanity": "ass",
        "matches": [
            "^[a@][s\\$][s\\$]$",
            "[a@][s\\$][s\\$]h[o0][l1][e3][s\\$]?"
        ]
    },
    {
        "profanity": "pimpmobile",
        "matches": [
            "pimpmobile",
        ]
    }
]
```
</details>
<details>
<summary>Query</summary>

![Query sample output](src/doc/commands/query.png)
  
Adds /query slash command.  Sends a query to ChatGPT _without_ also sending chat logs.  Use this for random questions like "what is the meaning of life" or "where's waldo".

This requires an OpenAI API key.
</details>
<details>
<summary>Reddit</summary>

![Reddit sample output](src/doc/commands/reddit.png)
  
Adds slash commands based on the JSON in $DATA_PATH/redditlinks.json allowing pulling of top reddit links from subreddits defined in the channel. 

This requires [reddit API keys](https://www.reddit.com/r/reddit.com/wiki/api).

The following example JSON:
```
[
	{
		"name": "topredditlink,
		"count": 50,
		"description": "Retrieve a reddit link!",
		"subreddits": [
			"AskReddit",
			"announcements",
			"funny",
			"pics"
		],
		"whitelistedChannels": [
      "spam"
		],
		"blacklistedChannels": [
		]
	}
]
```
Creates a slash command /topredditlink that pulls 50 random top links between the listed subreddits based on a filter provided when using the command, but only allows the command to be used in channels named spam.

If "spam" was instead in the blacklist, it would be allowed in all channels _except_ channels named spam.
</details>
<details>
<summary>Settings</summary>

![Settings sample output](src/doc/commands/settings.png)
  
Adds /settings slash command.  This allows users to set preferred temperature unit preferences and location for use with other commands.

The file is saved in $DATA_PATH/settings.json
</details>
<details>
<summary>Vision</summary>

![Vision sample output](src/doc/commands/vision.png)
  
Adds /vision slash command that sends images to OpenAI ChatGPT vision processing allowing querying of what's in the image or other such stuff.

This requires OpenAI .env settings.
</details>
<details>
<summary>Weather</summary>

![Weather sample output](src/doc/commands/weather.png)

Adds /forecast and /weather slash commands to tell the weather based on location.  Requires .env API keys for location services and weather services as defined in the .env section.
</details>
