# Patient Admission Use Case

Demonstrates hospital patient admission workflow using HL7v2 and FHIR integration.

## Architecture

1. [hl7v2-client](hl7v2-client/) - Sends ADT^A01 message for patient admission event
2. [adt-a01-to-fhir-service](adt-a01-to-fhir-service/) - Listens for HL7v2 messages, transforms to FHIR resources
3. FHIR Repository - Stores transformed Patient and Encounter resources

## Message Flow

```
HL7v2 Client (ADT^A01) � ADT-to-FHIR Service � FHIR Repository (Patient + Encounter)
```

## Sample ADT^A01 Message

```
MSH|^~\&|SIMHOSP|SFAC|RAPP|RFAC|2020-05-08T13:06:43||ADT^A01|5|T|2.3|||AL||44|ASCII
EVN|A01|2020-05-08T13:06:43|||2001^Wolf^Kathy^^^Dr^^^DRNBR
PID|1|2590157853^^^SIMULATOR MRN^MRN|2590157853^^^SIMULATOR MRN^MRN~2478684691^^^NHSNBR^NHSNMBR||Esterkin^AKI Scenario 6^^^Miss^^CURRENT||1989-01-18T00:00:00|F|||170 Juice Place^^London^^RW21 6KC^GBR^HOME||020 5368 1665^HOME|||||||||R
PV1|1|I|RenalWard^MainRoom^Bed 1^Simulated Hospital^^BED^Main Building^5|28b|||2001^Wolf^Kathy^^Dr^^^DRNBR^PRSNL^^^ORGDR|||MED|||||||||6145914547062969032^^^^visitid||||||||||||||||||||||ARRIVED|||2020-05-08T13:06:43
```

## Running the Demo

### Local Deployment

#### Configuration

##### ADT-to-FHIR Service

Create a `Config.toml` file in the [adt-a01-to-fhir-service](adt-a01-to-fhir-service/) directory with the following configuration:

```toml
# FHIR server endpoint
fhirServerUrl="http://localhost:8080/fhir"

# Azure AD OAuth2 configuration (if using Azure FHIR)
tokenUrl="https://login.microsoftonline.com/<tenant-id>/oauth2/token"
scopes=["system/Patient.read", "system/Patient.write"]
client_id="<your-client-id>"
client_secret="<your-client-secret>"

# FHIR server response header configuration
location_header_key="Location"

# Optional: Enable debug logging
# [ballerina.log]
# level = "DEBUG"
```

##### HL7v2 Client

Create a `Config.toml` file in the [hl7v2-client](hl7v2-client/) directory with the following configuration:

```toml
# HL7v2 server connection settings
serverAddress="localhost"
serverPort=8000
```

#### Steps

1. Start the ADT-to-FHIR service: `cd adt-a01-to-fhir-service && bal run`
2. Send ADT^A01 message: `cd hl7v2-client && bal run`

### Devant Deployment

#### Configuration

##### ADT-to-FHIR Service (Devant)

Configure the following as environment variables in Devant or in your `Config.toml`:

```toml
# FHIR server endpoint (e.g., Azure FHIR or other cloud FHIR server)
fhirServerUrl="https://<your-fhir-server>"

# OAuth2 configuration
tokenUrl="<token URL>"
scopes=["system/Patient.read", "system/Patient.write"]
client_id="<your-client-id>"
client_secret="<your-client-secret>"

# FHIR server response header configuration
location_header_key="Location"
```

##### HL7v2 Client (Connecting to Devant)

Create a `Config.toml` file in the [hl7v2-client](hl7v2-client/) directory with your Devant service endpoint:

```toml
# Devant TCP endpoint details
serverAddress="<your-Devant-service-hostname>"
serverPort=<Devant-service-tcp-port>
```

**Note:** For Devant deployment, you'll need to:
1. Deploy the ADT-to-FHIR service as a TCP service in Devant
2. Configure the service endpoint and port mapping in Devant
3. Update the HL7v2 client configuration with the Devant endpoint details
4. Ensure network connectivity between your client and Devant service

#### Steps

1. Deploy the ADT-to-FHIR service to Devant
2. Configure the environment variables in Devant deployments section
3. Update the HL7v2 client configuration with Devant endpoint
4. Send ADT^A01 message: `cd hl7v2-client && bal run`
