final readonly & string[] SUPPORTED_TYPES = ["Patient", "Encounter", "Observation", "Condition", "DiagnosticReport",
    "ServiceRequest", "ClinicalImpression", "CarePlan", "Composition", "Practitioner", "Organization"];

const string LOINC = "http://loinc.org";
const string UCUM = "http://unitsofmeasure.org";

isolated function meta() returns json {
    return {versionId: "1", lastUpdated: nowStr(), 'source: "cerner"};
}

isolated function seedPatient(string id, string family, string given, string gender, string birth) {
    putResource("Patient", id, {
        resourceType: "Patient",
        id,
        meta: meta(),
        identifier: [{
            use: "usual",
            'type: {coding: [{system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "MR"}]},
            system: MRN_SYSTEM,
            value: id
        }],
        active: true,
        name: [{use: "official", family, given: [given], text: family + ", " + given}],
        gender,
        birthDate: birth,
        managingOrganization: {reference: "Organization/cerner-clinic"}
    });
}

isolated function seedEncounter(string patient, string date) returns string {
    string id = nextId();
    putResource("Encounter", id, {
        resourceType: "Encounter",
        id,
        meta: meta(),
        status: "finished",
        'class: {system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory"},
        'type: [{coding: [{system: "http://www.ama-assn.org/go/cpt", code: "99396", display: "Annual physical"}], text: "Annual physical"}],
        subject: {reference: "Patient/" + patient},
        participant: [{individual: {reference: "Practitioner/593923", display: "Dr. Alex Kim"}}],
        period: {'start: date + "T09:00:00Z", end: date + "T09:45:00Z"},
        serviceProvider: {reference: "Organization/cerner-clinic"}
    });
    return id;
}

// interp: N | H | L
isolated function seedObs(string patient, string enc, string date, string code, string name, decimal v,
        string unit, decimal? low, decimal? high, string interp) returns string {
    string id = nextId();
    json[] rr = [];
    map<json> range = {};
    if low is decimal {
        range["low"] = {value: low, unit, system: UCUM, code: unit};
    }
    if high is decimal {
        range["high"] = {value: high, unit, system: UCUM, code: unit};
    }
    rr.push(range);
    putResource("Observation", id, {
        resourceType: "Observation",
        id,
        meta: meta(),
        status: "final",
        category: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory", display: "Laboratory"}]}],
        code: {coding: [{system: LOINC, code, display: name}], text: name},
        subject: {reference: "Patient/" + patient},
        encounter: {reference: "Encounter/" + enc},
        effectiveDateTime: date + "T09:15:00Z",
        issued: date + "T18:00:00Z",
        performer: [{reference: "Organization/quest-diagnostics"}],
        valueQuantity: {value: v, unit, system: UCUM, code: unit},
        interpretation: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
            code: interp, display: interp == "H" ? "High" : interp == "L" ? "Low" : "Normal"}]}],
        referenceRange: rr
    });
    return id;
}

isolated function seedReport(string patient, string enc, string date, string code, string name, string[] obsIds) {
    string id = nextId();
    json[] results = from string o in obsIds
        select {reference: "Observation/" + o};
    putResource("DiagnosticReport", id, {
        resourceType: "DiagnosticReport",
        id,
        meta: meta(),
        status: "final",
        category: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB", display: "Laboratory"}]}],
        code: {coding: [{system: LOINC, code, display: name}], text: name},
        subject: {reference: "Patient/" + patient},
        encounter: {reference: "Encounter/" + enc},
        effectiveDateTime: date + "T09:15:00Z",
        issued: date + "T18:00:00Z",
        performer: [{reference: "Organization/quest-diagnostics"}],
        result: results
    });
}

isolated function seedYear(string patient, string date, decimal ldl, string ldlI, decimal ldlHigh, decimal hdl,
        decimal tg, string tgI, decimal tgHigh, decimal a1c, string a1cI, decimal crp) {
    string enc = seedEncounter(patient, date);
    string o1 = seedObs(patient, enc, date, "13457-7", "LDL-C (calculated)", ldl, "mg/dL", (), ldlHigh, ldlI);
    string o2 = seedObs(patient, enc, date, "2085-9", "HDL-C", hdl, "mg/dL", 40, (), "N");
    string o3 = seedObs(patient, enc, date, "2571-8", "Triglycerides", tg, "mg/dL", (), tgHigh, tgI);
    string o4 = seedObs(patient, enc, date, "4548-4", "HbA1c", a1c, "%", (), 5.7, a1cI);
    string o5 = seedObs(patient, enc, date, "30522-7", "hs-CRP", crp, "mg/L", (), 3.0, "N");
    seedReport(patient, enc, date, "57698-3", "Lipid panel with direct LDL - Serum or Plasma", [o1, o2, o3]);
    seedReport(patient, enc, date, "4548-4", "HbA1c and hs-CRP", [o4, o5]);
}

isolated function loadSeed() {
    putResource("Practitioner", "593923", {
        resourceType: "Practitioner",
        id: "593923",
        meta: meta(),
        active: true,
        name: [{family: "Kim", given: ["Alex"], prefix: ["Dr."], text: "Dr. Alex Kim"}]
    });
    putResource("Organization", "cerner-clinic", {
        resourceType: "Organization", id: "cerner-clinic", meta: meta(), active: true, name: "Longevity Clinic"
    });
    putResource("Organization", "quest-diagnostics", {
        resourceType: "Organization", id: "quest-diagnostics", meta: meta(), active: true, name: "Quest Diagnostics"
    });

    seedPatient("12724066", "SMART", "NANCY", "female", "1980-08-11");
    seedPatient("12724067", "SMART", "FRED", "male", "1976-03-02");
    seedPatient("12724068", "JONES", "PRIYA", "female", "1969-11-23");

    // Nancy Smart: three annual physicals with a worsening cardiometabolic trend.
    seedYear("12724066", "2023-09-05", 128, "N", 150, 52, 142, "N", 170, 5.6, "N", 1.4);
    seedYear("12724066", "2024-09-10", 139, "N", 150, 49, 158, "N", 170, 5.8, "H", 1.9);
    seedYear("12724066", "2025-09-02", 151, "H", 150, 47, 171, "H", 170, 5.9, "H", 2.3);

    string prediabetesId = nextId();
    putResource("Condition", prediabetesId, {
        resourceType: "Condition",
        id: prediabetesId,
        meta: meta(),
        clinicalStatus: {coding: [{system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active"}]},
        verificationStatus: {coding: [{system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed"}]},
        category: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "problem-list-item"}]}],
        code: {
            coding: [
                {system: "http://hl7.org/fhir/sid/icd-10-cm", code: "R73.03", display: "Prediabetes"},
                {system: "http://snomed.info/sct", code: "714628002", display: "Prediabetes"}
            ],
            text: "Prediabetes"
        },
        subject: {reference: "Patient/12724066"},
        onsetDateTime: "2024-09-10"
    });
    string famId = nextId();
    putResource("Condition", famId, {
        resourceType: "Condition",
        id: famId,
        meta: meta(),
        clinicalStatus: {coding: [{system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active"}]},
        verificationStatus: {coding: [{system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed"}]},
        category: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "problem-list-item"}]}],
        code: {
            coding: [{system: "http://snomed.info/sct", code: "429959003", display: "Family history of premature coronary artery disease"}],
            text: "Family history of premature coronary artery disease"
        },
        subject: {reference: "Patient/12724066"}
    });

    // Fred Smart: sparse history, one normal lipid panel.
    string fe = seedEncounter("12724067", "2025-06-12");
    string f1 = seedObs("12724067", fe, "2025-06-12", "13457-7", "LDL-C (calculated)", 92, "mg/dL", (), 150, "N");
    string f2 = seedObs("12724067", fe, "2025-06-12", "2085-9", "HDL-C", 55, "mg/dL", 40, (), "N");
    string f3 = seedObs("12724067", fe, "2025-06-12", "2571-8", "Triglycerides", 98, "mg/dL", (), 170, "N");
    seedReport("12724067", fe, "2025-06-12", "57698-3", "Lipid panel with direct LDL - Serum or Plasma", [f1, f2, f3]);

    // Priya Jones: two years of normal labs.
    seedYear("12724068", "2024-05-14", 88, "N", 150, 64, 80, "N", 170, 5.2, "N", 0.6);
    seedYear("12724068", "2025-05-20", 90, "N", 150, 66, 84, "N", 170, 5.2, "N", 0.5);
}
