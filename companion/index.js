import * as messaging from "messaging"
import { settingsStorage } from "settings"
import { encode } from 'cbor'
import { me as companion } from "companion"
import { inbox, outbox } from "file-transfer"
import { localStorage } from "local-storage"
const ACCEL_SCALAR = 500 

const valuesPerRecord = 9  // year, month, day, H, M, S, HR. x, y, z
const statusMsg = {        // codes<100 are only used from companion to watch; codes>550 are custom HTTP codes sent from android-fitbit-fetcher
  1:"Server didn't respond",
  2:"Server comm error",
  3:"Server comm reject",
  4:"Server response bad",
  200:"OK",
  500:'Server error',
  501:'Not implemented',
  555:'Invalid data',
  556:'Invalid length'
}
const headerLength = Uint32Array.BYTES_PER_ELEMENT // one Unit32 for fileTimestamp

const headerBufferLength = headerLength / 2   // buffer is 16-bit array
let fileNbrPrev

;(function() {
  console.log('Companion starting')
  companion.wakeInterval = 300000   // encourage companion to wake every 5 minutes

  // Extract persistent global variables from localStorage:
  fileNbrPrev = localStorage.getItem('fileNbrPrev')
  if (fileNbrPrev == null) fileNbrPrev = 0; else fileNbrPrev = Number(fileNbrPrev)

  inbox.addEventListener("newfile", receiveFilesFromWatch)
  receiveFilesFromWatch()
})()

async function receiveFilesFromWatch() {
  console.log('receiveFilesFromWatch()')
  let file
  while ((file = await inbox.pop())) {
    console.log(`Received file ${file.name}`)

    if (file.name === 'obj.cbor') receiveStatusFromWatch(file)
    else if (file.name !== 'wake') receiveDataFromWatch(file)
  }
}

async function receiveDataFromWatch(file) {
    if (file.name === '1') {
      fileNbrPrev = 0
    }
  
    const data = await file.arrayBuffer()
    const headerBufferView = new Int16Array(data)
    let timestamp = headerBufferView[0]
    const dataBufferView = new Int16Array(data)
    const recordCount = (dataBufferView.length - headerBufferLength) / valuesPerRecord  
    console.log(`Got file ${file.name}; contents: ${data.byteLength} bytes = ${dataBufferView.length} elements = ${recordCount} accel records;  timestamp = ${timestamp}`)
    settingsStorage.setItem('fileNbr', file.name)
  
    const fileNbr = Number(file.name)
    if (fileNbr !== fileNbrPrev + 1) console.log(`File received out of sequence: prev was ${fileNbrPrev}; got ${fileNbr}`)
    fileNbrPrev = fileNbr
  
    let elementIndex = headerBufferLength    // index into dataBufferView
    let content = []  // the body (content) to be sent in the HTTP request
    for (let recordIndex = 0; recordIndex < recordCount; recordIndex++) {
      //const year = String(dataBufferView[elementIndex++]);
      const month = String(dataBufferView[elementIndex++]);
      const day = String(dataBufferView[elementIndex++]);
      const hours = String(dataBufferView[elementIndex++]);
      const minutes = String(dataBufferView[elementIndex++]);
      const seconds = String(dataBufferView[elementIndex++]);
      const hr = dataBufferView[elementIndex++];
      const x = dataBufferView[elementIndex++] / ACCEL_SCALAR;
      const y = dataBufferView[elementIndex++] / ACCEL_SCALAR;
      const z = dataBufferView[elementIndex++] / ACCEL_SCALAR;

      const fulltime = hours + ':' + minutes + ':' + seconds //year + '_' + month + '_' + 


      const record = {
        date: month + '-' + day,
        time: fulltime,
        hr: hr,
        X: x,
        Y: y,
        Z: z
      };
      sendToServerViaSocket(JSON.stringify(record))
    }
    sendToWatch(file.name, 200, true)

    localStorage.setItem('fileNbrPrev', fileNbrPrev)
}

async function receiveStatusFromWatch(file) {
    const status = await file.cbor()
    console.log(`status=${status} (${typeof status})`)
    const statusText = status.status
    console.log(`receiveStatusFromWatch() status=${statusText}`)
    settingsStorage.setItem('fileNbr', `Watch: ${statusText}`)
  }
  
  function sendToWatch(fileName, status, updateSettings) {
    if (updateSettings) settingsStorage.setItem('status', statusMsg[status])
  
    outbox.enqueue('response-'+Date.now(), encode({fileName:fileName, status:status}))
    .then((ft) => {
      console.log(`Transfer of ${ft.name} successfully queued.`);
    })
    .catch((error) => {
      console.error(`Failed to queue response for ${fileName}: ${error}`);
      settingsStorage.setItem('status', "Can't send to watch")
    })
}

// Initialise settings:

settingsStorage.setItem('date', '')
settingsStorage.setItem('hr', '')
settingsStorage.setItem('time', '')
settingsStorage.setItem('X', '')
settingsStorage.setItem('Y', '')
settingsStorage.setItem('Z', '')

messaging.peerSocket.onopen = function() {
  console.log('Messaging open')
}

messaging.peerSocket.onmessage = function(evt) {
  // Display data on settings page (for no good reason):
  settingsStorage.setItem('date', evt.data.date)
  settingsStorage.setItem('hr', evt.data.hr)
  settingsStorage.setItem('time', evt.data.time)
  settingsStorage.setItem('X', evt.data.x)
  settingsStorage.setItem('Y', evt.data.y)
  settingsStorage.setItem('Z', evt.data.z)

  // Pass data to server:
  let data = JSON.stringify(evt.data)
  sendToServerViaSocket(data)
}

messaging.peerSocket.onclose = function(evt) {
  console.log(`Messaging closed: ${evt.code}`)
}

messaging.peerSocket.onerror = function(evt) {
  console.log(`Messaging error: ${evt.code}: ${evt.message}`)
}


// Companion-to-server socket:

const wsURL = 'ws://127.0.0.1:8080'
// 127.0.0.1 indicates the companion device, and is the only URL we can use without SSL.
// 8080 is a port that's commonly used for WebSockets.

let websocket

openServerConnection()

function openServerConnection() {
  websocket = new WebSocket(wsURL)
  websocket.addEventListener('open', onSocketOpen)
  websocket.addEventListener('message', onSocketMessage)
  websocket.addEventListener('close', onSocketClose)
  websocket.addEventListener('error', onSocketError)
}

function onSocketOpen(evt) {
   console.log('onSocketOpen()')
}

function onSocketMessage(evt) {
  // If using fetch(), companion may receive a copy of the socket broadcast from the server. Ignore it.
  console.log(`onSocketMessage():`)
}

function onSocketClose() {
   console.log('onSocketClose()')
}

function onSocketError(evt) {
   console.error('onSocketError(): check that the server is running and accessible')
}

function sendToServerViaSocket(data) {
  //console.log(`sendToServerViaSocket()`)

  if (websocket.readyState === websocket.OPEN) {
    websocket.send(data)
  } else {
    console.log(`sendToServerViaSocket(): can't send because socket readyState=${websocket.readyState}`)
  }
}

setInterval(() => {   // periodically try to reopen the connection if need be
  if (websocket.readyState === websocket.CLOSED) {
    console.warn(`websocket is closed: check server is running at ${wsURL}`)
    console.log(`attempting to reopen websocket`)
    openServerConnection()
  }
}, 1000)
