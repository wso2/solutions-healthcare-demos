import ballerinax/health.fhir.r4.international401;

// The Longevity Record: one JSON document per patient that the physician dashboard and the patient
// app read. It is the "large JSON" layer of the customer's stack — produced here from the systems of
// record, so their dashboards never talk to an EHR or a lab directly.

# Schema identifier of the Longevity Record.
const string LONGEVITY_RECORD_SCHEMA = "longevity-record/v2";

# Builds the Longevity Record published when the physician releases an assessment.
#
# + assessmentId - the assessment
# + ehr - the patient's EHR
# + summary - the patient summary (the IPS document's contents)
# + results - the lab results as filed in the EHR: the DiagnosticReport and its Observations
# + analysis - the Results Analysis
# + plan - the care plan
# + release - the physician's release
# + practitionerId - who released it
# + noteId - the chart note in the EHR
# + return - the record as JSON
isolated function buildLongevityRecord(string assessmentId, string ehr, IpsContents summary,
        [international401:DiagnosticReport, international401:Observation[]] results, ResultsAnalysis analysis,
        CarePlanResult plan, PhysicianRelease release, string practitionerId, string noteId) returns json {
    [international401:DiagnosticReport, international401:Observation[]] [report, observations] = results;
    return {
        schema: LONGEVITY_RECORD_SCHEMA,
        generatedAt: nowIso(),
        patient: patientDigest(ehr, summary.ehrName, summary.patient, mrnSystemOf(ehr)),
        sources: {
            ehr: {id: ehr, system: summary.ehrName, clinicalNoteId: noteId,
                resultsReportId: report.id ?: "", summaryMethod: summary.'source},
            lab: {system: labDisplayName, diagnosticReportId: identifierValue(report.identifier, LAB_RESULT_ID_SYSTEM) ?: "",
                issued: report.issued ?: ""},
            assessmentId
        },
        clinicalContext: {
            conditions: from international401:Condition c in summary.conditions select conditionDigest(c),
            allergies: from international401:AllergyIntolerance a in summary.allergies select allergyDigest(a),
            medications: from Medication m in summary.medications select medicationDigest(m),
            familyHistory: familyHistoryDigest(summary.familyHistory),
            vitals: latestVitalsDigest(summary.vitals)
        },
        biomarkers: mergedBiomarkers(summary.biomarkers, labResultsDigest(observations), analysis.biomarkerInsights),
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
isolated function mergedBiomarkers(BiomarkerSeries[] history, map<json>[] latest,
        BiomarkerInsight[] insights) returns json[] {
    map<map<json>> byCode = {};
    string[] codeOrder = [];
    foreach BiomarkerSeries series in history {
        json[] points = from BiomarkerPoint point in series.points select point.toJson();
        Analyte? catalogAnalyte = analyteByCode(series.code);
        map<json> entry = {
            code: series.code, name: series.name, unit: series.unit,
            longevityTarget: catalogAnalyte is Analyte ? catalogAnalyte.longevityTarget : (),
            referenceLow: series.referenceLow, referenceHigh: series.referenceHigh, history: points
        };
        byCode[series.code] = entry;
        codeOrder.push(series.code);
    }
    foreach map<json> result in latest {
        string code = result["code"].toString();
        // Today's result joins the series of its catalog analyte (results may use an equivalent LOINC code).
        Analyte? resultAnalyte = analyteByCode(code);
        string seriesCode = resultAnalyte is Analyte ? resultAnalyte.code : code;
        map<json>? existing = byCode[seriesCode];
        map<json> entry;
        json[] points;
        if existing is map<json> {
            entry = existing;
            points = <json[]>entry["history"];
        } else {
            points = [];
            entry = {code: seriesCode, name: result["name"], unit: result["unit"],
                longevityTarget: resultAnalyte is Analyte ? resultAnalyte.longevityTarget : ()};
            codeOrder.push(seriesCode);
        }
        map<json> point = {date: result["effectiveDate"], value: result["value"], interpretation: result["interpretation"],
            'source: labDisplayName};
        points.push(point);
        entry["history"] = points;
        entry["referenceLow"] = result["referenceLow"];
        entry["referenceHigh"] = result["referenceHigh"];
        byCode[seriesCode] = entry;
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
