# DaVinci CRD Use Case

This repository contains a sample implementation of the DaVinci Coverage Requirements Discovery (CRD) use case. It includes a sample CDS server implementation using the WSO2 Healthcare solution and a sample EHR application to mimic the CDS flow.

## Overview

The DaVinci CRD use case aims to streamline the process of determining coverage requirements for healthcare providers and payers. This sample demonstrates how to implement a CDS server and integrate an EHR application to facilitate this process.

## Components

- **CDS Service**: Implemented using the WSO2 Healthcare solution, the CDS server processes requests and provides coverage requirement information. Refer to the [CDS Service](cds-service) for the CDS server implementation.
- **EHR Application**: A sample application that mimics the behavior of an Electronic Health Record (EHR) system, interacting with the CDS server to retrieve coverage requirements. Refer to the [EHR Application](../../apps/demo-ehr-app) to the source code of the EHR application.

## Getting Started

### Prerequisites

- Download and install [Ballerina Swan Lake](https://ballerina.io/downloads/) 2201.8.5 or above.

### Setup

1. **Clone the repository**:
    ```bash
    git clone https://github.com/wso2/solutions-healthcare-demos.git
    cd solutions-healthcare-demos/use-cases/davinci-crd
    ```

2. **Start the CDS Server**:
    Follow the instructions in the `cds-server` directory to set up and start the CDS server.

3. **Run the EHR Application**:
    Navigate to the `ehr-app` directory and follow the setup instructions to start the EHR application.

## Usage

Follow the steps from this video to see the DaVinci CRD use case in action:

[![DaVinci CRD Demo](https://img.youtube.com/vi/DwPvg-ya8CY/0.jpg)](https://youtu.be/DwPvg-ya8CY)


## Contact

For any questions or inquiries, please [contact us](https://wso2.com/solutions/healthcare/).
