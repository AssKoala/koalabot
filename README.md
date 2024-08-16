# BottyMcBotFace

Simple discord bot to do various stuff that was once handled by IRC bots but also does other, new things good too.

Written in a rather verbose way to make it easy for a beginner to read.  There may be better ways to do things, but this is extremely simple to follow.

## Basic instructions
- Clone repo
- Copy example env file to .env
- Fill out .env with the stuff
- npm install
- node ./deploy-commands.js prod
- node ./bot.js prod

## .env configuration details

### Discord Bot Settings

#### global settings

##### BOT_NAME
Default Value: BottyMcBotFace
Name for the bot to use when referencing self

##### DEBUG_ENABLE
Default Value: false
Set to true to enable debug functionality

##### COMMAND_LIST
Default Value: settings,coinflip,diceroll,leaderboard
Comma separate list of commands to load.  All commands are expected to be in the ./commands folder.  Commands are dynamically imported so long as they register themselves in .env and the command file itself has a registerCommandModule call to generate the Discord command structures.

##### DATA_PATH
Default Value: ./data
Path to JSON data to be loaded by commands

##### TEMP_PATH
Default Value: ./temp
Path to write temporary files

##### REBOOT_FILE
Default Value: $TEMP_PATH/reboot
Path to file to write to signal a reboot to the OS

##### LOG_MAX_ENTRIES
Default Value: 2048
Maximum number of log entries to keep in memory

##### LOG_PATH
Default Value: ./logs
Folder to write logs to

##### FULL_LOG_FILENAME
Default Value: bot.log
Log file to write ALL logs to

##### MESSAGE_LOG_FILENAME
Default Value: discord_messages.log
Log file to write discord messages to

##### LOG_LEVEL
Default Value: debug
Logging level.  See logger.ts enum LogLevel for available levels.

#### reddit settings

##### PYTHON_BINARY
Default Value: python
Path to python binary

##### REDDIT_READER_PATH
Default Value: ../../scripts/reddit_reader.py
Path to reddit reader python program

##### REDDIT_CLIENT_ID
Default Value: 
Reddit app client id: https://www.reddit.com/prefs/apps

##### REDDIT_CLIENT_SECRET
Default Value: 
Reddit app client secret: https://www.reddit.com/prefs/apps

##### REDDIT_USER_AGENT
Default Value: 
Reddit custom user agent for use in praw

#### openai settings

##### OPENAI_API_KEY
Default Value: 
OpenAI API key to access data

#### chat settings

##### GPT_TOKEN_COUNT
Default Value: 8192
Max number of tokens to send during chat command

##### GPT_MAX_MESSAGES
Default Value: 2048
Max number of message history to send during chat command

#### weather settings

##### GOOGLE_MAPS_API_KEY
Default Value: 
Google maps API key.  See https://developers.google.com/maps/documentation/javascript/get-api-key

##### OPEN_WEATHER_KEY
Default Value: 
Open weather API key for the weather module.  See https://openweathermap.org/appid to get yourself going.

#### discord settings

##### DISCORD_TOKEN
Default Value: 
Discord bot token.  You only need a single token if you don't want to setup a test environment for the bot (i.e. you just wanna use this with what it comes with)

##### DISCORD_APP_ID
Default Value: 
Discord app id for bot, see discord docs

##### DISCORD_GUILD_ID
Default Value: 
Comma separate list of guilds the bot will join.  e.g.
	DISCORD_GUILD_ID="12345" is a single server.
DISCORD_GUILD_ID="12345,67891" for two servers and so on.

##### DISCORD_CLEAR_SLASH_COMMANDS
Default Value: 
Clear slash commands on startup, recommend true for production use.

##### DISCORD_DEPLOY_GUILD_SLASH_COMMANDS
Default Value: 
Deploy slash commands to guilds, recommend true for production use

##### DISCORD_DEPLOY_GLOBAL_SLASH_COMMANDS
Default Value: false
Deploy slash commands globally for bot, recommend to always be false

## Running the bot as a systemd service in Linux
Super easy to run the bot in a VM or a raspberry pi or something.

Here's an example systemd configuration:
```
[Unit]
Description=BOOBSbot
After=multi-user.target
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/home/user/dev/BottyMcBotFace
ExecStart=/usr/bin/node /home/user/dev/BottyMcBotFace/bot.js prod
StandardOutput=append:/var/log/bottymcbotface.log
StandardError=append:/var/log/bottymcbotface.log
Type=idle
Restart=always
RestartSec=15
RestartPreventExitStatus=0
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
```

## High level program flow

### Bot

bot.js contains all the discord bot code.

On startup, the env file is loaded and the modules are read in.  These then dynamically register themselves based on what the .env file says should be loaded.

Each module is passed in the discord interaction when discord sends a matching command.  Each command implements their own functionality independent of any other, though shared functionality (e.g. user settings) can be accessed via the common.js exports.
