# Patient Admission Use Case

Demonstrates hospital patient admission workflow using HL7v2 and FHIR integration.

## Architecture

1. [hl7v2-client](hl7v2-client/) - Sends ADT^A01 message for patient admission event
2. [adt-a01-to-fhir-service](adt-a01-to-fhir-service/) - Listens for HL7v2 messages, transforms to FHIR resources
3. FHIR Repository - Stores transformed Patient and Encounter resources

## Message Flow

```
HL7v2 Client (ADT^A01) ’ ADT-to-FHIR Service ’ FHIR Repository (Patient + Encounter)
```

## Sample ADT^A01 Message

```
MSH|^~\&|SIMHOSP|SFAC|RAPP|RFAC|2020-05-08T13:06:43||ADT^A01|5|T|2.3|||AL||44|ASCII
EVN|A01|2020-05-08T13:06:43|||2001^Wolf^Kathy^^^Dr^^^DRNBR
PID|1|2590157853^^^SIMULATOR MRN^MRN|2590157853^^^SIMULATOR MRN^MRN~2478684691^^^NHSNBR^NHSNMBR||Esterkin^AKI Scenario 6^^^Miss^^CURRENT||1989-01-18T00:00:00|F|||170 Juice Place^^London^^RW21 6KC^GBR^HOME||020 5368 1665^HOME|||||||||R
PV1|1|I|RenalWard^MainRoom^Bed 1^Simulated Hospital^^BED^Main Building^5|28b|||2001^Wolf^Kathy^^Dr^^^DRNBR^PRSNL^^^ORGDR|||MED|||||||||6145914547062969032^^^^visitid||||||||||||||||||||||ARRIVED|||2020-05-08T13:06:43
```

## Running the Demo

1. Start the ADT-to-FHIR service: `cd adt-a01-to-fhir-service && bal run`
2. Send ADT^A01 message: `cd hl7v2-client && bal run`
