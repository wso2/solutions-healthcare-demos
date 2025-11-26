import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;
import ballerina/time;
import ballerina/log;

// Map Senaite AnalysisRequest to FHIR ServiceRequest
public isolated function mapSenaiteAnalysisRequestToFHIRServiceRequest(SenaiteAnalysisRequest senaiteRequest, string medicalRecordNumber) returns international401:ServiceRequest|error {
    
    // Create base ServiceRequest with required fields
    international401:ServiceRequest serviceRequest = {
        resourceType: "ServiceRequest",
        id: senaiteRequest.uid,
        status: mapSenaiteStatusToFHIR(senaiteRequest.review_state),
        intent: "order",
        subject: {
            reference: string `Patient/${medicalRecordNumber}`,
            display: senaiteRequest.getPatientFullName
        },
        meta: {
            lastUpdated: check convertToFHIRDateTime(senaiteRequest.modified),
            versionId: "1"
        },
        identifier: [
            {
                system: "http://senaite.com/analysisrequest",
                value: senaiteRequest.id
            },
            {
                system: "http://senaite.com/analysisrequest-uid",
                value: senaiteRequest.uid
            }
        ]
    };

    // Add requester (client/organization)
    if senaiteRequest.getClientTitle != "" {
        serviceRequest.requester = {
            reference: string `Organization/${senaiteRequest.getClientUID}`,
            display: senaiteRequest.getClientTitle,
            identifier: {
                system: "http://senaite.com/client-id",
                value: senaiteRequest.getClientID
            }
        };
    }

    // Add code (sample type)
    serviceRequest.code = {
        text: senaiteRequest.getSampleTypeTitle,
        coding: [
            {
                system: "http://senaite.com/sample-type",
                code: senaiteRequest.getSampleTypeUID,
                display: senaiteRequest.getSampleTypeTitle
            }
        ]
    };

    // Add occurrence (sampling date)
    if senaiteRequest.getDateSampled is string {
        string dateString = <string>senaiteRequest.getDateSampled;
        if dateString != "" && dateString != "null" {
            serviceRequest.occurrenceDateTime = check convertToFHIRDateTime(dateString);
        }
    }

    // Add authoredOn (created date)
    serviceRequest.authoredOn = check convertToFHIRDateTime(senaiteRequest.created);

    // Add priority based on priority sort key
    if senaiteRequest.getPrioritySortkey is string {
        string priorityKey = <string>senaiteRequest.getPrioritySortkey;
        if priorityKey.startsWith("1") {
            serviceRequest.priority = "urgent";
        } else if priorityKey.startsWith("2") {
            serviceRequest.priority = "stat";
        } else {
            serviceRequest.priority = "routine";
        }
    }

    // Add notes/description
    if senaiteRequest.description is string && senaiteRequest.description != "" {
        json noteJson = {
            "text": senaiteRequest.description
        };
        r4:Annotation[] notes = <r4:Annotation[]>check [noteJson].cloneWithType();
        serviceRequest.note = notes;
    }

    // Add extension for additional Senaite-specific data
    json[] extensionsJson = [];
    
    // Add client order number if present
    if senaiteRequest.getClientOrderNumber is string && senaiteRequest.getClientOrderNumber != "" {
        extensionsJson.push({
            "url": "http://senaite.com/fhir/StructureDefinition/client-order-number",
            "valueString": senaiteRequest.getClientOrderNumber
        });
    }

    // Add client reference if present
    if senaiteRequest.getClientReference is string && senaiteRequest.getClientReference != "" {
        extensionsJson.push({
            "url": "http://senaite.com/fhir/StructureDefinition/client-reference",
            "valueString": senaiteRequest.getClientReference
        });
    }

    // Add sample point if present
    if senaiteRequest.getSamplePointTitle is string && senaiteRequest.getSamplePointTitle != "" {
        extensionsJson.push({
            "url": "http://senaite.com/fhir/StructureDefinition/sample-point",
            "valueString": senaiteRequest.getSamplePointTitle
        });
    }

    // Add province if present
    if senaiteRequest.getProvince is string && senaiteRequest.getProvince != "" {
        extensionsJson.push({
            "url": "http://senaite.com/fhir/StructureDefinition/province",
            "valueString": senaiteRequest.getProvince
        });
    }

    // Add district if present
    if senaiteRequest.getDistrict is string && senaiteRequest.getDistrict != "" {
        extensionsJson.push({
            "url": "http://senaite.com/fhir/StructureDefinition/district",
            "valueString": senaiteRequest.getDistrict
        });
    }

    // Add progress
    extensionsJson.push({
        "url": "http://senaite.com/fhir/StructureDefinition/progress",
        "valueInteger": senaiteRequest.getProgress
    });

    // Add hazardous flag
    if senaiteRequest.getHazardous {
        extensionsJson.push({
            "url": "http://senaite.com/fhir/StructureDefinition/hazardous",
            "valueBoolean": true
        });
    }

    // Add batch ID if present
    if senaiteRequest.getBatchID is string && senaiteRequest.getBatchID != "" {
        extensionsJson.push({
            "url": "http://senaite.com/fhir/StructureDefinition/batch-id",
            "valueString": senaiteRequest.getBatchID
        });
    }

    if extensionsJson.length() > 0 {
        r4:Extension[] extensions = <r4:Extension[]>check extensionsJson.cloneWithType();
        serviceRequest.'extension = extensions;
    }

    return serviceRequest;
}

// Map Senaite review state to FHIR ServiceRequest status
isolated function mapSenaiteStatusToFHIR(string senaiteStatus) returns international401:ServiceRequestStatus {
    match senaiteStatus {
        "sample_due" => {
            return "active";
        }
        "sample_received" => {
            return "active";
        }
        "to_be_verified" => {
            return "active";
        }
        "verified" => {
            return "completed";
        }
        "published" => {
            return "completed";
        }
        "cancelled" => {
            return "revoked";
        }
        "invalid" => {
            return "revoked";
        }
        _ => {
            return "unknown";
        }
    }
}

// Convert Senaite date string to FHIR dateTime
isolated function convertToFHIRDateTime(string dateString) returns string|error {
    if dateString == "" || dateString == "null" {
        return "";
    }
    
    // Senaite dates are in ISO 8601 format: "2025-10-14T14:50:43+00:00"
    // FHIR also uses ISO 8601, so we can return as-is after validation
    time:Utc|error utcTime = time:utcFromString(dateString);
    
    if utcTime is error {
        log:printWarn(string `Failed to parse date: ${dateString}`, utcTime);
        return dateString; // Return as-is if parsing fails
    }
    
    // Return the date string as-is (already in ISO 8601 format)
    return dateString;
}

// Map multiple Senaite AnalysisRequests to FHIR ServiceRequests
public isolated function mapSenaiteAnalysisRequestsToFHIRBundle(SenaiteAnalysisRequestResponse senaiteResponse, string medicalRecordNumber) returns r4:Bundle|error {
    r4:BundleEntry[] entries = [];
    
    foreach SenaiteAnalysisRequest senaiteRequest in senaiteResponse.items {
        international401:ServiceRequest|error serviceRequest = mapSenaiteAnalysisRequestToFHIRServiceRequest(senaiteRequest, medicalRecordNumber);
        
        if serviceRequest is international401:ServiceRequest {
            string resourceId = serviceRequest?.id ?: senaiteRequest.uid;
            entries.push({
                fullUrl: string `ServiceRequest/${resourceId}`,
                'resource: serviceRequest
            });
        } else {
            log:printError(string `Failed to map Senaite AnalysisRequest ${senaiteRequest.id}`, serviceRequest);
        }
    }
    
    r4:Bundle bundle = {
        resourceType: "Bundle",
        'type: "searchset",
        total: senaiteResponse.count,
        entry: entries
    };
    
    return bundle;
}

