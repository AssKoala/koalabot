/*
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
    Global.logger().logErrorAsync(`Unhandled Process Rejection, got ${error}`);
});

/* Startup the bot */
Global.initDiscord();