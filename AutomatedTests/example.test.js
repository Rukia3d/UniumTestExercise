const WebSocketHelper = require("./WebSocketHelper.js");

const maxTries = 25;
const maxTime = 550000;

// A helper function to make sure we have a WebSocket connection before testing
const connect = async () => {
	const wsh = new WebSocketHelper();
	while(true) {
		try {
			await wsh.connect();
			break;
		} catch (err) {
			console.log("Error while connecting", err)
			await wsh.sleep(300);
		}
	}
	while(true){
		console.log("Connecting");
		if(wsh.ready()) break;
		console.log("Client is not ready, waiting for connection");
		await wsh.sleep(100);
	}
	return wsh;
}

// A helper to disconnect and remove requests
const disconnect = async (wsh) => {
	await wsh.cleanUpRepeatingQueries();
	await wsh.close();
}



test('Example test, requests the scene', async () =>{
	// Creating the WebSocketHelper for the queries
	const wsh = await connect();

	// Sendind the query to get the player
	const player = await wsh.query("get_player", "scene/Game/Player");

	// Confirming that the player is aceive in Hierarcy
	expect(player.activeInHierarchy).toBeTruthy()

	// Dosconnect WebSocketHelper
	await disconnect(wsh);
}, maxTime);
