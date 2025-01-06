# Fitbit-Real-Time

## Fitbit-Based Health Monitoring System for Closed Hospital Wards
This repository also includes a custom system developed to collect real-time heart rate and accelerometer data at 1Hz from Fitbit devices. The system is specifically designed for use in closed hospital wards, ensuring secure and localized data collection without external transmission to maintain patient confidentiality.

## System Overview

![무제](https://github.com/user-attachments/assets/4304bbfe-9524-45bc-8e92-2b0db39f6dfc)


To address the constraints of a closed ward and the sensitive nature of hospital data, the system operates entirely within the hospital infrastructure. As illustrated in the system design, the process involves:

+ **Fitbit Device**: Collects heart rate and accelerometer data at 1-second intervals.

+ **Intermediate Device** (e.g., Smartphone Alternative): Receives data via Bluetooth from the Fitbit and temporarily stores it. We used Raspberry Pi as alternative for smartphones.

+ **Main Server**: The Raspberry Pi forwards the collected data to a centralized hospital server for analysis and long-term storage.

## Code Description
1. **Raspberry Pi/Android_server.js**
   
     Handles data reception and transmission, including:

     + Receiving data from Fitbit and storing it on the Raspberry Pi with the current date.

     + Transmitting data to the main server using WebSocket protocols.

     + Sending periodic (minute-level) pings to the main server to prevent connected Android devices from entering sleep mode.
  
     + When reciving download signal from the main server, it sends all data to the main server.

2. **MainServer/Mainserver.py**

      Manages data reception at the main server, including:

      + Receiving data transmitted from multiple Raspberry Pi devices.

      + Consolidating and storing the data securely in the main storage server for further processing and analysis.

3. **MainServer/downloads_file.py**

      Ensures data integrity by:

      + Sending signals to Raspberry Pi devices to request stored data.

      + Allowing the main server to download any data that might not have been transmitted successfully.
  
4. **MainServer/ping_android.sh**

      Prevents Android devices from entering sleep mode by:

      + Periodically sending ping signals from the server to connected Android devices.

      + Ensuring uninterrupted connectivity for real-time data transmission.

5. **app**
      Contains the code for the custom Fitbit watch face designed to:

      + Collect heart rate and accelerometer data at 1Hz.

      + Collect data following the flow illustrated in Figure 2, where data is gathered directly from the Fitbit device and forwarded for further processing.

6. **build**

      Contains the build files required for:

      + Deploying the custom Fitbit watch face to devices.
  
      + Ensuring compatibility with the Fitbit development environment and hardware.

7. **companion**

      Defines how the companion application operates, including:

      + Utilizing Fitbit's message API to receive data sent from the Fitbit device.

      + Acting as a Bluetooth-connected intermediary to ensure reliable data transmission.

8. **Common**

      Defines commonly used functions to:

      + Support shared operations across different scripts.

      + Ensure consistency and reduce redundancy in the codebase.


