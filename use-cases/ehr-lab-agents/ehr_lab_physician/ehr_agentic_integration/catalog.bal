// What the clinic can order from the lab, and how the integration reads each analyte.
// The lab owns reference ranges (they arrive on its Observations); the clinic owns its longevity
// targets and which direction of change is adverse — that is what drives trend flags.

# Code system for analytes.
const string LOINC = "http://loinc.org";
# Code system of the lab's orderable test codes.
const string LAB_TEST_CODE_SYSTEM = "urn:demo:lab:test-code";
# Identifier system of the clinic's order ids, shared by the EHR's order of record and the lab's copy.
const string PLACER_ORDER_SYSTEM = "urn:demo:longevity:placer-order";

# How the clinic interprets one analyte.
#
# + code - LOINC code
# + name - short display name
# + unit - unit the clinic reports it in
# + adverse - direction of change that is clinically adverse
# + longevityTarget - the clinic's optimal target, shown beside the lab's reference range
# + baseline - part of the clinic's recommended longevity baseline; missing ones become care gaps
type Analyte record {|
    string code;
    string name;
    string unit;
    "up"|"down" adverse;
    string longevityTarget;
    boolean baseline = false;
|};

# A test the clinic can order, and the analytes it reports.
#
# + code - the lab's test code
# + name - display name
# + analytes - LOINC codes of the analytes it reports
# + purpose - why a physician would order it
# + preparation - what the patient must do before the sample is taken
type OrderableTest record {|
    string code;
    string name;
    string[] analytes;
    string purpose;
    string preparation = "No special preparation.";
|};

# Every analyte the clinic interprets, in the order the summary lists them.
final readonly & Analyte[] ANALYTES = [
    {code: "2093-3", name: "Total cholesterol", unit: "mg/dL", adverse: "up", longevityTarget: "< 180 mg/dL"},
    {code: "13457-7", name: "LDL-C", unit: "mg/dL", adverse: "up", longevityTarget: "< 100 mg/dL (< 70 if high risk)"},
    {code: "2085-9", name: "HDL-C", unit: "mg/dL", adverse: "down", longevityTarget: "> 50 mg/dL"},
    {code: "2571-8", name: "Triglycerides", unit: "mg/dL", adverse: "up", longevityTarget: "< 100 mg/dL"},
    {code: "1884-6", name: "ApoB", unit: "mg/dL", adverse: "up", longevityTarget: "< 80 mg/dL", baseline: true},
    {code: "43583-4", name: "Lipoprotein(a)", unit: "nmol/L", adverse: "up", longevityTarget: "< 75 nmol/L", baseline: true},
    {code: "30522-7", name: "hs-CRP", unit: "mg/L", adverse: "up", longevityTarget: "< 1.0 mg/L", baseline: true},
    {code: "4548-4", name: "HbA1c", unit: "%", adverse: "up", longevityTarget: "< 5.4 %"},
    {code: "1558-6", name: "Fasting glucose", unit: "mg/dL", adverse: "up", longevityTarget: "72-90 mg/dL"},
    {code: "20448-7", name: "Fasting insulin", unit: "uIU/mL", adverse: "up", longevityTarget: "< 8 uIU/mL", baseline: true},
    {code: "13965-9", name: "Homocysteine", unit: "umol/L", adverse: "up", longevityTarget: "< 10 umol/L", baseline: true},
    {code: "1989-3", name: "Vitamin D (25-OH)", unit: "ng/mL", adverse: "down", longevityTarget: "40-60 ng/mL", baseline: true},
    {code: "1742-6", name: "ALT", unit: "U/L", adverse: "up", longevityTarget: "< 30 U/L"},
    {code: "2324-2", name: "GGT", unit: "U/L", adverse: "up", longevityTarget: "< 30 U/L"},
    {code: "3084-1", name: "Uric acid", unit: "mg/dL", adverse: "up", longevityTarget: "< 6.0 mg/dL"},
    {code: "62238-1", name: "eGFR", unit: "mL/min/1.73m2", adverse: "down", longevityTarget: "> 90 mL/min/1.73m2"},
    {code: "33863-2", name: "Cystatin C", unit: "mg/L", adverse: "up", longevityTarget: "< 0.9 mg/L"},
    {code: "3016-3", name: "TSH", unit: "mIU/L", adverse: "up", longevityTarget: "0.5-2.5 mIU/L"},
    {code: "2276-4", name: "Ferritin", unit: "ng/mL", adverse: "down", longevityTarget: "50-150 ng/mL"},
    {code: "718-7", name: "Hemoglobin", unit: "g/dL", adverse: "down", longevityTarget: "within reference range"},
    {code: "2986-8", name: "Testosterone, total", unit: "ng/dL", adverse: "down", longevityTarget: "450-900 ng/dL (men)"}
];

# EHRs record some analytes under equivalent LOINC codes (a direct rather than calculated LDL, a
# non-fasting glucose, an older eGFR code). They are read as the catalog analyte, so their history
# joins the same trend.
final readonly & map<string> ANALYTE_ALIASES = {
    "18262-6": "13457-7",
    "2339-0": "1558-6",
    "2345-7": "1558-6",
    "33914-3": "62238-1"
};

# What the clinic can order from the lab.
final readonly & OrderableTest[] ORDERABLE_TESTS = [
    {code: "LIPID-ADV", name: "Advanced lipid panel with ApoB", analytes: ["2093-3", "13457-7", "2085-9", "2571-8", "1884-6"],
        purpose: "Atherogenic particle burden; ApoB is a better risk marker than LDL-C alone",
        preparation: "Fast for 10–12 hours before the blood draw (water is fine)."},
    {code: "LPA", name: "Lipoprotein(a)", analytes: ["43583-4"],
        purpose: "Inherited cardiovascular risk; measure once in a lifetime, especially with family history"},
    {code: "HSCRP", name: "hs-CRP", analytes: ["30522-7"],
        purpose: "Low-grade systemic inflammation; refines cardiovascular risk"},
    {code: "METAB", name: "Metabolic health panel (glucose, insulin, HbA1c)", analytes: ["1558-6", "20448-7", "4548-4"],
        purpose: "Insulin resistance (HOMA-IR) and glycaemic control, before glucose rises",
        preparation: "Fast for 10–12 hours before the blood draw (water is fine)."},
    {code: "HCY", name: "Homocysteine", analytes: ["13965-9"],
        purpose: "Vascular and cognitive risk; B-vitamin status",
        preparation: "Fast for 8 hours before the blood draw."},
    {code: "VITD", name: "Vitamin D, 25-hydroxy", analytes: ["1989-3"],
        purpose: "Bone, muscle and immune health"},
    {code: "LIVER", name: "Liver panel (ALT, GGT)", analytes: ["1742-6", "2324-2"],
        purpose: "Metabolic fatty liver (MASLD) screening"},
    {code: "URIC", name: "Uric acid", analytes: ["3084-1"],
        purpose: "Metabolic and cardiovascular risk; gout"},
    {code: "KIDNEY", name: "Kidney function (cystatin C, eGFR)", analytes: ["33863-2", "62238-1"],
        purpose: "Kidney function independent of muscle mass"},
    {code: "THYROID", name: "Thyroid (TSH)", analytes: ["3016-3"],
        purpose: "Thyroid function; fatigue and weight change work-up"},
    {code: "IRON", name: "Iron stores (ferritin, hemoglobin)", analytes: ["2276-4", "718-7"],
        purpose: "Iron deficiency or overload; fatigue work-up"},
    {code: "TESTO", name: "Testosterone, total", analytes: ["2986-8"],
        purpose: "Androgen status; energy, muscle mass and metabolic health",
        preparation: "Have the blood drawn before 10 a.m."}
];

# The catalog analyte for a LOINC code, including equivalent codes.
#
# + code - a LOINC code
# + return - the analyte, or nil if the clinic does not interpret it
isolated function analyteByCode(string code) returns Analyte? {
    string catalogCode = ANALYTE_ALIASES[code] ?: code;
    foreach Analyte analyte in ANALYTES {
        if analyte.code == catalogCode {
            return analyte;
        }
    }
    return ();
}

# An orderable test by its code.
#
# + code - the lab's test code
# + return - the test, or nil if the lab does not offer it
isolated function orderableByCode(string code) returns OrderableTest? {
    foreach OrderableTest test in ORDERABLE_TESTS {
        if test.code == code {
            return test;
        }
    }
    return ();
}

# The orderable tests that would close a gap for the given analyte codes.
#
# + analyteCodes - LOINC codes of the missing analytes
# + return - codes of the tests that report at least one of them
isolated function testsCovering(string[] analyteCodes) returns string[] {
    return from OrderableTest test in ORDERABLE_TESTS
        where analyteCodes.some(code => test.analytes.indexOf(code) is int)
        select test.code;
}

# What the patient must do before the sample is taken for a set of tests, without repeats.
#
# + testCodes - catalog codes of the ordered tests
# + return - the distinct preparation instructions
isolated function preparationFor(string[] testCodes) returns string[] {
    string[] instructions = [];
    foreach string code in testCodes {
        OrderableTest? test = orderableByCode(code);
        if test is OrderableTest && instructions.indexOf(test.preparation) is () {
            instructions.push(test.preparation);
        }
    }
    string none = "No special preparation.";
    if instructions.length() > 1 && instructions.indexOf(none) is int {
        instructions = from string instruction in instructions where instruction != none select instruction;
    }
    return instructions;
}
