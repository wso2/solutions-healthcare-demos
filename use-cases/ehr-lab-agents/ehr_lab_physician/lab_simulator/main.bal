import ballerina/http;
import ballerina/log;
import ballerina/task;
import ballerina/time;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

// Reference lab simulator. The lab console in the demo portal lists the orders the integration placed
// and releases results on cue. The simulator keeps no state of its own: the lab FHIR server is the record,
// and the console API returns its FHIR resources (serialised with the FHIR library) as they are.

# Starts the auto-release job when `autoReleaseSeconds` is set; the HTTP service starts on its own.
#
# + return - an error if the job cannot be scheduled
public function main() returns error? {
    if autoReleaseSeconds > 0 {
        _ = check task:scheduleJobRecurByFrequency(new AutoReleaseJob(), 5);
        log:printInfo("Auto-release enabled", afterSeconds = autoReleaseSeconds);
    }
}

# The lab console API, used by the demo portal.
@http:ServiceConfig {
    cors: {allowOrigins: corsAllowOrigins, allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["Content-Type"]}
}
isolated service /lab on new http:Listener(port) {

    # Liveness check.
    #
    # + return - the simulator's status and configuration
    resource function get health() returns HealthStatus => {status: "ok", lab: labDisplayName, autoReleaseSeconds};

    # Recent orders, as FHIR: a `searchset` Bundle of ServiceRequests with each one's Patient, Specimen and
    # DiagnosticReport included.
    #
    # + return - the Bundle, or 502 if the lab FHIR server cannot be searched
    resource function get orders() returns json|http:BadGateway {
        json|error orders = fhirBundleOf(recentOrders());
        if orders is error {
            log:printError("Could not list lab orders", orders);
            return <http:BadGateway>{body: <ErrorBody>{message: orders.message()}};
        }
        return orders;
    }

    # The patient has arrived and given a sample: files the specimen and notifies the integration.
    #
    # + id - the lab's ServiceRequest id
    # + return - 201 with the Specimen (and `X-Integration-Notified`), 409 if the specimen was already collected,
    # or 502 if filing fails
    resource function post orders/[string id]/collect() returns http:Created|http:Conflict|http:BadGateway {
        [international401:Specimen, boolean]|WrongOrderState|error result = collectSpecimen(id);
        if result is WrongOrderState {
            return <http:Conflict>{body: <ErrorBody>{message: result.message()}};
        }
        json|error specimen = result is error ? result : fhirJson(result[0]);
        if result is error || specimen is error {
            error failure = result is error ? result : <error>specimen;
            log:printError("Could not collect the specimen", failure, serviceRequestId = id);
            return <http:BadGateway>{body: <ErrorBody>{message: failure.message()}};
        }
        return <http:Created>{body: specimen, mediaType: "application/fhir+json",
            headers: {"X-Integration-Notified": result[1].toString()}};
    }

    # Runs the order: files results and notifies the integration.
    #
    # + id - the lab's ServiceRequest id
    # + return - 201 with the final DiagnosticReport (and `X-Integration-Notified`), 409 if the order is already
    # resulted or has no specimen yet, or 502 if filing fails
    resource function post orders/[string id]/release() returns http:Created|http:Conflict|http:BadGateway {
        [international401:DiagnosticReport, boolean]|AlreadyResulted|WrongOrderState|error result = releaseOrder(id);
        if result is AlreadyResulted {
            return <http:Conflict>{body: <ErrorBody>{message: string `Order ${id} has already been resulted`}};
        }
        if result is WrongOrderState {
            return <http:Conflict>{body: <ErrorBody>{message: result.message()}};
        }
        json|error report = result is error ? result : fhirJson(result[0]);
        if result is error || report is error {
            error failure = result is error ? result : <error>report;
            log:printError("Could not release lab order", failure, serviceRequestId = id);
            return <http:BadGateway>{body: <ErrorBody>{message: failure.message()}};
        }
        return <http:Created>{body: report, mediaType: "application/fhir+json",
            headers: {"X-Integration-Notified": result[1].toString()}};
    }
}

isolated function fhirBundleOf(r4:Bundle|error bundle) returns json|error => bundle is error ? bundle : fhirJson(bundle);

# Releases every collected order once its specimen is `autoReleaseSeconds` old. Off by default so the
# presenter controls when results arrive.
isolated class AutoReleaseJob {
    *task:Job;

    # Releases the orders that are due. Failures are logged and retried on the next run.
    public isolated function execute() {
        r4:Bundle|error orders = recentOrders();
        if orders is error {
            log:printWarn("Auto-release could not list orders", orders);
            return;
        }
        international401:DiagnosticReport[] reports = from anydata r in resourcesOfType(orders, "DiagnosticReport")
            where r is international401:DiagnosticReport select r;
        foreach anydata candidate in resourcesOfType(orders, "ServiceRequest") {
            if candidate !is international401:ServiceRequest {
                continue;
            }
            international401:ServiceRequest labOrder = candidate;
            string id = labOrder.id ?: "";
            string? specimenId = specimenIdOf(labOrder);
            boolean resulted = labOrder.status == "completed"
                || (from international401:DiagnosticReport report in reports where basedOnContains(report, id) select report).length() > 0;
            string? collected = specimenId is string ? specimenCollectedAt(specimenId) : ();
            if resulted || collected is () {
                continue;
            }
            time:Utc|error collectedAt = time:utcFromString(collected);
            if collectedAt is error || time:utcDiffSeconds(time:utcNow(), collectedAt) < <decimal>autoReleaseSeconds {
                continue;
            }
            [international401:DiagnosticReport, boolean]|AlreadyResulted|WrongOrderState|error released = releaseOrder(id);
            if released is error {
                log:printWarn("Auto-release failed", released, serviceRequestId = id);
            }
        }
    }
}
