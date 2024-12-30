// Version: hsdv (heart-rate, socket, DoryNode, view)

const ws = require('ws')                        // WebSocket module
const fs = require('fs')
const path = require('path')

//******************************************************************************
//*************************** Receive message from companion via WebSocket *****
//******************************************************************************

const wsServer = new ws.Server({ port: 8080 })  // WebSocket server

const saveData = (data) => {
	const currentDate = new Date()
	const fileName = `${currentDate.getFullYear()}_${currentDate.getMonth() + 1}_${currentDate.getDate()}.txt`;
	const filePath = path.join(__dirname, 'data', fileName)

	fs.appendFile(filePath, data + '\n', (err) => {
		if (err) {
			console.error('Error occured while saving file:', err);
		} //else {
			//deleteOldFiles();
		//}
	});
};

const deleteOldFiles = () => {
	const dirPath = path.join(__dirname, 'data');
	fs.readdir(dirPath, (err, files) => {
		if (err) {
			console.error('Error occured while reading directory:', err);
		} else {
			const sortedFiles = files.sort((fileA, fileB) => {
				const fileAPath = path.join(dirPath, fileA);
				const fileBPath = path.join(dirPath, fileB);
				return fs.statSync(fileAPath).mtime - fs.statSync(fileBPath).mtime;
			});

			while (sortedFiles.length > 30) {
				const fileToDelete = sortedFiles.shift();
				const filePathToDelete = path.join(dirPath, fileToDelete);
				fs.unlink(filePathToDelete, (err) => {
					if (err) {
						console.error('Error occured while deleting file:', err);
					}
				});
			}
		}
	});
};	
	

wsServer.on('connection', function connection(socket, request) {
	console.log(`server.js: connection from ${request.connection.remoteAddress}`);
	socket.on('message', function incoming(data) {
		console.log(`server.js: ${data}`)
		saveData(data)
		sendToClients(data, socket);
	})
})


//******************************************************************************
//********************************** Save message in the companion device ******
//******************************************************************************

function sendToClients(data, incomingSocket) {
	wsServer.clients.forEach(function each(client) {
		if (client !== incomingSocket && client.readyState ==  ws.OPEN) {
			client.send(data);
		}
	})
}

//******************************************************************************
//****************************** Periodic Server Ping **************************
//******************************************************************************

function pingServer() {
	https.get('https://your-server-address.com', (res) => {
		console.log(`Pinged server with status code: ${res.statusCode}`);
	}).on('error', (err) => {
		console.error('Error pinging server:', err);
	});
}

// 5분마다 서버에 ping 보내기
setInterval(pingServer, 180000);
