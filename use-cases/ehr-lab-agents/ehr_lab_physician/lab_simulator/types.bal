# A test on an order, as the lab console shows it.
#
# + code - the lab's orderable test code, e.g. `LIPID-ADV`
# + name - the test's display name
type OrderedTest record {|
    string code;
    string name;
|};

# An order received from the integration, read from the lab's ServiceRequest.
#
# + id - the lab's ServiceRequest id
# + placerOrderId - the ordering clinic's order id, if it sent one
# + patientId - the lab's Patient id
# + patientName - the patient's display name, or the patient id when it cannot be read
# + mrn - the patient's medical record number, used to pick the demo result profile
# + tests - the tests ordered
# + authoredOn - when the order was placed
# + requester - the ordering practitioner's display name
# + status - `awaiting-patient` until the specimen is collected, `collected` while it is processed,
# `resulted` once the lab has filed a report
# + specimenId - the Specimen id once collected
# + collectedAt - when the specimen was collected
# + reportId - the DiagnosticReport id once the order is resulted
type LabOrder record {|
    string id;
    string? placerOrderId;
    string patientId;
    string patientName;
    string? mrn;
    OrderedTest[] tests;
    string? authoredOn;
    string? requester;
    "awaiting-patient"|"collected"|"resulted" status;
    string? specimenId;
    string? collectedAt;
    string? reportId;
|};

# What collecting a specimen produced.
#
# + serviceRequestId - the order
# + specimenId - the Specimen filed for it
# + collectedAt - when it was collected
# + integrationNotified - whether the integration accepted the "specimen collected" notification
type CollectionResult record {|
    string serviceRequestId;
    string specimenId;
    string collectedAt;
    boolean integrationNotified;
|};

# What releasing an order produced.
#
# + serviceRequestId - the order that was resulted
# + diagnosticReportId - the final report filed for it
# + observations - how many results were filed
# + integrationNotified - whether the integration accepted the "report ready" notification
type ReleaseResult record {|
    string serviceRequestId;
    string diagnosticReportId;
    int observations;
    boolean integrationNotified;
|};

# Liveness and configuration of the simulator.
#
# + status - always `ok` while the service is up
# + lab - the lab's display name
# + autoReleaseSeconds - the auto-release delay, or 0 when results are released by hand
type HealthStatus record {|
    "ok" status;
    string lab;
    int autoReleaseSeconds;
|};

# Body of an error response.
#
# + message - what went wrong
type ErrorBody record {|
    string message;
|};

# Raised when an order that already has results is released again.
type AlreadyResulted distinct error;

# Raised when an order is released before its specimen has been collected, or collected twice.
type WrongOrderState distinct error;
