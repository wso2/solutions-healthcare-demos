import ballerina/http;
import ballerina/log;

// Mock Senaite API Service
// This service mimics the Senaite LIS API for testing purposes
// Run this service separately on port 8080
// Access at: http://localhost:8080/senaite/api/senaite/v1/analysisrequest
// Note: This uses /api instead of /@@API due to Ballerina path constraints
// Update the Config.toml baseUrl to: http://localhost:8080/senaite/api/senaite/v1

listener http:Listener senaiteListener = new (8090);

service /senaite/api/senaite/v1 on senaiteListener {

    // Mock endpoint for analysis request search
    resource function get analysisrequest(string? getMedicalRecordNumberValue) returns json|http:NotFound {
        
        if getMedicalRecordNumberValue is () {
            log:printInfo("Query parameter 'getMedicalRecordNumberValue' is missing");
            return http:NOT_FOUND;
        }

        log:printInfo(string `Received request for medical record number: ${getMedicalRecordNumberValue}`);

        // Return mock data based on medical record number
        if getMedicalRecordNumberValue == "12345" {
            return getMockAnalysisRequestsFor12345();
        } else if getMedicalRecordNumberValue == "67890" {
            return getMockAnalysisRequestsFor67890();
        } else {
            // Return empty result for unknown medical record numbers
            return {
                "count": 0,
                "pagesize": 25,
                "items": [],
                "page": 1,
                "_runtime": 0.01,
                "next": null,
                "pages": 1,
                "previous": null
            };
        }
    }
}

// Mock data for medical record number 12345
function getMockAnalysisRequestsFor12345() returns json {
    return {
        "count": 2,
        "pagesize": 25,
        "items": [
            {
                "getSampleTypeUID": "bfebf285e4bc4fdb8430fa6fe101c5e2",
                "uid": "d948516ff75c4627bc2a89574f09f7d0",
                "getDistrict": "",
                "getInvoiceExclude": false,
                "getPrioritySortkey": "3.2025-10-14T14:50:43+00:00",
                "getDueDate": null,
                "getMedicalRecordNumberValue": "12345",
                "getClientURL": "/senaite/clients/client-2",
                "getPrinted": "0",
                "url": "http://localhost:8080/senaite/clients/client-2/HA1c-0001",
                "id": "HA1c-0001",
                "getSamplingDate": null,
                "parent_id": "client-2",
                "getInternalUse": false,
                "state_title": null,
                "api_url": "http://localhost:8080/senaite/@@API/senaite/v1/analysisrequest/d948516ff75c4627bc2a89574f09f7d0",
                "getClientTitle": "GraceMemo Hospital",
                "getSamplePointTitle": "",
                "getPatientFullName": "John Doe",
                "parent_uid": "1f1676d7a85946dda48956001bf8d6ee",
                "getStorageLocationUID": "",
                "getClientReference": "",
                "getDescendantsUIDs": [],
                "author": "admin",
                "getProvince": "California",
                "getAnalysesNum": [0, 0, 0, 0],
                "getClientID": "212313241342",
                "review_state": "sample_due",
                "getHazardous": false,
                "assigned_state": "not_applicable",
                "getDateReceived": null,
                "getDateSampled": "2025-10-14T10:20:00+00:00",
                "description": "HA1c-0001 GraceMemo Hospital",
                "getDatePublished": null,
                "getStorageLocationTitle": "",
                "portal_type": "AnalysisRequest",
                "getClientOrderNumber": "",
                "getTemplateTitle": "",
                "parent_url": "http://localhost:8080/senaite/@@API/senaite/v1/client/1f1676d7a85946dda48956001bf8d6ee",
                "allowedRolesAndUsers": [
                    "LabManager",
                    "Publisher",
                    "Preserver",
                    "SamplingCoordinator",
                    "Verifier",
                    "Manager",
                    "LabClerk",
                    "Sampler",
                    "user:admin",
                    "user:212313241342",
                    "Analyst",
                    "RegulatoryInspector"
                ],
                "getTemplateURL": "",
                "getBatchURL": "",
                "getProgress": 0,
                "getBatchID": "",
                "path": "/senaite/clients/client-2/HA1c-0001",
                "getContactUID": "6a79803bdbbf4a49ac6b0c02664c0259",
                "getSamplingWorkflowEnabled": false,
                "tags": [],
                "getClientUID": "1f1676d7a85946dda48956001bf8d6ee",
                "parent_path": "/senaite/clients/client-2",
                "effective": "1969-12-31T00:00:00+00:00",
                "created": "2025-10-14T14:50:43+00:00",
                "getRawParentAnalysisRequest": "",
                "getPhysicalPath": ["", "senaite", "clients", "client-2", "HA1c-0001"],
                "getDateVerified": null,
                "modified": "2025-10-13T09:52:36+00:00",
                "getSampler": "",
                "getBatchUID": null,
                "getSampleTypeTitle": "HbA1c",
                "getSamplingDeviationTitle": "",
                "title": "HA1c-0001",
                "getTemplateUID": "",
                "getClientSampleID": "",
                "getProfilesTitleStr": "",
                "isMedicalRecordTemporary": false
            },
            {
                "getSampleTypeUID": "bfebf285e4bc4fdb8430fa6fe101c5e2",
                "uid": "d0b8285e6df840b2a8523bc8c27d10e9",
                "getDistrict": "",
                "getInvoiceExclude": false,
                "getPrioritySortkey": "3.2025-10-14T14:53:24+00:00",
                "getDueDate": null,
                "getMedicalRecordNumberValue": "12345",
                "getClientURL": "/senaite/clients/client-3",
                "getPrinted": "0",
                "url": "http://localhost:8080/senaite/clients/client-3/LP-0001",
                "id": "LP-0001",
                "getSamplingDate": null,
                "parent_id": "client-3",
                "getInternalUse": false,
                "state_title": null,
                "api_url": "http://localhost:8080/senaite/@@API/senaite/v1/analysisrequest/d0b8285e6df840b2a8523bc8c27d10e9",
                "getClientTitle": "GraceMemo Hospital",
                "getSamplePointTitle": "",
                "getPatientFullName": "John Doe",
                "parent_uid": "01731f87ed794de38b58b0805b0501f1",
                "getStorageLocationUID": "",
                "getClientReference": "",
                "getDescendantsUIDs": [],
                "author": "admin",
                "getProvince": "Colorado",
                "getAnalysesNum": [0, 0, 0, 0],
                "getClientID": "2355266121",
                "review_state": "sample_due",
                "getHazardous": false,
                "assigned_state": "not_applicable",
                "getDateReceived": null,
                "getDateSampled": "2025-10-14T12:20:00+00:00",
                "description": "LP-0001 GraceMemo Hospital",
                "getDatePublished": null,
                "getStorageLocationTitle": "",
                "portal_type": "AnalysisRequest",
                "getClientOrderNumber": "",
                "getTemplateTitle": "",
                "parent_url": "http://localhost:8080/senaite/@@API/senaite/v1/client/01731f87ed794de38b58b0805b0501f1",
                "allowedRolesAndUsers": [
                    "LabManager",
                    "Publisher",
                    "Preserver",
                    "SamplingCoordinator",
                    "Verifier",
                    "Manager",
                    "LabClerk",
                    "user:2355266121",
                    "Sampler",
                    "user:admin",
                    "Analyst",
                    "RegulatoryInspector"
                ],
                "getTemplateURL": "",
                "getBatchURL": "",
                "getProgress": 0,
                "getBatchID": "",
                "path": "/senaite/clients/client-3/LP-0001",
                "getContactUID": "6000d7d9ae58472a80fd13d4fd78c1d8",
                "getSamplingWorkflowEnabled": false,
                "tags": [],
                "getClientUID": "01731f87ed794de38b58b0805b0501f1",
                "parent_path": "/senaite/clients/client-3",
                "effective": "1969-12-31T00:00:00+00:00",
                "created": "2025-10-14T14:53:24+00:00",
                "getRawParentAnalysisRequest": "",
                "getPhysicalPath": ["", "senaite", "clients", "client-3", "LP-0001"],
                "getDateVerified": null,
                "modified": "2025-10-13T09:52:36+00:00",
                "getSampler": "",
                "getBatchUID": null,
                "getSampleTypeTitle": "Lipid Panel - Serum Plasma",
                "getSamplingDeviationTitle": "",
                "title": "LP-0001",
                "getTemplateUID": "",
                "getClientSampleID": "",
                "getProfilesTitleStr": "",
                "isMedicalRecordTemporary": false
            }
        ],
        "page": 1,
        "_runtime": 0.05229806900024414,
        "next": null,
        "pages": 1,
        "previous": null
    };
}

// Mock data for medical record number 67890
function getMockAnalysisRequestsFor67890() returns json {
    return {
        "count": 1,
        "pagesize": 25,
        "items": [
            {
                "getSampleTypeUID": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
                "uid": "e1f2a3b4c5d6e7f8g9h0i1j2k3l4m5n6",
                "getDistrict": "District A",
                "getInvoiceExclude": false,
                "getPrioritySortkey": "2.2025-10-15T08:30:00+00:00",
                "getDueDate": "2025-10-16T17:00:00+00:00",
                "getMedicalRecordNumberValue": "67890",
                "getClientURL": "/senaite/clients/client-5",
                "getPrinted": "0",
                "url": "http://localhost:8080/senaite/clients/client-5/CBC-0001",
                "id": "CBC-0001",
                "getSamplingDate": "2025-10-15T08:00:00+00:00",
                "parent_id": "client-5",
                "getInternalUse": false,
                "state_title": "Sample Received",
                "api_url": "http://localhost:8080/senaite/@@API/senaite/v1/analysisrequest/e1f2a3b4c5d6e7f8g9h0i1j2k3l4m5n6",
                "getClientTitle": "City Medical Center",
                "getSamplePointTitle": "Lab Room 3",
                "getPatientFullName": "Jane Smith",
                "parent_uid": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
                "getStorageLocationUID": "storage-001",
                "getClientReference": "REF-67890-001",
                "getDescendantsUIDs": [],
                "author": "labtech1",
                "getProvince": "New York",
                "getAnalysesNum": [3, 0, 0, 0],
                "getClientID": "CMC-12345",
                "review_state": "sample_received",
                "getHazardous": false,
                "assigned_state": "assigned",
                "getDateReceived": "2025-10-15T09:00:00+00:00",
                "getDateSampled": "2025-10-15T08:00:00+00:00",
                "description": "CBC-0001 Complete Blood Count",
                "getDatePublished": null,
                "getStorageLocationTitle": "Refrigerator A",
                "portal_type": "AnalysisRequest",
                "getClientOrderNumber": "ORD-2025-0156",
                "getTemplateTitle": "CBC Template",
                "parent_url": "http://localhost:8080/senaite/@@API/senaite/v1/client/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
                "allowedRolesAndUsers": [
                    "LabManager",
                    "Publisher",
                    "Analyst",
                    "user:labtech1"
                ],
                "getTemplateURL": "/senaite/templates/cbc-template",
                "getBatchURL": "/senaite/batches/batch-2025-10-15",
                "getProgress": 25,
                "getBatchID": "BATCH-2025-10-15-001",
                "path": "/senaite/clients/client-5/CBC-0001",
                "getContactUID": "contact-city-medical",
                "getSamplingWorkflowEnabled": true,
                "tags": ["urgent", "priority"],
                "getClientUID": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
                "parent_path": "/senaite/clients/client-5",
                "effective": "2025-10-15T08:30:00+00:00",
                "created": "2025-10-15T08:30:00+00:00",
                "getRawParentAnalysisRequest": "",
                "getPhysicalPath": ["", "senaite", "clients", "client-5", "CBC-0001"],
                "getDateVerified": null,
                "modified": "2025-10-15T09:15:00+00:00",
                "getSampler": "Dr. Martinez",
                "getBatchUID": "batch-uid-2025-10-15-001",
                "getSampleTypeTitle": "Blood",
                "getSamplingDeviationTitle": "",
                "title": "CBC-0001",
                "getTemplateUID": "template-cbc-001",
                "getClientSampleID": "SAMPLE-67890-001",
                "getProfilesTitleStr": "Complete Blood Count",
                "isMedicalRecordTemporary": false
            }
        ],
        "page": 1,
        "_runtime": 0.03456789012345678,
        "next": null,
        "pages": 1,
        "previous": null
    };
}

