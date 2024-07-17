/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

*/

import { Global } from '../global.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import validator from 'validator';
import cp from 'child_process';
import os from 'os';
import { time } from "console";
import { DiscordAPIError } from "discord.js";

class RedditLinks {
    links: string[];
    error: string;

    constructor(links: string[] = [], error: string = '') {
        this.links = links;
        this.error = error;
    }
}

/**
 * Retrieve a list of links from reddit
 * @param {string} searchLimit - Max number of items to return (e.g. 10)
 * @param {string} timeFilter - Time to use (day, hour, etc)
 * @param { [string] } subredditList - Array of subreddits to view
 * @returns array of valid URL's or nothing
 */
async function getRedditLinks(searchLimit, timeFilter, subredditList): Promise<RedditLinks> {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);

        const python = Global.settings().get("PYTHON_BINARY");

        const args = [ 
                Global.settings().get("REDDIT_READER_PATH"), 
                Global.settings().get("REDDIT_CLIENT_ID"), 
                Global.settings().get("REDDIT_CLIENT_SECRET"),
                Global.settings().get("REDDIT_USER_AGENT"),
                searchLimit, 
                timeFilter, ...subredditList ];

        Global.logger().logInfo(`Running ${python} with args ${args} from ${__dirname}`);

        const childprocess = cp.spawnSync(python, args, {cwd: __dirname });
        const output = `${childprocess.stdout}`;

        Global.logger().logInfo(`Got reddit output: ${output} and error: ${childprocess.stderr}`);

        const lines = output.split("\n").map(line => 
            {
                return line.trim();
            });
        const filtered = lines.filter((line) => 
                        {
                            return validator.isURL(line)
                        });

        try { 
            return new RedditLinks(filtered, childprocess.stderr.toString());
        } catch (e) {
            return new RedditLinks(filtered);
        }                    
    } catch (e) {
        Global.logger().logError(`Failed to get reddit links, got ${e}`);
        return new RedditLinks([], `Failed to get reddit links, got ${e}`);
    }
}

/**
 * Reply a random valid URL from reddit or nothing
 * @param {Discord.interaction} interaction - interaction to reply to
 * @param {string} searchLimit - Max number of items to return (e.g. 10)
 * @param {Array.string} subredditList - Array of subreddits to view
 */
async function replyRandomLink(interaction, searchLimit, subredditList) {
    using perfCounter = Global.getPerformanceCounter("replyRandomLink(): ");

    try {
        let timeFilter = null;

        for (let i = 0; i < interaction.options.data.length; i++) {
            if (interaction.options.data[i].name == 'filter')
            {
                timeFilter = interaction.options.data[i].value;
                break;
            }
        }

        if (timeFilter == null) {
            timeFilter = 'day';
        }

        const redditLinks = await getRedditLinks(searchLimit, timeFilter, subredditList);
        if (redditLinks.links.length > 0) {
            const index = Math.floor(Math.random() * redditLinks.links.length);
            await interaction.editReply(`${redditLinks.links[index]}`);
        } else {
            await Global.logger().logError(`${redditLinks.error}`, interaction, true);
        }
    } catch (e) {
        Global.logger().logError(`Failed to get links, got exception ${e}`, interaction, true);
    }
}

export { replyRandomLink }

