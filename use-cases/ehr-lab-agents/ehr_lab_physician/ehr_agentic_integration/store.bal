import ballerina/log;
import ballerina/sql;

// The assessment read model. Temporal is the source of truth for *where the workflow is*; this is a
// projection of it that the portal can query cheaply: one row per assessment with each step's output
// in `data`, and an append-only timeline of every system interaction.
//
// Only activities and the API write here — never the workflow function itself, which must stay
// deterministic for Temporal replay.

// Created from a module-level initializer rather than a module `init()` function: in ballerina/ai
// 1.16.0, declaring `init()` stops the ai compiler plugin from initialising module-level agents
// ("uninitialized variable 'diagnosticCopilot'").
final boolean readModelReady = check createReadModelSchema();

isolated function createReadModelSchema() returns boolean|error {
    _ = check db->execute(`
        CREATE TABLE IF NOT EXISTS assessment (
            id                       TEXT PRIMARY KEY,
            ehr                      TEXT NOT NULL,
            patient_id               TEXT NOT NULL,
            patient_name             TEXT NOT NULL,
            practitioner_id          TEXT NOT NULL,
            stage                    TEXT NOT NULL,
            error                    TEXT,
            ehr_encounter_id         TEXT,
            lab_service_request_id   TEXT,
            data                     JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
    _ = check db->execute(`CREATE INDEX IF NOT EXISTS assessment_lab_order ON assessment (lab_service_request_id)`);
    _ = check db->execute(`CREATE INDEX IF NOT EXISTS assessment_patient ON assessment (ehr, patient_id)`);
    _ = check db->execute(`
        CREATE TABLE IF NOT EXISTS assessment_event (
            id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            assessment_id  TEXT NOT NULL REFERENCES assessment(id) ON DELETE CASCADE,
            occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            actor          TEXT NOT NULL,
            title          TEXT NOT NULL,
            detail         TEXT,
            status         TEXT NOT NULL DEFAULT 'ok'
        )`);
    _ = check db->execute(`
        CREATE TABLE IF NOT EXISTS longevity_record (
            ehr            TEXT NOT NULL,
            patient_id     TEXT NOT NULL,
            assessment_id  TEXT NOT NULL,
            record         JSONB NOT NULL,
            published_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (ehr, patient_id)
        )`);
    return true;
}

# One assessment in the read model.
#
# + id - the assessment id, also the workflow id
# + ehr - the patient's EHR
# + patientId - the patient's id in that EHR
# + patientName - the patient's name when the assessment started
# + practitionerId - the physician
# + stage - where it is
# + error - why it stopped, if it failed
# + ehrEncounterId - the visit's Encounter in the EHR
# + labServiceRequestId - the lab's order
# + data - each step's output, as a JSON string (`data` column); parsed by the API
# + createdAt - when it started
# + updatedAt - when it last changed
type AssessmentRow record {|
    string id;
    string ehr;
    string patientId;
    string patientName;
    string practitionerId;
    string stage;
    string? 'error;
    string? ehrEncounterId;
    string? labServiceRequestId;
    string data;
    string createdAt;
    string updatedAt;
|};

# One entry of the integration timeline.
#
# + id - sequence number
# + occurredAt - when
# + actor - who: physician, patient, workflow, agent, ehr, lab or operations
# + title - what happened
# + detail - more about it
# + status - `ok` or `error`
type TimelineEvent record {|
    int id;
    string occurredAt;
    string actor;
    string title;
    string? detail;
    string status;
|};

isolated function insertAssessment(string id, string ehr, string patientId, string patientName, string practitionerId)
        returns error? {
    _ = check db->execute(`
        INSERT INTO assessment (id, ehr, patient_id, patient_name, practitioner_id, stage)
        VALUES (${id}, ${ehr}, ${patientId}, ${patientName}, ${practitionerId}, ${STARTING})`);
}

isolated function setStage(string id, Stage stage) returns error? {
    _ = check db->execute(`UPDATE assessment SET stage = ${stage}, updated_at = now() WHERE id = ${id}`);
}

# Stores one step's output under `data.<key>`, optionally moving the stage in the same write.
#
# + id - the assessment id
# + key - the `data` key to write
# + value - the step's output
# + stage - the stage to move to, or nil to leave it unchanged
# + return - an error if the database update fails
isolated function putData(string id, string key, json value, Stage? stage = ()) returns error? {
    string payload = value.toJsonString();
    if stage is Stage {
        _ = check db->execute(`
            UPDATE assessment SET data = jsonb_set(data, ARRAY[${key}], ${payload}::jsonb, true),
                stage = ${stage}, updated_at = now()
            WHERE id = ${id}`);
        return;
    }
    _ = check db->execute(`
        UPDATE assessment SET data = jsonb_set(data, ARRAY[${key}], ${payload}::jsonb, true), updated_at = now()
        WHERE id = ${id}`);
}

isolated function setEncounter(string id, string encounterId) returns error? {
    _ = check db->execute(`UPDATE assessment SET ehr_encounter_id = ${encounterId}, updated_at = now() WHERE id = ${id}`);
}

isolated function setLabOrder(string id, string labServiceRequestId) returns error? {
    _ = check db->execute(`
        UPDATE assessment SET lab_service_request_id = ${labServiceRequestId}, updated_at = now() WHERE id = ${id}`);
}

isolated function markFailed(string id, string message) returns error? {
    _ = check db->execute(`
        UPDATE assessment SET stage = ${FAILED}, error = ${message}, updated_at = now() WHERE id = ${id}`);
}

# Appends to the integration timeline. A failed write is logged, never raised: the timeline is for
# people watching the demo, and must not fail the step it describes.
#
# + id - the assessment id
# + actor - who did it
# + title - short event title
# + detail - optional detail shown under the title
# + status - `ok`, or `error` for a failure
isolated function addEvent(string id, Actor actor, string title, string? detail = (), string status = "ok") {
    sql:ExecutionResult|sql:Error result = db->execute(`
        INSERT INTO assessment_event (assessment_id, actor, title, detail, status)
        VALUES (${id}, ${actor}, ${title}, ${detail}, ${status})`);
    if result is sql:Error {
        log:printWarn("Failed to record a timeline event", result, assessmentId = id, title = title);
    }
}

isolated function getAssessment(string id) returns AssessmentRow?|error {
    AssessmentRow|sql:Error row = db->queryRow(`
        SELECT id, ehr, patient_id AS "patientId", patient_name AS "patientName", practitioner_id AS "practitionerId",
               stage, error, ehr_encounter_id AS "ehrEncounterId", lab_service_request_id AS "labServiceRequestId",
               data::text AS data, created_at::text AS "createdAt", updated_at::text AS "updatedAt"
        FROM assessment WHERE id = ${id}`);
    if row is sql:NoRowsError {
        return ();
    }
    return row;
}

# Assessments, newest first, optionally for one patient.
#
# + ehr - only this EHR's patients, or nil for all
# + patientId - only this patient, or nil for all
# + 'limit - most rows to return
# + return - the assessments (without their `data`), or an error if the query fails
isolated function listAssessments(string? ehr = (), string? patientId = (), int 'limit = 100) returns AssessmentRow[]|error {
    stream<AssessmentRow, sql:Error?> rows = db->query(`
        SELECT id, ehr, patient_id AS "patientId", patient_name AS "patientName", practitioner_id AS "practitionerId",
               stage, error, ehr_encounter_id AS "ehrEncounterId", lab_service_request_id AS "labServiceRequestId",
               jsonb_build_object('labOrder', data->'labOrder', 'analysis', jsonb_build_object('headline', data->'analysis'->'headline'))::text AS data,
               created_at::text AS "createdAt", updated_at::text AS "updatedAt"
        FROM assessment
        WHERE (${ehr}::text IS NULL OR ehr = ${ehr}) AND (${patientId}::text IS NULL OR patient_id = ${patientId})
        ORDER BY created_at DESC LIMIT ${'limit}`);
    return from AssessmentRow row in rows select row;
}

isolated function getTimeline(string id) returns TimelineEvent[]|error {
    stream<TimelineEvent, sql:Error?> rows = db->query(`
        SELECT id, occurred_at::text AS "occurredAt", actor, title, detail, status
        FROM assessment_event WHERE assessment_id = ${id} ORDER BY id`);
    return from TimelineEvent event in rows select event;
}

isolated function findAssessmentByLabOrder(string labServiceRequestId) returns AssessmentRow?|error {
    record {|string id;|}|sql:Error row = db->queryRow(`
        SELECT id FROM assessment WHERE lab_service_request_id = ${labServiceRequestId}
        ORDER BY created_at DESC LIMIT 1`);
    if row is sql:NoRowsError {
        return ();
    }
    if row is sql:Error {
        return row;
    }
    return getAssessment(row.id);
}

isolated function assessmentsInStage(Stage stage) returns AssessmentRow[]|error {
    stream<AssessmentRow, sql:Error?> rows = db->query(`
        SELECT id, ehr, patient_id AS "patientId", patient_name AS "patientName", practitioner_id AS "practitionerId",
               stage, error, ehr_encounter_id AS "ehrEncounterId", lab_service_request_id AS "labServiceRequestId",
               '{}' AS data, created_at::text AS "createdAt", updated_at::text AS "updatedAt"
        FROM assessment WHERE stage = ${stage}`);
    return from AssessmentRow row in rows select row;
}

isolated function upsertLongevityRecord(string ehr, string patientId, string assessmentId, json longevityRecord)
        returns error? {
    string payload = longevityRecord.toJsonString();
    _ = check db->execute(`
        INSERT INTO longevity_record (ehr, patient_id, assessment_id, record, published_at)
        VALUES (${ehr}, ${patientId}, ${assessmentId}, ${payload}::jsonb, now())
        ON CONFLICT (ehr, patient_id) DO UPDATE
            SET assessment_id = EXCLUDED.assessment_id, record = EXCLUDED.record, published_at = now()`);
}

isolated function getLongevityRecord(string ehr, string patientId) returns json?|error {
    record {|string recordJson;|}|sql:Error row = db->queryRow(`
        SELECT record::text AS "recordJson" FROM longevity_record WHERE ehr = ${ehr} AND patient_id = ${patientId}`);
    if row is sql:NoRowsError {
        return ();
    }
    if row is sql:Error {
        return row;
    }
    return row.recordJson.fromJsonString();
}

isolated function listLongevityRecordPatients() returns record {|string ehr; string patientId; string publishedAt;|}[]|error {
    stream<record {|string ehr; string patientId; string publishedAt;|}, sql:Error?> rows = db->query(`
        SELECT ehr, patient_id AS "patientId", published_at::text AS "publishedAt" FROM longevity_record
        ORDER BY published_at DESC`);
    return from var row in rows select row;
}
