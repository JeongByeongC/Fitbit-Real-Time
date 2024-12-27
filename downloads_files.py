import requests
import os
import re

# 날짜 형식 변환 함수
def format_filename(filename):
    # 정규 표현식을 사용해 YYYY_MM_DD 형식을 YYYY-MM-DD로 변환하고, 1자리 숫자에 0을 추가
    match = re.match(r"(\d{4})_(\d{1,2})_(\d{1,2})", filename)
    if match:
        year, month, day = match.groups()
        formatted_name = f"{year}-{int(month):02d}-{int(day):02d}.txt"
        return formatted_name
    return filename  # 변환이 불가능하면 원래 파일명 반환

# Raspberry Pi들의 IP 주소와 각 Fitbit 장치 이름을 매핑
raspberry_pis = {
    "192.168.0.129": "069",
    "192.168.0.128": "068",
    "192.168.0.126": "062",
    "192.168.0.127": "067",
    "192.168.0.83": "032"
}

data_save_path = "/home/ni3/Desktop/hr-data/from_ras"
if not os.path.exists(data_save_path):
    os.makedirs(data_save_path)

for ip, device_name in raspberry_pis.items():
    raspberry_pi_address = f'http://{ip}:8081'

    # 파일 목록 가져오기
    response = requests.get(f'{raspberry_pi_address}/files')
    if response.status_code == 200:
        file_list = response.json()
    else:
        print(f"Failed to fetch files from {ip}")
        continue

    # 각 파일 다운로드
    device_data_path = os.path.join(data_save_path, device_name)
    if not os.path.exists(device_data_path):
        os.makedirs(device_data_path)

    for filename in file_list:
        new_filename = format_filename(filename)

        file_url = f'{raspberry_pi_address}/files/{filename}'
        file_response = requests.get(file_url)
        
        if file_response.status_code == 200:
            file_path = os.path.join(device_data_path, new_filename)
            with open(file_path, 'wb') as f:
                f.write(file_response.content)
            print(f'Downloaded {filename} for device {device_name} (IP: {ip}) successfully.')
        else:
            print(f'Failed to download {filename} from {ip}.')
