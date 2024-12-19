# MedConnect Service Overview
The MedConnect Service interacts directly with Cerner enabling streamlined access to essential healthcare functionalities. We can follow the below steps to run the setup locally. 

## Services Provided by MedConnect Service
The MedConnect Service API offers the following functionalities:

- Practitioner Search: Retrieve practitioner details using their first and last names.
- Slot Search: Find available appointment slots for a specific day and practitioner.
- Location Lookup: Retrieve location details using the location's unique ID.
- Appointment Creation: Create a new appointment resource with the specified details.

## Prerequisites 
1. Let's call the this Ballerina project as MEDCONNECT-SERVICE-HOME. 
1. Create MEDCONNECT-SERVICE-HOME/Config.toml file and your Cerner configurations as below. Priorer to this you need obtain Cerner credentials. 
```
baseServerHost = "http://localhost:9090"
cernerUrl = "<CERNER_URL>"
tokenUrl = "<CERNER_TOKEN_URL>"
clientId = "<CLIENT_ID>"
clientSecret = "<CLIENT_SECRET>"
scopes = ["system/Appointment.read", "system/Appointment.write", "system/Slot.read", "system/Slot.write", "system/Practitioner.read", "system/Location.read"]
```

## Steps to run the MedConnect Service. 
1. Run the Ballerina service
```
bal run
```
2. Test the service by executing the following commands. 
- Search a Practitioner with given name and family name.  
```
curl --location 'http://localhost:9092/fhir/r4/Practitioner?family=Applegate&given=Christina'
```

- Search slots for a given date of a particular Practitioner.
```
curl --location 'http://localhost:9098/fhir/r4/Slot?service-type=https%3A%2F%2Ffhir.cerner.com%2Fec2458f2-1e24-41c8-b71b-0e701af7583d%2FcodeSet%2F14249%7C4047611&start=ge2023-01-14T06%3A00%3A00Z&start=lt2024-01-15T23%3A00%3A00Z&practitioner=593923&_count=5'
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
