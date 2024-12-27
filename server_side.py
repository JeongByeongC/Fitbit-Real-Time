#!/usr/bin/python

import asyncio
import websockets
import json
from websockets.exceptions import ConnectionClosedError
import os
import datetime
from concurrent.futures import TimeoutError as ConnectionTimeoutError
from inspect import currentframe
import requests
from threading import Lock

data_directory = "/home/ni3/Desktop/hr-data/"
monitoring_uri = "http://localhost:9990/post-data"
data = {}
data_lock = Lock()

class Fitbit:
    def __init__(self, num, name, uri):
        self.num = num
        self.name = name
        self.uri = uri
        self.ip = self.uri.split(":")[1].split(".")[-1]
        self._wait = False
        self._pong = False
        self.pth = os.path.join(data_directory, self.name)
        self.prev_time = None
        self._mkdir()
        self.set_default()

    def set_default(self, state='-'):
        data[self.name] = {
            'date': '-',
            'time': '-', 'hr': state,
            'X': '-', 'Y': '-', 'Z': '-', 'ip': self.ip
            }

    def _mkdir(self):
        if not os.path.exists(self.pth):
            os.mkdir(self.pth)
                
    """
    # message의 구조:
    # {'time' : ~~~, 'hr' : ~~~, 'X' ...}
    """
    async def receive_data(self, message):
        # ping 메시지인지 확인
        if message == 'ping':
            current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            log_msg = f"{current_time} - received ping from {self.ip} ({self.name}), ignoring for storage."
            logger(log_msg)  # ping 메시지만 로그 파일에 기록
            return  # ping 메시지는 무시하고 저장하지 않음
        try:
            k = json.loads(message)
            date = k['date']
            time = k['time']
            hr_data = k['hr']
            xyz = f"X: {k['X']}, Y: {k['Y']}, Z: {k['Z']}"

            if self.prev_time is None:
                self.prev_time = str_to_datetime(time)

            msg = f"date: {date} / time: {time} / hr: {hr_data} / xyz: {xyz} / ip: {self.ip}"

            filepath = os.path.join(self.pth, get_date_for_filename())

            with open(filepath, 'a') as f:
                f.write(msg + '\n')
                f.flush()

            #with data_lock:
            #    data[self.name] = {
            #        'date': date,
            #        'time': time, 'hr': hr_data, 
            #        'xx': k['X'], 'yy': k['Y'], 'zz': k['Z'], 'ip': self.ip
            #        }
            #    send_data()

            self.prev_time = str_to_datetime(time)
        except json.JSONDecoderError:
            print("Receviced non-JSON message, possibly a ping.")

    async def connect(self):
        retry_attempts = 0
        max_retries = 20  # 최대 재시도 횟수 설정
        while retry_attempts < max_retries:
            try:
                async with websockets.connect(self.uri) as ws:
                    # 연결 성공시 초기화
                    retry_attempts = 0  
                    print(f"{self.name}/{self.ip}: connected")
                    self._wait = False
                    while True:
                        try:
                            self._pong = False
                            reply = await asyncio.wait_for(ws.recv(), timeout=5)  # 타임아웃 시간 조정
                        except (asyncio.TimeoutError, ConnectionClosedError):
                            try:
                                self.set_default('wait')
                                pong = await ws.ping()
                                await asyncio.wait_for(pong, timeout=2)
                                continue
                            except:
                                self.set_default('pong')
                                break
                        await self.receive_data(reply)
            except (ConnectionRefusedError, ConnectionClosedError):
                self.set_default('X')
                retry_attempts += 1
                backoff_time = min(4 ** retry_attempts, 30)  # 백오프 시간 설정 (최대 30초)
                print(f"{self.name}/{self.ip}:: 연결 끊김, {backoff_time}초 후 재시도")
                await asyncio.sleep(backoff_time)  # 백오프 시간만큼 대기 후 재시도
            except:
                self.set_default()

def str_to_datetime(time_str):
    return datetime.datetime.strptime(time_str, "%H:%M:%S")

def get_datetime():
    return str(datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

def get_seconds(time):
    return time.split(':')[-1]

def get_date_for_filename():
    return str(datetime.datetime.now().date()) + ".txt"

def check_directory():
    if not os.path.exists(data_directory):
        os.mkdir(data_directory)

def send_data(): ## request 로 수정
    global data
    try:
        _data = json.dumps(str(data))
        requests.post(monitoring_uri, data=_data)
    except:
        pass

def logger(msg):
    log_file_path = "/home/ni3/Desktop/prog/fitbit-server/recived_ping_log.log"  # 원하는 로그 파일 경로 설정

    # 로그 파일에 기록
    with open(log_file_path, "a") as log_file:
        log_file.write(msg + "\n")


async def main():
    """여러 WebSocket 연결을 시작하는 코루틴"""
    fits = [Fitbit(0, "069", 'ws://192.168.0.129:8080'), Fitbit(1, "068", 'ws://192.168.0.128:8080'), Fitbit(2, "062", 'ws://192.168.0.126:8080'), Fitbit(3, "067", 'ws://192.168.0.127:8080'), 
            Fitbit(4, "032", 'ws://192.168.0.83:8080')]
    tasks = [asyncio.create_task(fit.connect()) for fit in fits]

    await asyncio.gather(*tasks)

# 이벤트 루프를 시작하여 주 코루틴을 실행.
if __name__ == "__main__":
    print("__main__")
    check_directory()
    asyncio.run(main())
