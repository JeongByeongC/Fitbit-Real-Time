import { me } from "appbit";
import {HeartRateSensor } from "heart-rate";
import {Accelerometer } from "accelerometer";
import * as messaging from "messaging";
import * as fs from "fs";
import { inbox, outbox } from 'file-transfer'
import { BodyPresenceSensor } from "body-presence";
import * as document from "document"

const ACCEL_SCALAR = 500 

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

const valuesPerRecord = 9
const headerLength = Uint32Array.BYTES_PER_ELEMENT;
let timeString;
let dateString;
const frequency = 1;                                    // Hz (records per second): watch may go faster as it rounds intervals down to a multiple of 10ms
const batchPeriod = 1;                                   // elapsed time between batches (seconds)
const recordsPerBatch = frequency * batchPeriod;
const bytesPerRecord = valuesPerRecord * 2;              // 2 because values are Int16 (2 bytes) each
const recDurationPerFile = 60;                           // seconds of data that will be stored in each file (assuming frequency is accurate) (default: 60)  // TODO 8 set recDurationPerFile = 60
const recordsPerFile = frequency * recDurationPerFile;   // 1800 for ~15 second BT transfer time at 8 bytes per record; 100 for a new file every few seconds; file may exceed this by up to recordsPerBatch
const bytesPerBatch = bytesPerRecord * recordsPerBatch;
const headerBuffer = new ArrayBuffer(headerLength);   // holds timestamp of first record in file
const headerBufferView = new Uint32Array(headerBuffer);
const dataBuffer = new ArrayBuffer(bytesPerBatch);
const dataBufferView = new Int16Array(dataBuffer);

var hours 
var minutes
var seconds
var month
var day

const hrm = new HeartRateSensor({ frequency: frequency, batch:recordsPerBatch })
const acc = new Accelerometer({ frequency: frequency, batch: recordsPerBatch })
var hr = 0
var x = 0
var y = 0
var z = 0

let fileDescriptor = undefined
let isRecording = false, isTransferring = false
let sokcketopend = false
let fileNumberSending
let recordsInFile, recordsRecorded
let startTime
let dateLastBatch   // only used for debug logging
let fileTimestamp   // timestamp of first record in file currently being recorded
let prevTimestamp
let state = {
  fileNumberRecording: undefined
}
let companionWakeTimer
const COMPANION_WAKE_INTERVAL = 20000

inbox.addEventListener("newfile", receiveFilesFromCompanion)
receiveFilesFromCompanion()

me.appTimeoutEnabled = false;

messaging.peerSocket.onopen = function() {
    console.log("Messaging open")
};

messaging.peerSocket.onclose = function(evt) {
    console.log(`Messaging closed: ${evt.code}`)
};
  
  messaging.peerSocket.onerror = function(evt) {
    console.log(`Messaging error: ${evt.code}: ${evt.message}`)
};

function openFile() {   // opens a new file corresponding to state.fileNumberRecording and writes fileTimestamp
    console.log(`Starting new file: ${state.fileNumberRecording}`)
    fileDescriptor = fs.openSync(state.fileNumberRecording, 'a')
    // Write fileTimestamp at start of file:
    headerBufferView[0] = fileTimestamp
    //console.log(`header=${headerBufferView[0]}`)
    fs.writeSync(fileDescriptor, headerBuffer)
    recordsInFile = 0
};

function deleteFiles() {
    const fileIter = fs.listDirSync('/private/data/')
    let nextFile = fileIter.next()
    while (!nextFile.done) {
        console.log(nextFile.value)
        fs.unlinkSync(nextFile.value)
        console.log(`Delete ${nextFile.value}`)
        nextFile = fileIter.next()
    }
}

function init_filenum() {
  const fileIter = fs.listDirSync('/private/data/');
  let nextFile = fileIter.next();
  let maxFileNumber = 0;

  while (!nextFile.done) {
      const fileName = nextFile.value;
      const match = fileName.match(/^(\d+)$/);

      if (match) {
          const fileNumber = parseInt(match[1], 10);
          if (fileNumber > maxFileNumber) {
              maxFileNumber = fileNumber;
          }
      }

      nextFile = fileIter.next();
  }
  state.fileNumberRecording = maxFileNumber + 1;

  console.log(`Initialized fileNumberRecording to ${state.fileNumberRecording}`);
}


function startRec() {
    if (isTransferring) return
    dateLastBatch = recordsInFile = recordsRecorded = 0
    init_filenum()
    //state.fileNumberRecording = 1
    console.log('Started.')
    startTime = Date.now()
    isRecording = true
}

function stopRec() {
    fs.closeSync(fileDescriptor)
    fileDescriptor = undefined

    console.log(`stopRec(): fileNumberRecording=${state.fileNumberRecording} recordsInFile=${recordsInFile}`)
    if (!recordsInFile) {   // don't include a zero-length file
        console.error(`Empty file!`)
        fs.unlinkSync(state.fileNumberRecording)
        state.fileNumberRecording--
    }
    recordsRecorded += recordsInFile
    console.log('Stopped.')
    isRecording = false
}
/*
function startTransfer() {
    if (!state.fileNumberRecording) return
    isTransferring = true
    fileNumberSending = 1
    sendFile()
}*/


function startTransfer() {
  // 파일 디렉토리에서 가장 작은 파일 번호를 찾음
  if (!state.fileNumberRecording) return
  const fileIter = fs.listDirSync('/private/data/');
  let nextFile = fileIter.next();
  let minFileNumber = Infinity; // 초기값을 무한대로 설정하여 첫 번째 파일이 비교 대상이 되도록 함

  while (!nextFile.done) {
      const fileName = nextFile.value;
      const match = fileName.match(/^(\d+)$/);

      if (match) {
          const fileNumber = parseInt(match[1], 10);
          if (fileNumber < minFileNumber) {
              minFileNumber = fileNumber;
          }
      }

      nextFile = fileIter.next();
  }

  if (minFileNumber === Infinity) {
      console.warn("No files found to transfer.");
      return;
  }
  fileNumberSending = minFileNumber;
  isTransferring = true;
  sendFile(); // 첫 파일 전송 시작
}


function stopTransfer() {
    isTransferring = false
}

function wakeCompanion() {
    // This can happen when using the sim and multiple instances are running (which is a known sim bug). In this case, kill all sim-related processes (including invisible).
    console.log('wakeCompanion()')
    outbox.enqueueFile('/mnt/assets/resources/wake')  // doesn't always work — and never will if multiple sim or companion instances are running
    //launchApp("3021f085-283d-4424-b2e8-b88e4c46a5b0")// If companion doesn't respond, transfer to a relanching app, restart and resume. Pass UUID of this app, and fileName to resume.
}

function sendFile(fileName) {  
    const operation = fileName? 'Res' : 'S'   // plus 'ending...'
    if (!fileName) fileName = fileNumberSending
  
    outbox
      .enqueueFile("/private/data/"+fileName)
      .then(ft => {
        console.log(`${operation}ending file ${fileName} of ${state.fileNumberRecording}: queued`)
        if (companionWakeTimer === undefined) companionWakeTimer = setInterval(wakeCompanion, COMPANION_WAKE_INTERVAL)
      })
      .catch(err => {
        console.error(`Failed to queue transfer of ${fileName}: ${err}`);
      })
}

function sendNextFile() {
    if (++fileNumberSending > state.fileNumberRecording) {
      console.log('All files sent okay; waiting for server to acknowledge')
      sendObject({status:'done'})
      return
    }
    console.log(`${fileNumberSending} sending`)
    sendFile()
}

function sendObject(obj) {
    fs.writeFileSync("obj.cbor", obj, "cbor")
  
    outbox
      .enqueueFile("/private/data/obj.cbor")
      .then(ft => {
        console.log(`obj.cbor transfer queued.`);
      })
      .catch(err => {
        console.log(`Failed to schedule transfer of obj.cbor: ${err}`);
      })
}

function resendFile(response) {
    console.log(`Resending ${response.fileName}`)
    sendFile(response.fileName)
}

function receiveFilesFromCompanion() {
    if (companionWakeTimer !== undefined) {clearInterval(companionWakeTimer); companionWakeTimer = undefined}   // TODO 8 reinstate
  
    let fileName
    while (fileName = inbox.nextFile()) {
      console.log(`receiveFilesFromCompanion(): received ${fileName}`)
      const response = fs.readFileSync(fileName, 'cbor')
      console.log(`watch received response status code ${response.status} (${statusMsg[response.status]}) for file ${response.fileName}`)
      // See /common/common.js for response.status codes.
      if (response.fileName) {
        if (isTransferring) {
          if (response.status === 200) {
            sendNextFile()
          }
          else resendFile(response)
        }
      } else {  // no fileName; must have been a control object
        // should check response.status
        isTransferring = false
        sokcketopend = true
      }
  
      fs.unlinkSync(response.fileName)
      fs.unlinkSync(fileName)
      console.log(`${fileName} deleted too`)
      console.log(`${response.fileName} file deleted`)
    }
}

function deleteOldResponseFiles() {
    const dirPath = '/private/data/';
    const fileIter = fs.listDirSync(dirPath);
    let responseFiles = [];
    let nextFile = fileIter.next();
    while (!nextFile.done) {
        const fileName = nextFile.value;
        if (fileName.match(/^response-/)) {
            responseFiles.push(fileName);
        }
        if (responseFiles.length >= 10) {
            for (let i = 0; i < 10; i++) {
                const fileToDelete = dirPath + responseFiles[i];
                fs.unlinkSync(fileToDelete);
            }
            return;
        }
        nextFile = fileIter.next();
    }
}

deleteOldResponseFiles()
init_filenum()


if (BodyPresenceSensor) {
    const body = new BodyPresenceSensor();
    body.addEventListener("reading", () => {
      if (!body.present) {
        hrm.stop();
        acc.stop();
      } else {
        hrm.start();
        acc.start();
      }
    });
    body.start();
  }


hrm.addEventListener("reading", () => {
    if ( hrm.activated ) {
        acc.addEventListener("reading", () => {
            x = acc.x;
            y = acc.y;
            z = acc.z;
        });
        var todays = new Date()
        hours = ('0' + todays.getHours()).slice(-2)
        minutes = ('0' + todays.getMinutes()).slice(-2)
        seconds = ('0' + todays.getSeconds()).slice(-2)
        month = ('0' + (todays.getMonth()+1)).slice(-2);
        day = ('0' + todays.getDate()).slice(-2);
        timeString = hours + ':' + minutes + ':' + seconds
        dateString = month+'-'+day
        hr = hrm.heartRate;

        if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
            if (!sokcketopend) {
                if (isRecording){
                    stopRec()
                }
                if (!isTransferring) {
                    startTransfer()
                }
                sokcketopend = true
            } else {
                messaging.peerSocket.send({date:dateString, time:timeString, hr:hr, X:x, Y:y, Z:z})
            }
        } else {
            wakeCompanion()
            console.warn('Messaging socket not open')
            sokcketopend = false
            if (isTransferring){
                stopTransfer()
            }
            if ( !isRecording ) {
                startRec()
            }
        
            const dateNow = Date.now()
            dateLastBatch = dateNow
        
            // See if we need a new file for this batch:
            const needNewFile = fileDescriptor === undefined || recordsInFile >= recordsPerFile
            if (needNewFile) {
                fileTimestamp = prevTimestamp = hrm.readings.timestamp[0]
                console.log(`needNewFile: fileTimestamp=${fileTimestamp}`);
            }
            
            const batchSize = hrm.readings.timestamp.length
            let bufferIndex = 0, timestamp
            for (let index = 0; index<batchSize; index++) {
                //dataBufferView[bufferIndex++] = parseInt(year)
                dataBufferView[bufferIndex++] = parseInt(month)
                dataBufferView[bufferIndex++] = parseInt(day)
                dataBufferView[bufferIndex++] = parseInt(hours)               
                dataBufferView[bufferIndex++] = parseInt(minutes)
                dataBufferView[bufferIndex++] = parseInt(seconds)
                dataBufferView[bufferIndex++] = hrm.readings.heartRate[index]
                dataBufferView[bufferIndex++] = acc.readings.x[index] * ACCEL_SCALAR
                dataBufferView[bufferIndex++] = acc.readings.y[index] * ACCEL_SCALAR
                dataBufferView[bufferIndex++] = acc.readings.z[index] * ACCEL_SCALAR
                
                
            }
        
            if (fileDescriptor === undefined) {   // this is the start of this recording session
                openFile()
            } else {  // a file is already open
                if (recordsInFile >= recordsPerFile) {  // file is full
                fs.closeSync(fileDescriptor)
                recordsRecorded += recordsInFile
                state.fileNumberRecording++
                openFile()
                }
            }
            // Write record batch to file:
            try {
                fs.writeSync(fileDescriptor, dataBuffer, 0, batchSize*bytesPerRecord)
                recordsInFile += batchSize
            } catch(e) {
                console.error("Can't write to file (out of storage space?)")
            }
        }
    }
})
