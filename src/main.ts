/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

	"Main" file for the bot that interfaces with discord's API.
*/

/* Initialize core systems */
import { Global } from './global.js';
{
	using perfCounter = Global.getPerformanceCounter(`Global Initialization`)
	Global.init();
}

/**
 * Error catching
 */
process.on('unhandledRejection', error => {
    Global.logger().logError(`Unhandled Process Rejection, got ${error}`);
});

/* Startup the bot */
Global.initDiscord();