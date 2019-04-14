let events = require('events');

const logOutput = process.env.DEBUG === "true";

const prefixEvent = "event_";
const prefixQuery = "/q/";
const prefixBind = "/bind/";

let eventEmitter = new events.EventEmitter();

/**
 * Outputs to console if logging is enabled
 */
function logToConsole(output) {
	if (logOutput) {
		console.log(output);
	}
}

/**
 * Waits for a response from the web socket.
 *
 * An expected response can be defined and the promise is rejected if it is not repeating
 * and the returned response does not equal the expected response.
 *
 * The response can be repeating. If this is the case the promise will never get rejected.
 * Repeating is used in the situations where we are polling for a particular response in
 * situations where we can not bind to a particular event.
 */
function waitForResponse(id, expectedResponse = undefined, repeating = false) {
	return new Promise((resolve, reject) => {
		let listener = function(response) {
			logToConsole("waitForResponseListener: response=" + response + " expectedResponse=" + expectedResponse + " repeating=" + repeating);
			if (!expectedResponse || expectedResponse === response) {
				eventEmitter.removeListener(id, listener);
				resolve(response);
			} else if (!repeating) {
				eventEmitter.removeListener(id, listener);
				reject("Returned response (" + response + ") does not match expected (" + expectedResponse + ")");
			}
		};

		eventEmitter.on(id, listener);
	});
}

/**
 * Sends a message to the web socket.
 *
 * If freq >= 0 then the message is repeated every X seconds.
 * To sample at 4 times a second freq = 0.25.
 *
 * An expected response can also be defined. This will resolve/reject the promise
 * if the returning response does not match.
 * This can be used to validate that sent messages have been received and are valid.
 */
function send(ws, id, url, freq = -1, expectedResponse = undefined) {
	let msg = {id:id, q:url};
	if (freq >= 0) {
		msg['repeat'] = {freq:freq};
	}
	logToConsole("Sending message: " + JSON.stringify(msg));

	console.log("Ready state ", ws.readyState);

  	ws.send(JSON.stringify(msg));
  	return waitForResponse(id, expectedResponse);
}

class WebSocketHelper {

	constructor() {
		this.ws = null;	// WebSocket
		this.repeatingQueries = {};
		this.url = "ws://" + (process.env.IP === undefined ? "localhost" : process.env.IP) + ":" + (process.env.PORT === undefined ? "8342" : process.env.PORT) + "/ws";
		logToConsole("URL: " + this.url);
	}

	ready() {
		return this.ws.readyState===this.ws.OPEN;
	}

    connect() {
    	let url = this.url;
			return new Promise((result, reject) => {
				this.ws = new WebSocket(url);
				this.ws.onopen = () => result();
				this.ws.onerror = () => reject("Failed to Connect");
				this.ws.onmessage = (m) => {
					let msg = JSON.parse(m.data);
					logToConsole("Received message: " + JSON.stringify(msg));

					let id = msg['id'];

					if (msg.error) {
						console.log("Message has an error: {" + id + "} " + msg.error);
					}

					// Unium returns 'data' in an array which has only one entry. We return that entry to save having to access it on the listeners.
					// Events return an 'object'. We check for the prefixEvent in order to determine how we should access/return the data
					eventEmitter.emit(id, (msg['info'] || msg['data']));
				};
		});
	}

	close(){
		this.ws.close();
	}

	/**
	 * Sleep for X number of milliseconds
	 */
	sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Send a query and will wait for any response and return first result.
	 */
	async query(id, url) {
		return (await send(this.ws, id, prefixQuery + url))[0];
	}

	/**
	 * Send a query and will wait for any response and return all results.
	 */
	async queryAll(id, url) {
		return await send(this.ws, id, prefixQuery + url);
	}

	/**
	 * Send a query that is repeating and validates the response.
	 *
	 * freq is is seconds.
	 * To sample at 4 times a second freq = 0.25.
	 * To sample every frame freq = 0.
	 */
	async repeatQuery(id, url, freq) {
		this.addRepeatingQueryId(id);
		await send(this.ws, id, prefixQuery + url, freq, "repeating");
	}

	/**
	 * Wait for the expected response to be returned for a repeating query.
	 *
	 * This is used as polling technique.
	 */
	waitForRepeatResponse(id, expectedResponse) {
		return waitForResponse(id, expectedResponse, true);
	}

	/**
	 * When a repeating query is no longer required this will stop it
	 * from returning any more responses.
	 */
	async removeQuery(id) {
		await send(this.ws, id, "/socket.stop(" + id + ")", -1, "stopped");
		delete this.repeatingQueries[id];
	}

	/**
	 * Stops all repeating queries.
	 */
	async cleanUpRepeatingQueries() {
		for (let key in this.repeatingQueries) {
			await this.removeQuery(key);
		}
	}

	/**
	 * Validates that a repeating query with the specified id is not already in use.
	 * Throws an exception if the id is already in use.
	 */
	addRepeatingQueryId(id) {
		if (this.repeatingQueries[id] == 1) {
			throw "Repeating query ID (" + id + ") is already being used";
		}

		this.repeatingQueries[id] = 1;
	}

	/**
	 * Binds to an event.
	 *
	 * If polling is specified it will continuously attempt to bind every second.
	 * Use this flag if the event that is wanting to be bound to may not be ready.
	 * For example changing scenes and the event is in that scene.
	 */
	async bindToEvent(id, url, polling = false) {
		let bound = false;

		do {
			bound = await send(this.ws, prefixEvent + id, prefixBind + url, !polling ? "bound" : undefined) === "bound";

			if (!bound) {
				await this.sleep(1000);
			}
		} while (polling && !bound);
	}

	/**
	 * Wait for an expected response for a particular event id
	 */
	async waitForEvent(id, expectedResponse) {
		return await waitForResponse(prefixEvent + id, expectedResponse, true);
	}

}

module.exports = WebSocketHelper;
