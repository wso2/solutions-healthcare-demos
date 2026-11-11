type TestDef record {|
    string name;
    string unit;
    decimal? low;
    decimal? high;
|};

type Result record {|
    decimal value;
    string interp;
|};

// Supported LOINC codes with units and reference ranges.
final readonly & map<TestDef> TESTS = {
    "1884-6": {name: "Apolipoprotein B", unit: "mg/dL", low: (), high: 90},
    "10835-7": {name: "Lipoprotein (a)", unit: "nmol/L", low: (), high: 75},
    "20448-7": {name: "Insulin", unit: "u[IU]/mL", low: 2.6, high: 24.9},
    "1558-6": {name: "Fasting glucose", unit: "mg/dL", low: 65, high: 99},
    "4548-4": {name: "Hemoglobin A1c", unit: "%", low: (), high: 5.7},
    "13457-7": {name: "LDL cholesterol (calculated)", unit: "mg/dL", low: (), high: 100},
    "2085-9": {name: "HDL cholesterol", unit: "mg/dL", low: 40, high: ()},
    "2571-8": {name: "Triglycerides", unit: "mg/dL", low: (), high: 150},
    "30522-7": {name: "C-reactive protein, high sensitivity", unit: "mg/L", low: (), high: 3.0},
    "62292-8": {name: "25-hydroxyvitamin D", unit: "ng/mL", low: 30, high: 100}
};

final readonly & map<map<Result>> SCENARIOS = {
    "normal": {
        "1884-6": {value: 78, interp: "N"},
        "10835-7": {value: 30, interp: "N"},
        "20448-7": {value: 6, interp: "N"},
        "1558-6": {value: 88, interp: "N"},
        "4548-4": {value: 5.2, interp: "N"},
        "13457-7": {value: 92, interp: "N"},
        "2085-9": {value: 58, interp: "N"},
        "2571-8": {value: 96, interp: "N"},
        "30522-7": {value: 0.6, interp: "N"},
        "62292-8": {value: 45, interp: "N"}
    },
    "elevated-cardiometabolic-risk": {
        "1884-6": {value: 128, interp: "H"},
        "10835-7": {value: 92, interp: "H"},
        "20448-7": {value: 14, interp: "N"},
        "1558-6": {value: 102, interp: "H"},
        "4548-4": {value: 5.9, interp: "H"},
        "13457-7": {value: 151, interp: "H"},
        "2085-9": {value: 47, interp: "N"},
        "2571-8": {value: 171, interp: "H"},
        "30522-7": {value: 3.4, interp: "H"},
        "62292-8": {value: 24, interp: "L"}
    },
    "critical-value": {
        "1884-6": {value: 135, interp: "H"},
        "10835-7": {value: 95, interp: "H"},
        "20448-7": {value: 22, interp: "N"},
        "1558-6": {value: 420, interp: "HH"},
        "4548-4": {value: 5.9, interp: "H"},
        "13457-7": {value: 151, interp: "H"},
        "2085-9": {value: 47, interp: "N"},
        "2571-8": {value: 171, interp: "H"},
        "30522-7": {value: 3.4, interp: "H"},
        "62292-8": {value: 24, interp: "L"}
    }
};

const string SCENARIO_PARTIAL = "partial-then-final";
const string SCENARIO_CORRECTED = "corrected";
const string SCENARIO_ELEVATED = "elevated-cardiometabolic-risk";

isolated function isValidScenario(string s) returns boolean {
    return SCENARIOS.hasKey(s) || s == SCENARIO_PARTIAL || s == SCENARIO_CORRECTED;
}

// Maps a (possibly special) scenario to the value table it uses.
isolated function baseScenario(string s) returns string {
    return SCENARIOS.hasKey(s) ? s : SCENARIO_ELEVATED;
}

isolated function interpDisplay(string code) returns string {
    match code {
        "H" => {
            return "High";
        }
        "L" => {
            return "Low";
        }
        "HH" => {
            return "Critical high";
        }
        "LL" => {
            return "Critical low";
        }
    }
    return "Normal";
}
