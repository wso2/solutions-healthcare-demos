// The Longevity Record: one JSON document per patient that the physician dashboard and the patient
// app read. It is the "large JSON" layer of the customer's stack — produced here from the systems of
// record, so their dashboards never talk to an EHR or a lab directly.

# Schema identifier of the Longevity Record.
const string LONGEVITY_RECORD_SCHEMA = "longevity-record/v2";

# Builds the Longevity Record published when the physician releases an assessment.
#
# + assessmentId - the assessment
# + summary - the patient summary
# + results - the lab results
# + analysis - the Results Analysis
# + plan - the care plan
# + release - the physician's release
# + practitionerId - who released it
# + noteId - the chart note in the EHR
# + return - the record as JSON
isolated function buildLongevityRecord(string assessmentId, PatientSummary summary, LabResults results,
        ResultsAnalysis analysis, CarePlanResult plan, PhysicianRelease release, string practitionerId,
        string noteId) returns json {
    return {
        schema: LONGEVITY_RECORD_SCHEMA,
        generatedAt: nowIso(),
        patient: summary.patient.toJson(),
        sources: {
            ehr: {id: summary.patient.ehr, system: summary.patient.ehrName, clinicalNoteId: noteId,
                resultsReportId: results.ehrDiagnosticReportId, summaryMethod: summary.'source},
            lab: {system: labDisplayName, diagnosticReportId: results.diagnosticReportId, issued: results.issued},
            assessmentId
        },
        clinicalContext: {
            conditions: summary.conditions.toJson(),
            allergies: summary.allergies.toJson(),
            medications: summary.medications.toJson(),
            familyHistory: summary.familyHistory.toJson(),
            vitals: summary.vitals.toJson()
        },
        biomarkers: mergedBiomarkers(summary.biomarkers, results.results, analysis.biomarkerInsights),
        assessment: {
            headline: analysis.headline,
            riskFlags: analysis.riskFlags.toJson(),
            summary: analysis.updatedSummary,
            physicianComment: release.comment == "" ? () : release.comment
        },
        carePlan: {
            goals: plan.goals.toJson(),
            followUpLabs: from FollowUpTest test in plan.followUpLabs
                let OrderableTest? orderable = orderableByCode(test.testCode)
                select {testCode: test.testCode, name: orderable is OrderableTest ? orderable.name : test.testCode,
                    timing: test.timing}
        },
        patientReport: plan.patientReport.toJson(),
        provenance: {
            deterministic: ["clinicalContext", "biomarkers.history", "biomarkers.reference"],
            aiGenerated: ["assessment.headline", "assessment.summary", "biomarkers.insight", "carePlan", "patientReport"],
            physicianApproved: true,
            approvedBy: string `Practitioner/${practitionerId}`,
            approvedAt: nowIso(),
            note: "AI-generated sections were reviewed and released by the treating physician before publication."
        }
    };
}

# EHR history and today's lab results as one series per analyte, with the analyst's reading of the
# latest value attached.
#
# Entries are built as explicitly typed `map<json>` values: a mapping literal assigned to `json` gets a
# closed record type inferred from its fields (and a bare `[]` an empty tuple type), so adding a field
# or pushing a point to it later fails at runtime.
#
# + history - the analyte series from the EHR summary
# + latest - today's results from the lab
# + insights - the Results Analysis reading of each result
# + return - one entry per analyte (EHR series first, then analytes new today), each with today's result
# appended to its history, the lab's reference range and the analyst's insight when there is one
isolated function mergedBiomarkers(BiomarkerSeries[] history, LabResultValue[] latest,
        BiomarkerInsight[] insights) returns json[] {
    map<map<json>> byCode = {};
    string[] codeOrder = [];
    foreach BiomarkerSeries series in history {
        json[] points = from BiomarkerPoint point in series.points select point.toJson();
        map<json> entry = {
            code: series.code, name: series.name, unit: series.unit, longevityTarget: series.longevityTarget,
            referenceLow: series.referenceLow, referenceHigh: series.referenceHigh, history: points
        };
        byCode[series.code] = entry;
        codeOrder.push(series.code);
    }
    foreach LabResultValue result in latest {
        map<json>? existing = byCode[result.code];
        map<json> entry;
        json[] points;
        if existing is map<json> {
            entry = existing;
            points = <json[]>entry["history"];
        } else {
            Analyte? analyte = analyteByCode(result.code);
            points = [];
            entry = {code: result.code, name: result.name, unit: result.unit,
                longevityTarget: analyte is Analyte ? analyte.longevityTarget : ()};
            codeOrder.push(result.code);
        }
        map<json> point = {date: result.effectiveDate, value: result.value, interpretation: result.interpretation,
            'source: labDisplayName};
        points.push(point);
        entry["history"] = points;
        entry["referenceLow"] = result.referenceLow;
        entry["referenceHigh"] = result.referenceHigh;
        byCode[result.code] = entry;
    }
    foreach BiomarkerInsight insight in insights {
        map<json>? entry = byCode[insight.code];
        if entry is map<json> {
            map<json> reading = {status: insight.status, trend: insight.trend, interpretation: insight.interpretation};
            entry["insight"] = reading;
        }
    }
    return from string code in codeOrder
        let map<json>? entry = byCode[code]
        where entry is map<json>
        select entry;
}
