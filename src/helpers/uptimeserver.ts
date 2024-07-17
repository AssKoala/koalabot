/*
	BottyMcBotFace: 2cpu channel bot

	Licensed under GPLv3
	
	Copyright 2022, Jose M Caban (asskoala@gmail.com)

	Allows data to be sent to boobs from over the internets
*/

import { Global } from '../global.js';
import { createServer } from 'node:net';

class UptimeServer {
	#server;
	#serverPort;

	constructor (port) {
		this.#serverPort = port || 69;

		this.#server = createServer();

		this.#server.on('connection', (socket) => {
			// 'connection' listener.
			Global.logger().logInfo('client connected');
			socket.on('end', () => {
				Global.logger().logInfo('client disconnected');
			});
			socket.write('hello\r\n');
			socket.pipe(socket);
		});

		this.#server.on('error', (err) => {
			throw err;
		});

		this.#server.listen(this.#serverPort, () => {
			Global.logger().logInfo('server bound');
		}); 
	}

	server() { return this.#server; }
	port() { return this.#serverPort; }
}

export { UptimeServer }