# Aggregate Backend Overview
The Aggregate Backend interacts with Cerner's Pre-Built services, enabling streamlined access to essential healthcare functionalities. We can follow the below steps to run the setup locally. 

## Services Provided by Aggregate Backend
The Aggregate Backend API offers the following functionalities:

- Practitioner Search: Retrieve practitioner details using their first and last names.
- Slot Search: Find available appointment slots for a specific day and practitioner.
- Location Lookup: Retrieve location details using the location's unique ID.
- Appointment Creation: Create a new appointment resource with the specified details.

## Prerequisites 
1. Clone [open-healthcare-prebuilt-services repository](https://github.com/wso2/open-healthcare-prebuilt-services)
2. Navigate to <PREBUILT-SERVICES-HOME>/ehr-connectivity/cerner-fhirr4-administration-api-service
3. Create Config.toml file and your Cerner configurations as below. 
```
baseServerHost = "http://localhost:9090"
cernerUrl = "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d"
tokenUrl = "https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/protocols/oauth2/profiles/smart-v1/token"
clientId = ""
clientSecret = ""
scopes = ["system/Practitioner.read", "system/Practitioner.write", "system/Location.read"]
```
4. Run the Ballerina service
```
bal run
```
5. Test the service by executing the following command to search a Practitioner. 
```
curl --location 'http://localhost:9092/fhir/r4/Practitioner?family=Applegate&given=Christina'
```

6. Now navigate to cerner-fhirr4-workflow-api-service directory and add the Config.toml. 
```
baseServerHost = "http://localhost:9090"
cernerUrl = "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d"
tokenUrl = "https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/protocols/oauth2/profiles/smart-v1/token"
clientId = ""
clientSecret = ""
scopes = ["system/Appointment.read", "system/Appointment.write", "system/Schedule.read", "system/Slot.read", "system/Slot.write"]
```

7. You can test the service by executing the following command. 
```
curl --location 'http://localhost:9098/fhir/r4/Slot?service-type=https%3A%2F%2Ffhir.cerner.com%2Fec2458f2-1e24-41c8-b71b-0e701af7583d%2FcodeSet%2F14249%7C4047611&start=ge2023-01-14T06%3A00%3A00Z&start=lt2024-01-15T23%3A00%3A00Z&practitioner=593923&_count=5'
```

## Steps to run the Aggregate backend. 
1. Navigate to the Ballerina project home and run the service 
```
bal run -- -Cballerina.http.traceLogConsole=true 
```

2. Test the service by invoking the following command. 

- Search a Practitioner with given name and family name. 
```
curl --location 'http://localhost:8081/fhir/r4/Practitioner?family=Applegate&given=Christina'
```

- Search slots for a given date of a particular Practitioner. 
```
curl --location 'http://localhost:8082/fhir/r4/Slot?startDate=2024-12-24&practitioner=593923'
```

- Retrive location by its id. 
```
http://localhost:8084/fhir/r4/Location/32216049
```

- Create an Appointment 
```
curl --location 'http://localhost:8083/fhir/r4/Appointment' \
--header 'Content-Type: application/fhir+json' \
--data '{
    "resourceType": "Appointment",
    "status": "booked",
    "slot": [
        {
            "reference": "Slot/4047611-25442717-65876882-45"
        }
    ],
    "start": "2024-12-24T06:45:00Z",
    "end": "2024-12-24T07:45:00Z",
    "participant": [
        {
            "actor": {
                "reference": "Patient/12724066"
            },
            "status": "accepted"
        }
    ]
}'
```
Please note that once an Appointment is created for a given Slot ID, it cannot be reused. You need to find a new Slot ID and provide its start and end date to the payload. 