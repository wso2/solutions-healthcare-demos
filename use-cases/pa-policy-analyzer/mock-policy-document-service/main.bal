import ballerina/http;
import ballerina/log;

listener http:Listener pdfServiceListener = new (6092);

const string MOCK_API_KEY = "mock-api-key-12345";
const string PDF_FILENAME = "Sample_MRI_Medical_Policy.pdf";

// Public GitHub raw URL for the demo PDF. Swap to a gist raw URL if needed:
//   https://gist.githubusercontent.com/<user>/<gist_id>/raw/<filename>
const string PDF_SOURCE_HOST = "https://raw.githubusercontent.com";
const string PDF_SOURCE_PATH = "/joelsathi/solutions-healthcare-demos/pa-policy-analyzer/use-cases/pa-policy-analyzer/mock-policy-document-service/policies/Sample_MRI_Medical_Policy.pdf";

final http:Client pdfSourceClient = check new (PDF_SOURCE_HOST, {
    followRedirects: {enabled: true, maxCount: 5}
});

@http:ServiceConfig {
    cors: {
        allowOrigins: ["*"],
        allowHeaders: ["*"],
        maxAge: 84900
    }
}
service /v1 on pdfServiceListener {

    function init() {
        log:printInfo("Starting Mock PDF Service on port 6092");
    }

    // Health check — called by BFF to verify connectivity
    resource function get ping(http:Request req) returns json {
        log:printInfo("Health check ping received");
        return {"status": "ok", "service": "mock-pdf-service", "version": "1.0.0"};
    }

    // List available PDF policy documents
    resource function get pdfs(http:Request req) returns json|http:Response {
        string|http:HeaderNotFoundError apiKeyHeader = req.getHeader("X-API-Key");
        if apiKeyHeader is string && apiKeyHeader != "" && apiKeyHeader != MOCK_API_KEY {
            http:Response unauthorized = new;
            unauthorized.statusCode = 401;
            unauthorized.setJsonPayload({"error": "Invalid API key"});
            return unauthorized;
        }

        return {
            "pdfs": [
                {
                    "filename": PDF_FILENAME,
                    "downloadPath": "/v1/pdfs/" + PDF_FILENAME
                }
            ],
            "count": 1
        };
    }

    // Download a specific PDF by filename (proxied from GitHub)
    resource function get pdfs/[string filename](http:Request req) returns http:Response|error {
        string|http:HeaderNotFoundError apiKeyHeader = req.getHeader("X-API-Key");
        if apiKeyHeader is string && apiKeyHeader != "" && apiKeyHeader != MOCK_API_KEY {
            http:Response unauthorized = new;
            unauthorized.statusCode = 401;
            unauthorized.setJsonPayload({"error": "Invalid API key"});
            return unauthorized;
        }

        if filename != PDF_FILENAME {
            http:Response notFound = new;
            notFound.statusCode = 404;
            notFound.setJsonPayload({"error": "File not found: " + filename});
            return notFound;
        }

        log:printInfo("Fetching PDF from GitHub: " + PDF_SOURCE_HOST + PDF_SOURCE_PATH);
        http:Response|error upstream = pdfSourceClient->get(PDF_SOURCE_PATH);
        if upstream is error {
            return error("Failed to fetch PDF from GitHub: " + upstream.message());
        }
        if upstream.statusCode != 200 {
            return error("GitHub returned status " + upstream.statusCode.toString());
        }

        byte[]|error fileBytes = upstream.getBinaryPayload();
        if fileBytes is error {
            return error("Failed to read PDF bytes: " + fileBytes.message());
        }

        http:Response response = new;
        response.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"");
        response.setBinaryPayload(fileBytes, "application/pdf");
        return response;
    }
}
