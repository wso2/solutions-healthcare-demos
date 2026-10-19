import ballerina/test;

@test:Config
function mergedBiomarkersAppendsTodayToHistoryAndAddsNewAnalytes() {
    BiomarkerSeries ldl = {
        code: "13457-7", name: "LDL-C", unit: "mg/dL",
        points: [{date: "2024-11-19", value: 139, interpretation: "H", 'source: "EHR"}],
        latest: 139, latestDate: "2024-11-19", previous: (), changePct: (), trend: "single", status: "high",
        referenceLow: (), referenceHigh: 100, longevityTarget: "< 100 mg/dL"
    };
    LabResultValue[] today = [
        {code: "13457-7", name: "LDL-C", value: 149, unit: "mg/dL", interpretation: "H", referenceLow: (), referenceHigh: 100, effectiveDate: "2026-10-17"},
        {code: "1884-6", name: "ApoB", value: 128, unit: "mg/dL", interpretation: "H", referenceLow: (), referenceHigh: 90, effectiveDate: "2026-10-17"}
    ];
    json[] merged = mergedBiomarkers([ldl], today, []);

    test:assertEquals(merged.length(), 2);
    json ldlEntry = merged[0];
    json apobEntry = merged[1];
    test:assertEquals((<json[]>checkpanic ldlEntry.history).length(), 2, "today's LDL-C is appended to its history");
    test:assertEquals((<json[]>checkpanic apobEntry.history).length(), 1, "an analyte with no history gets a series of one");
}
