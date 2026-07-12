import ballerina/io;
import ballerina/log;
import ballerina/sql;
import ballerina/http;
import ballerina/mime;
import ballerina/uuid;
import ballerina/lang.runtime;

isolated function initiateOnboarding(string payerName, string serviceUrl, string apiKey) returns string|error {
    string jobId = uuid:createType4AsString();
    // Ensure payer exists in payers table (upsert)
    string payerId = uuid:createType4AsString();
    _ = check dbClient->execute(`
        INSERT IGNORE INTO payers (id, name, status) VALUES (${payerId}, ${payerName}, 'active')
    `);
    _ = check dbClient->execute(`
        INSERT INTO onboarding_jobs (id, payer_name, service_url, step_index, status)
        VALUES (${jobId}, ${payerName}, ${serviceUrl}, 0, 'connecting')
    `);
    _ = start processOnboardingJob(jobId, apiKey);
    log:printInfo("Started onboarding job: " + jobId + " for payer: " + payerName);
    return jobId;
}

isolated function buildHeaders(string apiKey) returns map<string|string[]> {
    map<string|string[]> headers = {};
    if apiKey != "" {
        headers["X-API-Key"] = apiKey;
    }
    return headers;
}

isolated function processOnboardingJob(string jobId, string apiKey) {
    do {
        http:Client pdfClient = check new (MOCK_PDF_SERVICE_BASE);

        check connectToPdfService(jobId, pdfClient);
        check authenticateWithPdfService(jobId, apiKey, pdfClient);
        check scanAndRegisterPdfs(jobId, apiKey, pdfClient);

        PdfRow[] pdfRows = check loadPendingPdfRows(jobId);
        if pdfRows.length() == 0 {
            log:printInfo("[" + jobId + "] No new PDFs to process — all already synced");
            check dbUpdateJobStatus(jobId, "done", 2);
            return;
        }

        check fetchPdfs(jobId, apiKey, pdfClient, pdfRows);
        check convertAndStorePdfs(jobId, pdfRows);

        check dbUpdateJobStatus(jobId, "done", 2);
        log:printInfo("[" + jobId + "] Onboarding complete");

    } on fail error e {
        log:printError("[" + jobId + "] Processing failed: " + e.message());
        dbSetJobError(jobId, e.message());
    }
}

isolated function connectToPdfService(string jobId, http:Client pdfClient) returns error? {
    check dbUpdateJobStatus(jobId, "connecting", 0);
    log:printInfo("[" + jobId + "] Connecting to PDF service");
    http:Response pingResp = check pdfClient->get("/v1/ping");
    _ = pingResp;
    runtime:sleep(0.75d);
}

isolated function authenticateWithPdfService(string jobId, string apiKey, http:Client pdfClient) returns error? {
    check dbUpdateJobStatus(jobId, "authenticating", 1);
    log:printInfo("[" + jobId + "] Authenticating");
    http:Response authResp = check pdfClient->get("/v1/ping", buildHeaders(apiKey));
    if authResp.statusCode == 401 {
        return error("Authentication failed: invalid API key");
    }
    runtime:sleep(0.75d);
}

isolated function scanAndRegisterPdfs(string jobId, string apiKey, http:Client pdfClient) returns error? {
    check dbUpdateJobStatus(jobId, "scanning", 2);
    log:printInfo("[" + jobId + "] Scanning for PDFs");
    runtime:sleep(0.5d);

    http:Response listResp = check pdfClient->get("/v1/pdfs", buildHeaders(apiKey));
    if listResp.statusCode != 200 {
        json errPayload = check listResp.getJsonPayload();
        return error("PDF service list failed (" + listResp.statusCode.toString() + "): " + errPayload.toString());
    }
    json listPayload = check listResp.getJsonPayload();
    json[] pdfs = <json[]>check listPayload.pdfs;

    JobRow jobRow = check dbClient->queryRow(`
        SELECT id, payer_name as payerName, status, step_index as stepIndex, error_message as errorMessage
        FROM   onboarding_jobs WHERE id = ${jobId}
    `);
    string payerName = jobRow.payerName;

    map<boolean> alreadyProcessed = check loadAlreadyProcessedFilenames(jobId, payerName);

    foreach json pdf in pdfs {
        string filename = <string>check pdf.filename;
        int sizeBytes = <int>check pdf.sizeBytes;
        string pdfId = uuid:createType4AsString();
        boolean isSkipped = alreadyProcessed.hasKey(filename);
        string initialStatus = isSkipped ? "skipped" : "pending";
        _ = check dbClient->execute(`
            INSERT INTO onboarding_pdfs (id, job_id, filename, size_bytes, pdf_status)
            VALUES (${pdfId}, ${jobId}, ${filename}, ${sizeBytes}, ${initialStatus})
        `);
        log:printInfo("[" + jobId + "] Discovered: " + filename + (isSkipped ? " (skipped — already processed)" : ""));
        runtime:sleep(0.38d);
    }
    runtime:sleep(0.5d);
}

isolated function loadAlreadyProcessedFilenames(string jobId, string payerName) returns map<boolean>|error {
    stream<record {| string filename; |}, sql:Error?> existingStream = dbClient->query(`
        SELECT DISTINCT op.filename
        FROM   onboarding_pdfs op
        JOIN   onboarding_jobs oj ON op.job_id = oj.id
        WHERE  oj.payer_name = ${payerName}
        AND    oj.id != ${jobId}
        AND    op.pdf_status = 'done'
    `);
    map<boolean> alreadyProcessed = {};
    check from record {| string filename; |} row in existingStream
        do {
            alreadyProcessed[row.filename] = true;
        };
    return alreadyProcessed;
}

isolated function loadPendingPdfRows(string jobId) returns PdfRow[]|error {
    check dbUpdateJobStatus(jobId, "fetching", 2);
    log:printInfo("[" + jobId + "] Fetching PDFs");

    stream<PdfRow, sql:Error?> fetchStream = dbClient->query(`
        SELECT id, job_id as jobId, filename, size_bytes as sizeBytes,
               pdf_status as pdfStatus, local_path as localPath
        FROM   onboarding_pdfs
        WHERE  job_id = ${jobId}
        ORDER  BY created_at
    `);
    PdfRow[] allPdfRows = check from PdfRow row in fetchStream select row;
    return from PdfRow row in allPdfRows where row.pdfStatus != "skipped" select row;
}

isolated function fetchPdfs(string jobId, string apiKey, http:Client pdfClient, PdfRow[] pdfRows) returns error? {
    foreach PdfRow pdfRow in pdfRows {
        check dbUpdatePdfStatus(pdfRow.id, "downloading");

        http:Response dlResp = check pdfClient->get("/v1/pdfs/" + pdfRow.filename, buildHeaders(apiKey));
        if dlResp.statusCode != 200 {
            json errPayload = check dlResp.getJsonPayload();
            return error("PDF service download failed for " + pdfRow.filename + " (" + dlResp.statusCode.toString() + "): " + errPayload.toString());
        }
        byte[] pdfBytes = check dlResp.getBinaryPayload();

        string localPath = string `${STORE_PATH}/pdfs/${pdfRow.filename}`;
        check io:fileWriteBytes(localPath, pdfBytes);
        check dbUpdatePdfStatus(pdfRow.id, "downloaded");
        check dbSetPdfLocalPath(pdfRow.id, localPath);
        log:printInfo("[" + jobId + "] Downloaded: " + pdfRow.filename + " (" + pdfBytes.length().toString() + " bytes)");
    }
}

isolated function convertAndStorePdfs(string jobId, PdfRow[] pdfRows) returns error? {
    check dbUpdateJobStatus(jobId, "converting", 2);
    log:printInfo("[" + jobId + "] Converting PDFs to Markdown");

    http:Client converterClient = check new (CONVERTER_SERVICE_BASE, {httpVersion: "1.0"});

    foreach PdfRow pdfRow in pdfRows {
        check dbUpdatePdfStatus(pdfRow.id, "converting");
        check convertPdfToMarkdownAndStore(jobId, pdfRow, converterClient);
        check dbUpdatePdfStatus(pdfRow.id, "done");
    }
}

isolated function convertPdfToMarkdownAndStore(string jobId, PdfRow pdfRow, http:Client converterClient) returns error? {
    log:printInfo("Converting PDF: " + pdfRow.filename);

    mime:Entity filePart = new;
    filePart.setContentDisposition(
        mime:getContentDispositionObject("form-data; name=\"file\"; filename=" + pdfRow.filename)
    );
    filePart.setFileAsEntityBody(string `${STORE_PATH}/pdfs/${pdfRow.filename}`);
    http:Response convertResp = check converterClient->post("/convert", [filePart]);

    if convertResp.statusCode != 200 {
        json errPayload = check convertResp.getJsonPayload();
        return error("Conversion failed for " + pdfRow.filename + ": " + errPayload.toString());
    }

    json convertPayload = check convertResp.getJsonPayload();
    string markdown = <string>check convertPayload.markdown;
    string:RegExp regex = re `\.`;
    check io:fileWriteBytes(string `${STORE_PATH}/mds/${regex.split(pdfRow.filename)[0]}.md`, markdown.toBytes());
    log:printInfo("[" + jobId + "] Converted: " + pdfRow.filename + " → " + string `${STORE_PATH}/mds/${pdfRow.filename}.md`);

    check parseAndStorePolicy(jobId, pdfRow.id, pdfRow.filename, markdown);
}

function getOnboardingStatus(string jobId) returns json|error {
    JobRow|sql:Error jobResult = dbClient->queryRow(`
        SELECT id,
               payer_name    as payerName,
               status,
               step_index    as stepIndex,
               error_message as errorMessage
        FROM   onboarding_jobs
        WHERE  id = ${jobId}
    `);

    if jobResult is sql:NoRowsError {
        return error("Job not found: " + jobId);
    }
    if jobResult is sql:Error {
        return jobResult;
    }

    // Split into stream + query expression so the rowType typedesc is inferred correctly
    stream<PdfRow, sql:Error?> pdfStream = dbClient->query(`
        SELECT id, job_id as jobId, filename, size_bytes as sizeBytes,
               pdf_status as pdfStatus, local_path as localPath
        FROM   onboarding_pdfs
        WHERE  job_id = ${jobId}
        ORDER  BY created_at
    `);
    PdfRow[] pdfRows = check from PdfRow row in pdfStream select row;

    json[] pdfList = [];
    int skippedCount = 0;
    foreach PdfRow r in pdfRows {
        if r.pdfStatus == "skipped" {
            skippedCount += 1;
        }
        pdfList.push({
            "id": r.id,
            "filename": r.filename,
            "sizeBytes": r.sizeBytes,
            "pdfStatus": r.pdfStatus
        });
    }

    return {
        "jobId": jobResult.id,
        "payerName": jobResult.payerName,
        "status": jobResult.status,
        "stepIndex": jobResult.stepIndex,
        "pdfs": pdfList,
        "skippedCount": skippedCount,
        "errorMessage": jobResult.errorMessage
    };
}
