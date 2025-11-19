import ballerina/http;
import ballerina/log;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4;

http:OAuth2ClientCredentialsGrantConfig ehrSystemAuthConfig = {
    tokenUrl: backendAuthTokenURL,
    clientId: backendClientId,
    clientSecret: backendClientSecret,
    scopes: scopes,
    optionalParams: {
        "resource": targetBackendUrl
    }
};

fhir:FHIRConnectorConfig ehrSystemConfig = {
    baseURL: targetBackendUrl,
    mimeType: fhir:FHIR_JSON,
    authConfig: ehrSystemAuthConfig
};

isolated final fhir:FHIRConnector fhirConnector = check new (ehrSystemConfig);

public isolated function extractBundleAndSendToFhirRepo(r4:Bundle bundle) returns boolean {

    r4:BundleEntry[] entries = <r4:BundleEntry[]>bundle.entry;
    foreach var entry in entries {
        map<anydata> fhirResource = <map<anydata>>entry?.'resource;
        int sendToFhirRepoResult = sendToFhirRepo(fhirResource.toJson());
        if sendToFhirRepoResult != 201 {
            log:printWarn(string `[${MAINTENANCE_REQUIRED}] Failed to send FHIR resource to the FHIR repository: ${fhirResource.toJsonString()}`);
        } else {
            log:printDebug(string `[${NORMAL}] FHIR resource sent to the FHIR repository: ${fhirResource.toJsonString()}`);
        }
    }
    return true;
}

public isolated function sendToFhirRepo(json fhirResource) returns int {

    fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnector->create(fhirResource);
    if fhirResponse is fhir:FHIRResponse {
        log:printInfo(string `FHIR response: ${fhirResponse.toString()}`);
        return fhirResponse.httpStatusCode;
    } else if fhirResponse is fhir:FHIRError {
        log:printError(string `FHIR error: ${fhirResponse.toString()}`);
        return http:INTERNAL_SERVER_ERROR.status.code;
    }
}

public isolated function searchInFhirRepo(string resourceType, string paramName, string paramValue) returns json|xml {

    map<string[]> searchParameters = {};
    searchParameters[paramName] = [paramValue];

    fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnector->search(resourceType, searchParameters, fhir:FHIR_JSON);
    if fhirResponse is fhir:FHIRResponse {
        log:printInfo(string `FHIR response: ${fhirResponse.toString()}`);
        return fhirResponse.'resource;
    } else if fhirResponse is fhir:FHIRError {
        log:printError(string `FHIR error: ${fhirResponse.toString()}`);
        return http:INTERNAL_SERVER_ERROR.status.code;
    }
}

public isolated function getById(string resourceType, string id) returns json|xml {

    fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnector->getById(resourceType, id, fhir:FHIR_JSON);
    if fhirResponse is fhir:FHIRResponse {
        log:printInfo(string `FHIR response: ${fhirResponse.toString()}`);
        return fhirResponse.'resource;
    } else if fhirResponse is fhir:FHIRError {
        log:printError(string `FHIR error: ${fhirResponse.toString()}`);
        return http:INTERNAL_SERVER_ERROR.status.code;
    }
}

public isolated function update(json fhirResource) returns int {

    fhir:FHIRResponse|fhir:FHIRError fhirResponse = fhirConnector->update(fhirResource, fhir:FHIR_JSON);
    if fhirResponse is fhir:FHIRResponse {
        log:printInfo(string `FHIR response: ${fhirResponse.toString()}`);
        return fhirResponse.httpStatusCode;
    } else if fhirResponse is fhir:FHIRError {
        log:printError(string `FHIR error: ${fhirResponse.toString()}`);
        return http:INTERNAL_SERVER_ERROR.status.code;
    }
}
