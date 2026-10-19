import ballerina/http;
import ballerina/log;
import ballerina/task;
import ballerina/time;

// Reference lab simulator. The lab console in the demo portal lists the orders the integration placed
// and releases results on cue. The simulator keeps no state of its own: the lab FHIR server is the record.

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

    # Recent orders and whether they have been resulted.
    #
    # + return - the orders, newest first, or 502 if the lab FHIR server cannot be searched
    resource function get orders() returns LabOrder[]|http:BadGateway {
        LabOrder[]|error orders = recentOrders();
        if orders is error {
            log:printError("Could not list lab orders", orders);
            return <http:BadGateway>{body: <ErrorBody>{message: orders.message()}};
        }
        return orders;
    }

    # The patient has arrived and given a sample: files the specimen and notifies the integration.
    #
    # + id - the lab's ServiceRequest id
    # + return - what was filed, 409 if the specimen was already collected, or 502 if filing fails
    resource function post orders/[string id]/collect() returns CollectionResult|http:Conflict|http:BadGateway {
        CollectionResult|WrongOrderState|error result = collectSpecimen(id);
        if result is WrongOrderState {
            return <http:Conflict>{body: <ErrorBody>{message: result.message()}};
        }
        if result is error {
            log:printError("Could not collect the specimen", result, serviceRequestId = id);
            return <http:BadGateway>{body: <ErrorBody>{message: result.message()}};
        }
        return result;
    }

    # Runs the order: files results and notifies the integration.
    #
    # + id - the lab's ServiceRequest id
    # + return - what was filed, 409 if the order is already resulted or has no specimen yet, or 502 if filing fails
    resource function post orders/[string id]/release() returns ReleaseResult|http:Conflict|http:BadGateway {
        ReleaseResult|AlreadyResulted|WrongOrderState|error result = releaseOrder(id);
        if result is AlreadyResulted {
            return <http:Conflict>{body: <ErrorBody>{message: string `Order ${id} has already been resulted`}};
        }
        if result is WrongOrderState {
            return <http:Conflict>{body: <ErrorBody>{message: result.message()}};
        }
        if result is error {
            log:printError("Could not release lab order", result, serviceRequestId = id);
            return <http:BadGateway>{body: <ErrorBody>{message: result.message()}};
        }
        return result;
    }
}

# Releases every collected order once its specimen is `autoReleaseSeconds` old. Off by default so the
# presenter controls when results arrive.
isolated class AutoReleaseJob {
    *task:Job;

    # Releases the orders that are due. Failures are logged and retried on the next run.
    public isolated function execute() {
        LabOrder[]|error orders = recentOrders();
        if orders is error {
            log:printWarn("Auto-release could not list orders", orders);
            return;
        }
        foreach LabOrder labOrder in orders {
            string? collected = labOrder.collectedAt;
            if labOrder.status != "collected" || collected is () {
                continue;
            }
            time:Utc|error collectedAt = time:utcFromString(collected);
            if collectedAt is error || time:utcDiffSeconds(time:utcNow(), collectedAt) < <decimal>autoReleaseSeconds {
                continue;
            }
            ReleaseResult|AlreadyResulted|WrongOrderState|error released = releaseOrder(labOrder.id);
            if released is error {
                log:printWarn("Auto-release failed", released, serviceRequestId = labOrder.id);
            }
        }
    }
}
