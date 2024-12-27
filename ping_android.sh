#!/bin/bash

# 안드로이드 OS IP 주소 목록
ANDROID_IPS=("192.168.0.129" "192.168.0.128" "192.168.0.126" "192.168.0.127" "192.168.0.83")

# 로그 파일 경로
LOGFILE="/home/ni3/Desktop/prog/fitbit-server/ping_log.log"

# 주기적으로 각 IP에 Ping을 보내고 결과를 로그 파일에 저장
while true; do
    for IP in "${ANDROID_IPS[@]}"; do
        # 현재 날짜와 시간 가져오기
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

        # Ping 명령 실행 및 성공 여부 확인
        if ping -c 1 $IP > /dev/null 2>&1; then
            STATUS="Success"
        else
            STATUS="Failure"
        fi

        # 로그 파일에 날짜, IP, 성공 여부 기록
        echo "$TIMESTAMP | IP: $IP | Status: $STATUS" >> $LOGFILE
    done
    sleep 60  # 1분마다 모든 IP에 대해 ping 전송
done

