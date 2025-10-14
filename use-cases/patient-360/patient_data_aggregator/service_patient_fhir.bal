import ballerina/http;
import ballerina/log;
import ballerinax/health.clients.fhir as fhirClient;
import ballerinax/health.fhirr4;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;
import ballerinax/health.fhir.r4.parser as parser;

// Initialize FHIR clients for different backend systems
final isolated map<fhirClient:FHIRConnector> backendClients = {};

// Initialize HTTP clients for non-FHIR backend systems
final isolated map<http:Client> httpClients = {};

function init() returns error? {
    // Initialize clients for each configured backend
    foreach string systemName in backendConfigs.keys() {
        BackendConfig backendConfig = backendConfigs.get(systemName);
        
        if backendConfig.backendType == FHIR {
            // Build FHIR client config with authentication
            fhirClient:FHIRConnectorConfig clientConfig = {
                baseURL: backendConfig.baseUrl,
                mimeType: fhirClient:FHIR_JSON
            };
            
            // Add authentication based on auth type
            match backendConfig.authType {
                BASIC => {
                    if backendConfig.username is string && backendConfig.password is string {
                        clientConfig.authConfig = {
                            username: <string>backendConfig.username,
                            password: <string>backendConfig.password
                        };
                    } else {
                        log:printError(string `Basic auth configured for ${systemName} but username or password is missing`);
                    }
                }
                OAUTH2_CLIENT_CREDENTIALS => {
                    if backendConfig.tokenUrl is string && backendConfig.clientId is string && backendConfig.clientSecret is string {
                        http:OAuth2ClientCredentialsGrantConfig oauth2Config = {
                            tokenUrl: <string>backendConfig.tokenUrl,
                            clientId: <string>backendConfig.clientId,
                            clientSecret: <string>backendConfig.clientSecret
                        };
                        
                        if backendConfig.scopes is string[] {
                            oauth2Config.scopes = <string[]>backendConfig.scopes;
                        }
                        
                        clientConfig.authConfig = oauth2Config;
                    } else {
                        log:printError(string `OAuth2 client credentials configured for ${systemName} but required fields are missing`);
                    }
                }
                NONE => {
                    // No authentication required
                }
            }

            fhirClient:FHIRConnector fhirConnector = check new (clientConfig);
            lock {
                backendClients[systemName] = fhirConnector;
            }
        } else if backendConfig.backendType == HTTP {
            // Build HTTP client config with authentication
            http:ClientConfiguration httpConfig = {};
            
            // Add authentication based on auth type
            match backendConfig.authType {
                BASIC => {
                    if backendConfig.username is string && backendConfig.password is string {
                        http:CredentialsConfig basicAuth = {
                            username: <string>backendConfig.username,
                            password: <string>backendConfig.password
                        };
                        httpConfig.auth = basicAuth;
                    } else {
                        log:printError(string `Basic auth configured for ${systemName} but username or password is missing`);
                    }
                }
                OAUTH2_CLIENT_CREDENTIALS => {
                    if backendConfig.tokenUrl is string && backendConfig.clientId is string && backendConfig.clientSecret is string {
                        http:OAuth2ClientCredentialsGrantConfig oauth2Config = {
                            tokenUrl: <string>backendConfig.tokenUrl,
                            clientId: <string>backendConfig.clientId,
                            clientSecret: <string>backendConfig.clientSecret
                        };
                        
                        if backendConfig.scopes is string[] {
                            oauth2Config.scopes = <string[]>backendConfig.scopes;
                        }
                        
                        httpConfig.auth = oauth2Config;
                    } else {
                        log:printError(string `OAuth2 client credentials configured for ${systemName} but required fields are missing`);
                    }
                }
                NONE => {
                    // No authentication required
                }
            }

            http:Client httpClient = check new (backendConfig.baseUrl, httpConfig);
            lock {
                httpClients[systemName] = httpClient;
            }
        }
    }
}

public type Patient international401:Patient;

service fhirr4:Service / on new fhirr4:Listener(config = patientApiConfig) {

    // Standard Patient resource operations
    isolated resource function get fhir/r4/Patient/[string id](r4:FHIRContext fhirContext) returns Patient|r4:OperationOutcome|r4:FHIRError {
        // Get patient from appropriate backend based on ID format or routing logic
        string sourceSystem = determineSourceSystem(id);
        lock {
            fhirClient:FHIRConnector? backendClient = backendClients[sourceSystem];

            if backendClient is () {
                return r4:createFHIRError(
                        message = "Backend system not found",
                        errServerity = r4:ERROR,
                        code = r4:PROCESSING_NOT_FOUND
                );
            }

            fhirClient:FHIRResponse|fhirClient:FHIRError response = backendClient->getById("Patient", id);

            if response is fhirClient:FHIRError {
                return r4:createFHIRError(
                        message = "Failed to retrieve patient",
                        errServerity = r4:ERROR,
                        code = r4:PROCESSING_NOT_FOUND
                );
            }

            json|xml resourceJson = response.'resource;
            if resourceJson is json {
                anydata|r4:FHIRParseError parsedResource = parser:parse(resourceJson, Patient);
                if parsedResource is r4:FHIRParseError {
                    return r4:createFHIRError(
                            message = "Failed to parse patient resource",
                            errServerity = r4:ERROR,
                            code = r4:PROCESSING
                    );
                }
                return <Patient>parsedResource.clone();
            }
            return r4:createFHIRError(
                    message = "Unsupported resource format",
                    errServerity = r4:ERROR,
                    code = r4:INVALID
            );
        }
    }

    // Patient search operation
    isolated resource function get fhir/r4/Patient(r4:FHIRContext fhirContext) returns r4:Bundle|r4:FHIRError {
        lock {
            map<r4:RequestSearchParameter[] & readonly> & readonly requestSearchParameters = fhirContext.getRequestSearchParameters();
            map<string[]> searchParams = {};
            //iterate through the search parameters and log them
            foreach var param in requestSearchParameters.keys() {
                //copy to a map<string[]> for easier handling
                r4:RequestSearchParameter[] & readonly requestParams = requestSearchParameters.get(param);
                //iterate through the array and convert to string[]
                string[] values = [];
                foreach r4:RequestSearchParameter rsp in requestParams {
                    values.push(rsp.value);
                }
                searchParams[param] = values;
            }

            // Default to first available backend for search
            string[] systemNames = backendConfigs.keys();
            if systemNames.length() == 0 {
                return r4:createFHIRError(
                        message = "No backend systems configured",
                        errServerity = r4:ERROR,
                        code = r4:PROCESSING
                );
            }

            string defaultSystem = systemNames[0];
            fhirClient:FHIRConnector? backendClient = backendClients[defaultSystem];

            if backendClient is () {
                return r4:createFHIRError(
                        message = "Backend client not available",
                        errServerity = r4:ERROR,
                        code = r4:PROCESSING
                );
            }

            fhirClient:FHIRResponse|fhirClient:FHIRError response = backendClient->search("Patient", searchParameters = searchParams);

            if response is fhirClient:FHIRError {
                return r4:createFHIRError(
                        message = "Failed to search patients",
                        errServerity = r4:ERROR,
                        code = r4:PROCESSING
                );
            }

            json|xml resourceJson = response.'resource;
            anydata|r4:FHIRParseError parsedResource = parser:parse(resourceJson, r4:Bundle);

            if parsedResource is r4:FHIRParseError {
                return r4:createFHIRError(
                        message = "Failed to parse search results",
                        errServerity = r4:ERROR,
                        code = r4:PROCESSING
                );
            }

            return <r4:Bundle>parsedResource.clone();
        }
    }

    isolated resource function post fhir/r4/Patient/[string id]/\$resolveids(r4:FHIRContext context,
            international401:Parameters parameters) returns r4:Bundle|r4:FHIRError {
        international401:Parameters|error parametersResult =  parameters.cloneWithType(international401:Parameters);
        if parametersResult is error {
            return r4:createFHIRError(
                    message = "Invalid Parameters resource",
                    errServerity = r4:ERROR,
                    code = r4:INVALID
            );
        }

        return performEverythingOperation(id, parametersResult);
    }
}

// Helper function to perform the $everything operation
isolated function performEverythingOperation(string patientId, international401:Parameters parameters) returns r4:Bundle|r4:FHIRError {
    r4:DomainResource[] aggregatedResources = [];

    // build CandidateInfo[] from parameters if provided
    CandidateInfo[] candidates = [];
    // if parameters is international401:Parameters {
        foreach international401:ParametersParameter param in <international401:ParametersParameter[]>parameters.clone().'parameter {
            if param.name == "candidate" && param.part is international401:ParametersParameter[] {
                foreach international401:ParametersParameter part in <international401:ParametersParameter[]>param.part {
                    if part.name == "candidateId" && part.valueString is string {
                        string candidateId = <string>part.valueString;
                        string sourceSystem = "default"; // Default system if not specified
                        // Check for sourceSystem part
                        foreach international401:ParametersParameter subPart in <international401:ParametersParameter[]>param.part {
                            if subPart.name == "sourceSystem" && subPart.valueString is string{
                                sourceSystem = <string>subPart.valueString;
                            }
                        }
                        candidates.push({candidateId: candidateId, sourceSystem: sourceSystem});
                    }
                }
            }
        }
    // }

    // Process each candidate from the resource parameter
    foreach CandidateInfo candidate in candidates {
        string sourceSystem = candidate.sourceSystem;
        string candidateId = candidate.candidateId;

        // Check if this is a FHIR backend or HTTP backend
        BackendConfig? backendConfig = backendConfigs[sourceSystem];
        
        if backendConfig is () {
            log:printWarn(string `Backend configuration not found for: ${sourceSystem}`);
            continue;
        }

        if backendConfig.backendType == FHIR {
            // Process FHIR backend
            fhirClient:FHIRConnector? backendClient;
            lock {
                backendClient = backendClients[sourceSystem];
            }

                if backendClient is () {
                    log:printWarn(string `FHIR backend client not found: ${sourceSystem}`);
                    continue;
                }

                // Get patient data from the specific backend
                fhirClient:FHIRResponse|fhirClient:FHIRError patientResponse = backendClient->getById("Patient", candidateId);
                if patientResponse is fhirClient:FHIRError {
                    log:printError(string `Failed to retrieve patient data for`, patientResponse);
                } else {
                    log:printInfo(string `Successfully retrieved patient data for ID:`, response = patientResponse);
                }
                if patientResponse is fhirClient:FHIRResponse {
                    json|xml patientJson = patientResponse.'resource;
                    anydata|r4:FHIRParseError parsedPatient = parser:parse(patientJson, international401:Patient);

                    if parsedPatient is international401:Patient {
                        aggregatedResources.push(parsedPatient);
                    }
                }

                // Get related resources for this patient
                string[] relatedResourceTypes = ["Observation", "Condition", "MedicationRequest", "Encounter", "DiagnosticReport"];

                foreach string resourceType in relatedResourceTypes {
                    map<string[]> searchParams = {
                        "patient": [candidateId]
                    };

                    fhirClient:FHIRResponse|fhirClient:FHIRError searchResponse = backendClient->search(resourceType, searchParameters = searchParams);

                    if searchResponse is fhirClient:FHIRResponse {
                        json|xml searchJson = searchResponse.'resource;
                        r4:Bundle|error parsedBundle = searchJson.cloneWithType(r4:Bundle);

                        if parsedBundle is r4:Bundle {
                            r4:BundleEntry[]? entries = parsedBundle.entry;
                            if entries is r4:BundleEntry[] {
                                foreach r4:BundleEntry entry in entries {
                                    anydata|r4:FHIRWireFormat entryResource = entry?.'resource;
                                    r4:DomainResource|error domainResource = entryResource.cloneWithType(r4:DomainResource);
                                    if domainResource is r4:DomainResource {
                                        aggregatedResources.push(domainResource);
                                    }
                                }
                            }
                        }
                    }
                }
        } else if backendConfig.backendType == HTTP {
            // Process HTTP backend (e.g., Senaite LIS)
            http:Client? httpClient;
            lock {
                httpClient = httpClients[sourceSystem];
            }

            if httpClient is () {
                log:printWarn(string `HTTP backend client not found: ${sourceSystem}`);
                continue;
            }

            // Check if this is a Senaite LIS backend
            if backendConfig?.lisType == SENAITE {
                // Fetch analysis requests from Senaite using medical record number
                SenaiteAnalysisRequestResponse|error senaiteResponse = fetchSenaiteAnalysisRequests(httpClient, candidateId);
                
                if senaiteResponse is SenaiteAnalysisRequestResponse {
                    log:printInfo(string `Successfully retrieved ${senaiteResponse.count} analysis requests from Senaite for MRN: ${candidateId}`);
                    
                    // Map Senaite analysis requests to FHIR ServiceRequest resources
                    foreach SenaiteAnalysisRequest analysisRequest in senaiteResponse.items {
                        international401:ServiceRequest|error serviceRequest = mapSenaiteAnalysisRequestToFHIRServiceRequest(analysisRequest, candidateId);
                        
                        if serviceRequest is international401:ServiceRequest {
                            aggregatedResources.push(serviceRequest);
                        } else {
                            log:printError(string `Failed to map Senaite analysis request ${analysisRequest.id}`, serviceRequest);
                        }
                    }
                } else {
                    log:printError(string `Failed to fetch Senaite analysis requests for MRN: ${candidateId}`, senaiteResponse);
                }
            }
        }
    }

    // Create and return the aggregated bundle
    if aggregatedResources.length() == 0 {
        return r4:createFHIRError(
                message = "No resources found for the given candidates",
                errServerity = r4:WARNING,
                code = r4:PROCESSING_NOT_FOUND
        );
    }

    r4:Bundle resultBundle = r4:createFhirBundle(r4:BUNDLE_TYPE_SEARCHSET, aggregatedResources);
    return resultBundle.clone();
}

// Helper function to determine source system based on ID format
isolated function determineSourceSystem(string id) returns string {
    // Simple logic to determine source system based on ID prefix or format
    if id.startsWith("sys1_") {
        return "system1";
    } else if id.startsWith("sys2_") {
        return "system2";
    }
    return "default";
}

// Helper function to get backend type
isolated function getBackendType(string systemName) returns BackendType? {
    BackendConfig? config = backendConfigs[systemName];
    if config is BackendConfig {
        return config.backendType;
    }
    return ();
}

// Helper function to fetch resource from HTTP backend by ID
isolated function fetchResourceFromHttpBackend(http:Client httpClient, string resourceType, string id) returns json|error {
    string path = string `/${resourceType}/${id}`;
    http:Response response = check httpClient->get(path);
    
    if response.statusCode == 200 {
        return check response.getJsonPayload();
    } else {
        return error(string `Failed to fetch resource: ${response.statusCode}`);
    }
}

// Helper function to search resources in HTTP backend
isolated function searchResourcesInHttpBackend(http:Client httpClient, string resourceType, map<string[]> searchParams) returns json|error {
    // Build query parameters
    string[] queryParams = [];
    foreach var [key, values] in searchParams.entries() {
        foreach string value in values {
            queryParams.push(string `${key}=${value}`);
        }
    }
    
    string queryString = queryParams.length() > 0 ? "?" + string:'join("&", ...queryParams) : "";
    string path = string `/${resourceType}${queryString}`;
    
    http:Response response = check httpClient->get(path);
    
    if response.statusCode == 200 {
        return check response.getJsonPayload();
    } else {
        return error(string `Failed to search resources: ${response.statusCode}`);
    }
}

// Helper function to fetch analysis requests from Senaite LIS
isolated function fetchSenaiteAnalysisRequests(http:Client httpClient, string medicalRecordNumber) returns SenaiteAnalysisRequestResponse|error {
    string path = string `/analysisrequest?getMedicalRecordNumberValue=${medicalRecordNumber}`;
    
    http:Response response = check httpClient->get(path);
    
    if response.statusCode == 200 {
        json responseJson = check response.getJsonPayload();
        SenaiteAnalysisRequestResponse senaiteResponse = check responseJson.cloneWithType(SenaiteAnalysisRequestResponse);
        return senaiteResponse;
    } else {
        return error(string `Failed to fetch Senaite analysis requests: HTTP ${response.statusCode}`);
    }
}
