import ballerina/time;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;
import ballerinax/health.hl7v2;
import ballerinax/health.hl7v24;

// Function to map a FHIR Patient resource to HL7v2
public isolated function mapFhirPatientToHL7(
        international401:Patient fhirPatient,
        string sendingApp,
        string sendingFacility,
        string receivingApp,
        string receivingFacility,
        string messageControlId) returns byte[]|error {
    // Transforming the FHIR Patient resource to HL7v2
    hl7v24:RSP_K21 queryResult = check transform(fhirPatient, sendingApp, sendingFacility, receivingApp, receivingFacility, messageControlId);
    // Encoding the HL7 message
    byte[] encodedMsg = check hl7v2:encode(hl7v24:VERSION, queryResult);
    return encodedMsg;
}

isolated function transform(international401:Patient fhirPatient,
        string sendingApp,
        string sendingFacility,
        string receivingApp,
        string receivingFacility,
        string messageControlId) returns hl7v24:RSP_K21|error =>
        
        let
        r4:HumanName[] name = check fhirPatient.name.ensureType(),
        string familyName = check name[0].family.ensureType(),
        string givenName = string:'join(" ", ...check name[0].given.ensureType()),
        string gender = fhirPatient.gender.toString() == "male" ? "M" : "F",
        string messageDateTime = getCurrentTimestamp()
    in {
        msh: {
            msh2: "^~\\&",
            msh3: {
                hd1: sendingApp
            },
            msh4: {
                hd1: sendingFacility
            },
            msh5: {
                hd1: receivingApp
            },
            msh6: {
                hd1: receivingFacility
            },
            msh7: {
                ts1: messageDateTime
            },
            msh9: {
                msg1: "RSP^K21"
            },
            msh10: messageControlId,
            msh11: {
                pt1: "P"
            },
            msh12: {
                vid1: "2.4"
            }
        },
        qpd: {
            qpd1: {
                ce1: "IHE PDQ Query"
            },
            qpd2: messageControlId
        },
        msa: {
            msa1: "AA",
            msa2: messageControlId
        },
        qak: {
            qak1: "12345",
            qak2: "OK"
        },
        query_response: [
            {
                pid: {
                    pid1: "1",
                    pid3: [
                        {
                            cx1: <string>fhirPatient.id,
                            cx4: {
                                hd1: "Hospital",
                                hd2: "MR"
                            }
                        }
                    ],
                    pid5: [
                        {
                            xpn1: {fn1: familyName},
                            xpn2: givenName
                        }
                    ],
                    pid7: {
                        ts1: fhirPatient.birthDate.toString()
                    },
                    pid8: gender
                }
            }
        ]
    };

public isolated function getCurrentTimestamp() returns string {
    time:Utc currentTime = time:utcNow();
    return formatTimestamp(currentTime);
}

isolated function formatTimestamp(time:Utc timestamp) returns string {
    // Convert the UTC timestamp to a time:Civil record (this includes both date and time fields)
    time:Civil civil = time:utcToCivil(timestamp);

    // Extract the year, month, day, and time components
    string year = civil.year.toString();
    string month = civil.month < 10 ? "0" + civil.month.toString() : civil.month.toString();
    string day = civil.day < 10 ? "0" + civil.day.toString() : civil.day.toString();

    // Extract the time of day (hours, minutes, seconds)
    string hour = civil.hour < 10 ? "0" + civil.hour.toString() : civil.hour.toString();
    string minute = civil.minute < 10 ? "0" + civil.minute.toString() : civil.minute.toString();
    string second = <int>civil.second < 10 ? "0" : (<int>civil.second).toString();

    // Return the formatted timestamp as "YYYYMMDDHHMMSS"
    return year + month + day + hour + minute + second;
}
