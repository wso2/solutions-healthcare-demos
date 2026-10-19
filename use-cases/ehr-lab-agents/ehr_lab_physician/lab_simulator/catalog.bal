// The lab's side of the test menu: what each orderable test measures, the lab's reference ranges,
// and the results each demo patient will "produce". Results are fixed per patient (by MRN) so the
// demo tells the same story every run.

# Code system for analyte codes.
const string LOINC = "http://loinc.org";

# Code system for units.
const string UCUM = "http://unitsofmeasure.org";

# Code system of the orderable test codes on a ServiceRequest's `orderDetail`.
const string LAB_TEST_CODE_SYSTEM = "urn:demo:lab:test-code";

# Identifier system of the ordering clinic's order id.
const string PLACER_ORDER_SYSTEM = "urn:demo:longevity:placer-order";

# An analyte the lab reports, with its reference range (female overrides where they differ).
#
# + key - short key used by the test menu and the patient profiles
# + code - LOINC code
# + display - LOINC display name
# + unit - unit shown to people
# + ucum - UCUM code for the unit
# + low - lower bound of the reference range, if it has one
# + high - upper bound of the reference range, if it has one
# + lowFemale - lower bound for female patients, where it differs from `low`
# + highFemale - upper bound for female patients, where it differs from `high`
type LabAnalyte record {|
    string key;
    string code;
    string display;
    string unit;
    string ucum;
    decimal? low = ();
    decimal? high = ();
    decimal? lowFemale = ();
    decimal? highFemale = ();
|};

# Every analyte the lab can report.
final readonly & LabAnalyte[] LAB_ANALYTES = [
    {key: "tc", code: "2093-3", display: "Cholesterol [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", high: 200},
    {key: "ldl", code: "13457-7", display: "Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation", unit: "mg/dL", ucum: "mg/dL", high: 100},
    {key: "hdl", code: "2085-9", display: "Cholesterol in HDL [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", low: 40, lowFemale: 50},
    {key: "tg", code: "2571-8", display: "Triglyceride [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", high: 150},
    {key: "apob", code: "1884-6", display: "Apolipoprotein B [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", high: 90},
    {key: "lpa", code: "43583-4", display: "Lipoprotein a [Moles/volume] in Serum or Plasma", unit: "nmol/L", ucum: "nmol/L", high: 75},
    {key: "hscrp", code: "30522-7", display: "C reactive protein [Mass/volume] in Serum or Plasma by High sensitivity method", unit: "mg/L", ucum: "mg/L", high: 3.0},
    {key: "glu", code: "1558-6", display: "Fasting glucose [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", low: 65, high: 99},
    {key: "insulin", code: "20448-7", display: "Insulin [Units/volume] in Serum or Plasma", unit: "uIU/mL", ucum: "u[IU]/mL", low: 2.6, high: 24.9},
    {key: "a1c", code: "4548-4", display: "Hemoglobin A1c/Hemoglobin.total in Blood", unit: "%", ucum: "%", high: 5.6},
    {key: "hcy", code: "13965-9", display: "Homocysteine [Moles/volume] in Serum or Plasma", unit: "umol/L", ucum: "umol/L", high: 11.4},
    {key: "vitd", code: "1989-3", display: "25-hydroxyvitamin D3 [Mass/volume] in Serum or Plasma", unit: "ng/mL", ucum: "ng/mL", low: 30, high: 100},
    {key: "alt", code: "1742-6", display: "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma", unit: "U/L", ucum: "U/L", low: 9, high: 46},
    {key: "ggt", code: "2324-2", display: "Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma", unit: "U/L", ucum: "U/L", low: 3, high: 70},
    {key: "uric", code: "3084-1", display: "Urate [Mass/volume] in Serum or Plasma", unit: "mg/dL", ucum: "mg/dL", low: 4.0, high: 8.0, lowFemale: 2.5, highFemale: 7.0},
    {key: "cysc", code: "33863-2", display: "Cystatin C [Mass/volume] in Serum or Plasma", unit: "mg/L", ucum: "mg/L", low: 0.52, high: 1.16},
    {key: "egfr", code: "62238-1", display: "Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI)", unit: "mL/min/1.73m2", ucum: "mL/min/{1.73_m2}", low: 60},
    {key: "tsh", code: "3016-3", display: "Thyrotropin [Units/volume] in Serum or Plasma", unit: "mIU/L", ucum: "m[IU]/L", low: 0.40, high: 4.50},
    {key: "ferr", code: "2276-4", display: "Ferritin [Mass/volume] in Serum or Plasma", unit: "ng/mL", ucum: "ng/mL", low: 38, high: 380, lowFemale: 16, highFemale: 232},
    {key: "hgb", code: "718-7", display: "Hemoglobin [Mass/volume] in Blood", unit: "g/dL", ucum: "g/dL", low: 13.2, high: 17.1, lowFemale: 11.7, highFemale: 15.5},
    {key: "testo", code: "2986-8", display: "Testosterone [Mass/volume] in Serum or Plasma", unit: "ng/dL", ucum: "ng/dL", low: 250, high: 1100, lowFemale: 2, highFemale: 45}
];

# Orderable test code → analyte keys. Mirrors the clinic's catalog in the integration.
final readonly & map<string[]> TEST_ANALYTES = {
    "LIPID-ADV": ["tc", "ldl", "hdl", "tg", "apob"],
    "LPA": ["lpa"],
    "HSCRP": ["hscrp"],
    "METAB": ["glu", "insulin", "a1c"],
    "HCY": ["hcy"],
    "VITD": ["vitd"],
    "LIVER": ["alt", "ggt"],
    "URIC": ["uric"],
    "KIDNEY": ["cysc", "egfr"],
    "THYROID": ["tsh"],
    "IRON": ["ferr", "hgb"],
    "TESTO": ["testo"]
};

# Results per patient MRN, by analyte key. Other patients get DEFAULT_PROFILE, varied per patient.
final readonly & map<map<decimal>> PATIENT_PROFILES = {
    // Daniel Reyes (Cerner): atherogenic particles, inherited Lp(a), inflammation and insulin resistance
    // hiding behind a "normal" insulin and a borderline glucose.
    "MRN-100234": {tc: 236, ldl: 149, hdl: 40, tg: 205, apob: 128, lpa: 168, hscrp: 3.4, glu: 108, insulin: 18.2,
        a1c: 6.0, hcy: 13.8, vitd: 22, alt: 44, ggt: 52, uric: 7.4, cysc: 0.98, egfr: 85, tsh: 2.1, ferr: 180,
        hgb: 15.1, testo: 380},
    // Priya Nair (Cerner): iron deficiency developing under treated hypothyroidism.
    "MRN-100587": {tc: 198, ldl: 122, hdl: 60, tg: 100, apob: 88, lpa: 40, hscrp: 0.8, glu: 90, insulin: 6.1,
        a1c: 5.4, hcy: 9.2, vitd: 33, alt: 18, ggt: 14, uric: 4.1, cysc: 0.82, egfr: 97, tsh: 2.2, ferr: 12,
        hgb: 11.6, testo: 28},
    // Marcus Bell (Athena): healthy control.
    "ATH-40912": {tc: 182, ldl: 104, hdl: 58, tg: 101, apob: 82, lpa: 38, hscrp: 0.6, glu: 92, insulin: 5.6,
        a1c: 5.4, hcy: 9.4, vitd: 38, alt: 22, ggt: 19, uric: 5.6, cysc: 0.94, egfr: 84, tsh: 1.9, ferr: 140,
        hgb: 14.8, testo: 560},
    // Sofia Alvarez (Athena): kidney function falling (cystatin C confirms it), metabolic liver pattern,
    // insulin resistance and high uric acid — on daily ibuprofen and a thiazide.
    "ATH-41377": {tc: 229, ldl: 139, hdl: 46, tg: 189, apob: 104, lpa: 52, hscrp: 3.1, glu: 104, insulin: 16.4,
        a1c: 5.9, hcy: 12.6, vitd: 21, alt: 47, ggt: 58, uric: 7.4, cysc: 1.24, egfr: 66, tsh: 2.6, ferr: 96,
        hgb: 12.9, testo: 31}
};

# Results for any patient without a profile: a healthy adult. Varied per patient (see `profileFor`).
final readonly & map<decimal> DEFAULT_PROFILE = {tc: 182, ldl: 102, hdl: 57, tg: 98, apob: 78, lpa: 30, hscrp: 0.7,
    glu: 91, insulin: 5.8, a1c: 5.4, hcy: 9.0, vitd: 41, alt: 22, ggt: 20, uric: 5.2, cysc: 0.88, egfr: 84, tsh: 1.8,
    ferr: 120, hgb: 14.6, testo: 520};

# The results a patient will produce: their profile, or the default profile varied by up to ±12% per
# analyte, the same way every time for the same MRN.
#
# + mrn - the patient's MRN, if known
# + return - result by analyte key
isolated function profileFor(string? mrn) returns map<decimal> {
    if mrn is string {
        map<decimal>? profile = PATIENT_PROFILES[mrn];
        if profile is map<decimal> {
            return profile;
        }
    }
    string seed = mrn ?: "unknown";
    map<decimal> varied = {};
    foreach [string, decimal] [key, value] in DEFAULT_PROFILE.entries() {
        int hash = 0;
        foreach string:Char c in (seed + key) {
            hash = (hash * 31 + c.toCodePointInt()) % 1000003;
        }
        decimal factor = 0.88d + <decimal>(hash % 25) / 100d;
        decimal result = value * factor;
        varied[key] = value >= 20d ? result.round(0) : result.round(1);
    }
    return varied;
}

# Looks an analyte up by its short key.
#
# + key - the analyte key, e.g. `apob`
# + return - the analyte, or nil if the lab does not run it
isolated function analyteByKey(string key) returns LabAnalyte? {
    foreach LabAnalyte analyte in LAB_ANALYTES {
        if analyte.key == key {
            return analyte;
        }
    }
    return ();
}
