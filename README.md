# Fitbit-Real-Time

## Fitbit-Based Health Monitoring System for Closed Hospital Wards
This repository also includes a custom system developed to collect real-time heart rate and accelerometer data at 1Hz from Fitbit devices. The system is specifically designed for use in closed hospital wards, ensuring secure and localized data collection without external transmission to maintain patient confidentiality.

## System Overview (그림 추가할 것)
To address the constraints of a closed ward and the sensitive nature of hospital data, the system operates entirely within the hospital infrastructure. As illustrated in the system design, the process involves:

+ **Fitbit Device**: Collects heart rate and accelerometer data at 1-second intervals.

+ **Intermediate Device** (e.g., Smartphone Alternative): Receives data via Bluetooth from the Fitbit and temporarily stores it. We used Raspberry Pi as alternative for smartphones.

+ **Main Server**: The Raspberry Pi forwards the collected data to a centralized hospital server for analysis and long-term storage.

## Code Description
+ RaspberryPi/

Provides the script for:

Relaying data from the intermediate device to the hospital’s main server.

Securely storing data temporarily in the Raspberry Pi before forwarding it.

4. Server/DataProcessor

Implements server-side processing scripts for:

Parsing and organizing incoming data.

Performing basic validations and preparing the data for storage or analysis.

5. Server/VisualizationTool

Contains tools to:

Visualize patient data trends over time.

Provide actionable insights for clinicians.
