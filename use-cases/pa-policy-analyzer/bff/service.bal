import ballerina/log;
import ballerina/http;
import ballerina/sql;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;
import ballerinax/health.clients.fhir as fhirClient;

listener http:Listener bff_listener = new (6091);

// TODO: Remove this when committing 
@http:ServiceConfig {
    cors: {
        allowOrigins: ["*"],
        allowHeaders: ["*"],
        allowMethods: ["*"],
        maxAge: 84900
    }
}
service /v1 on bff_listener {
    function init() returns error? {
        log:printInfo("Starting BFF Server");
        check initDb();
    }

    // ── Cerner EMR Integration ──────────────────────────────────────────────
    isolated resource function get patients() returns map<string>|error {
        do {
            // Cerner R4 requires at least one identifying search parameter — open Patient
            // searches return 400. Query the known sandbox patient IDs from PATIENTS.
            string idList;
            lock {
                idList = string:'join(",", ...PATIENTS.keys());
            }
            // Cerner rejects `_count` when `_id` is provided; the ID list bounds the result.
            map<string[]> searchParams = {"_id": [idList]};
            fhirClient:FHIRResponse fhirResponse = check fhirConnectorObj->search("Patient", searchParameters = searchParams);

            json bundleJson = check fhirResponse.'resource.ensureType();
            json entryJson = check bundleJson.entry;
            json[] entries = check entryJson.ensureType();

            map<string> patients = {};
            foreach json entry in entries {
                json resourceJson = check entry.'resource;
                international401:Patient patient = check resourceJson.cloneWithType(international401:Patient);
                string id = patient.id ?: "";
                if id == "" {
                    continue;
                }
                string given = "";
                string family = "";
                r4:HumanName[]? names = patient.name;
                if names is r4:HumanName[] && names.length() > 0 {
                    string[]? givenNames = names[0].given;
                    given = givenNames is string[] && givenNames.length() > 0 ? givenNames[0] : "";
                    family = names[0].family ?: "";
                }
                patients[id] = string `${given} ${family}`.trim();
            }
            return patients;
        } on fail error e {
            log:printError("Error fetching patients: " + e.message(), e, stackTrace = e.stackTrace(), detail = e.detail().toString());
            return error("Failed to retrieve patients");
        }
    }

    isolated resource function get patientById(http:Request req, string id) returns json|xml|error {
        // Retrieve a Patient resource by ID from Cerner EMR.
        do {
            log:printInfo("Fetching patient with ID: " + id + " from Cerner EMR.");
            fhirClient:FHIRResponse fhirResponse = check fhirConnectorObj->getById("Patient", id);
            return fhirResponse.'resource;
        } on fail {
            log:printError("Error fetching patient with ID: " + id);
            return error("Failed to retrieve patient with ID: " + id);
        }
    }

    isolated resource function get searchPatients(http:Request req) returns json|xml|error {
        // Search for patients by name and birthdate using query parameters.
        do {
            log:printInfo("Searching for patients with query parameters: " + req.getQueryParams().toString());
            var queryParams = req.getQueryParams();
            fhirClient:FHIRResponse fhirResponse = check fhirConnectorObj->search("Patient", searchParameters = queryParams);
            return fhirResponse.'resource;
        } on fail {
            log:printError("Error searching for patients with query parameters: " + req.getQueryParams().toString());
            return error("Failed to search for patients with query parameters: " + req.getQueryParams().toString());
        }
    }

    isolated resource function get patientSummary(http:Request req, string id) returns json|error {
        do {
            log:printInfo("Fetching patient summary for ID: " + id);
            fhirClient:FHIRResponse fhirResponse = check fhirConnectorObj->getById("Patient", id, summary = fhirClient:TRUE);
            return <json>fhirResponse.'resource;
        } on fail {
            log:printError("Error fetching patient summary for ID: " + id);
            return error("Failed to retrieve patient summary for ID: " + id);
        }
    }

    isolated resource function get documentProxy(http:Request req, string id) returns json|error {
        do {
            log:printInfo("Fetching Binary resource with ID: " + id);
            fhirClient:FHIRResponse fhirResponse = check fhirConnectorObj->getById("Binary", id);
            return <json>fhirResponse.'resource;
        } on fail error e {
            log:printError("Error fetching Binary resource with ID: " + id + " — " + e.message());
            return error("Failed to retrieve Binary resource with ID: " + id);
        }
    }

    isolated resource function get patientResources(http:Request req, string id, string resourceType) returns json|error {
        // Resources that use "subject" instead of "patient" in Cerner R4.
        // All others (Condition, AllergyIntolerance, MedicationRequest, etc.) use "patient".

        string searchParam = "patient";
        do {
            log:printInfo("Fetching " + resourceType + " for patient ID: " + id + " using param '" + searchParam + "'");
            map<string[]> searchParams = {};
            searchParams[searchParam] = [id];
            searchParams["_count"] = ["5"];
            fhirClient:FHIRResponse fhirResponse = check fhirConnectorObj->search(resourceType, searchParameters = searchParams);
            return <json>fhirResponse.'resource;
        } on fail error e {
            log:printError(e.toString());
            log:printError("Error fetching " + resourceType + " for patient ID: " + id + " — " + e.message());
            return error("Failed to retrieve " + resourceType + " for patient ID: " + id);
        }
    }

    // ── Payer Onboarding ──────────────────────────────────────────────────────

    isolated resource function post payer/onboard(http:Request req) returns json|http:Response|error {
        json|http:ClientError body = req.getJsonPayload();
        if body is http:ClientError {
            http:Response badReq = new;
            badReq.statusCode = 400;
            badReq.setJsonPayload({"error": "Invalid JSON body"});
            return badReq;
        }

        string payerName = (check body.payerName).toString();
        string serviceUrl = (check body.serviceUrl).toString();
        json apiKeyJson = check body.apiKey;
        string apiKey = apiKeyJson is string ? apiKeyJson : "";

        string jobId = check initiateOnboarding(payerName, serviceUrl, apiKey);
        log:printInfo("Onboarding job created: " + jobId);
        return {"jobId": jobId};
    }

    resource function post payer/[string payerId]/resync(http:Request req) returns json|http:Response|error {
        // Look up payer
        PayerRow|sql:Error payerResult = dbClient->queryRow(`
            SELECT id, name, status FROM payers WHERE id = ${payerId}
        `);
        if payerResult is sql:Error {
            http:Response notFound = new;
            notFound.statusCode = 404;
            notFound.setJsonPayload({"error": "Payer not found"});
            return notFound;
        }

        // Get the service URL from the most recent completed job for this payer
        record {| string serviceUrl; |}|sql:Error urlResult = dbClient->queryRow(`
            SELECT service_url as serviceUrl
            FROM   onboarding_jobs
            WHERE  payer_name = ${payerResult.name}
            ORDER  BY created_at DESC
            LIMIT  1
        `);
        if urlResult is sql:Error {
            http:Response badReq = new;
            badReq.statusCode = 400;
            badReq.setJsonPayload({"error": "No previous onboarding job found for this payer"});
            return badReq;
        }

        // Allow optional apiKey override from request body
        string apiKey = "";
        json|http:ClientError body = req.getJsonPayload();
        if body is json {
            json|error ak = body.apiKey;
            if ak is string {
                apiKey = ak;
            }
        }

        string jobId = check initiateOnboarding(payerResult.name, urlResult.serviceUrl, apiKey);
        log:printInfo("Re-sync job created for payer " + payerResult.name + ": " + jobId);
        return {"jobId": jobId};
    }

    resource function get payer/onboard/[string jobId]/status() returns json|http:Response|error {
        json|error result = getOnboardingStatus(jobId);
        if result is error {
            if result.message().startsWith("Job not found") {
                http:Response notFound = new;
                notFound.statusCode = 404;
                notFound.setJsonPayload({"error": result.message()});
                return notFound;
            }
            return result;
        }
        return result;
    }

    // ── Policy / Code lookup ────────────────────────────────────────────────
    resource function get payer/codes(string? 'type) returns json|error {
        PolicyCodeRow[] rows = check queryPolicyCodes('type);
        return rows.toJson();
    }

    resource function get payer/codes/[string code]/policy() returns json|http:Response|error {
        PolicyCodeRow|sql:NoRowsError|sql:Error codeResult = queryCodeByValue(code);
        if codeResult is sql:NoRowsError {
            return notFoundResponse("Code not found: " + code);
        }
        if codeResult is sql:Error {
            return internalErrorResponse("Failed to look up code: " + code);
        }

        string policyId = codeResult.policyId;

        PolicyDocRow|sql:Error policyResult = queryPolicyById(policyId);
        if policyResult is sql:Error {
            return internalErrorResponse("Failed to load policy: " + policyId);
        }

        CoverageClauseRow[] clauses = check queryClausesByPolicyId(policyId);
        PolicyCodeRow[] relatedCodes = check queryCodesByPolicyId(policyId);

        return {
            "code": codeResult.code,
            "codeType": codeResult.codeType,
            "description": codeResult.description,
            "policy": {
                "id": policyResult.id,
                "policyName": policyResult.policyName,
                "medicalRecordsRef": policyResult.medicalRecordsRef,
                "clauses": clauses.toJson(),
                "relatedCodes": relatedCodes.toJson()
            }
        };
    }

    resource function get payers() returns json|error {
        PayerRow[] rows = check queryActivePayers();
        json[] result = [];
        foreach PayerRow payer in rows {
            result.push({
                "id": payer.id,
                "name": payer.name,
                "policyCount": queryPayerPolicyCount(payer.name),
                "codeCount": queryPayerCodeCount(payer.name)
            });
        }
        return result;
    }

    resource function get payers/[string payerId]/codes(string? 'type) returns json|http:Response|error {
        PayerRow|sql:Error payerResult = queryPayerById(payerId);
        if payerResult is sql:NoRowsError {
            return notFoundResponse("Payer not found: " + payerId);
        }
        if payerResult is sql:Error {
            return internalErrorResponse("Failed to look up payer: " + payerId);
        }
        PolicyCodeRow[] rows = check queryCodesByPayerName(payerResult.name, 'type);
        return rows.toJson();
    }

    resource function get payers/[string payerId]/policies() returns json|http:Response|error {
        PayerRow|sql:Error payerResult = queryPayerById(payerId);
        if payerResult is sql:NoRowsError {
            return notFoundResponse("Payer not found: " + payerId);
        }
        if payerResult is sql:Error {
            return internalErrorResponse("Failed to look up payer: " + payerId);
        }
        PolicyDocRow[] policies = check queryPoliciesByPayerName(payerResult.name);
        return policies.toJson();
    }

    resource function get payer/policy/[string policyId]/clauses() returns json|error {
        CoverageClauseRow[] clauses = check queryClausesByPolicyId(policyId);
        return clauses.toJson();
    }

    // ── Evaluations ─────────────────────────────────────────────────────────
    resource function post evaluations(http:Request req) returns json|http:Response|error {
        json|http:ClientError body = req.getJsonPayload();
        if body is http:ClientError {
            http:Response badReq = new;
            badReq.statusCode = 400;
            badReq.setJsonPayload({"error": "Invalid JSON body"});
            return badReq;
        }

        string patientId = (check body.patientId).toString();
        string patientName = (check body.patientName).toString();
        string policyId = (check body.policyId).toString();
        string cptCode = (check body.cptCode).toString();
        string cptDescription = (check body.cptDescription).toString();
        string payer = (check body.payer).toString();

        string evalId = check startEvaluation(patientId, patientName, policyId, cptCode, cptDescription, payer);
        log:printInfo("Started evaluation: " + evalId);
        return {"id": evalId};
    }

    resource function get evaluations() returns json|error {
        EvaluationRow[] rows = check queryAllEvaluations();
        json[] result = [];
        foreach EvaluationRow ev in rows {
            result.push({
                "id": ev.id,
                "patient_id": ev.patientId,
                "patient_name": ev.patientName,
                "policy_id": ev.policyId,
                "cpt_code": ev.cptCode,
                "cpt_description": ev.cptDescription,
                "payer": ev.payer,
                "status": ev.status,
                "overall_reasoning": ev.overallReasoning,
                "reviewer": ev.reviewer,
                "timestamp": ev.createdAt,
                "gap_count": queryEvaluationGapCount(ev.id)
            });
        }
        return result;
    }

    resource function get evaluations/[string evalId]() returns json|http:Response|error {
        EvaluationRow|sql:NoRowsError|sql:Error evalResult = queryEvaluationById(evalId);
        if evalResult is sql:NoRowsError {
            return notFoundResponse("Evaluation not found: " + evalId);
        }
        if evalResult is sql:Error {
            return internalErrorResponse("Failed to load evaluation: " + evalId);
        }
        return check buildEvaluationDetailJson(evalResult);
    }

}
