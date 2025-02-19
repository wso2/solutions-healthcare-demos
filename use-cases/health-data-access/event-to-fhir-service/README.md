# Event to FHIR Service

This service accepts custom health data events, transforms them into FHIR resources, and persists them in the configured FHIR repository.

## Overview

The Event to FHIR Service is designed to handle custom health data events, convert them into FHIR (Fast Healthcare Interoperability Resources) format, and store them in a specified FHIR repository. This ensures interoperability and standardization of health data. This demo supports convert a health data event that has patient data into a FHIR Patient resource.

## Setup and Run

To setup and run the service, follow these steps:

1. **Clone the repository**:
    ```sh
    git clone https://github.com/your-repo/solutions-healthcare-demos.git
    cd solutions-healthcare-demos/use-cases/health-data-access/event-to-fhir-service
    ```

2. **Install Ballerina**:
    Follow the instructions to install Ballerina from the [official website](https://ballerina.io/downloads/).

3. **Build the service**:
    ```sh
    bal build
    ```

4. **Configure the service**:
    Add a Config.toml file to the root directory with the following configurations:
    ```toml
    # FHIR Repository Base URL
    fhirServerUrl = "https://your-fhir-repository.com"
    # FHIR Repository Token URL
    tokenUrl = "https://your-fhir-repository.com/token"
    # FHIR Repository Client ID
    clientId = "your-client-id"
    # FHIR Repository Client Secret
    clientSecret = "your-client-secret"
    # FHIR Repository API scopes
    scopes = ["scope1", "scope2"]
    ``` 

4. **Run the service**:
    ```sh
    bal run target/bin/event_to_fhir_service.jar
    ```
  