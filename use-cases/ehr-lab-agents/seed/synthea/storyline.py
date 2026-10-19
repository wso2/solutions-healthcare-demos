"""The demo personas: who they are and the clinical story their record has to tell.

Synthea provides each persona's realistic background (visit cadence, immunizations, routine panels,
acute illnesses, vitals). This file provides what the demo depends on, so the agents find the same
story every run:
  - identity (name, MRN, birth date)
  - anchor visits at the longevity clinic, with the lab and vital values that form the trends
  - the chronic problem list, medications (including history), allergies and family history
  - visit notes, which the Copilot reads when the physician selects them

All codes below are the ones Synthea itself emits (SNOMED CT, LOINC, RxNorm, CVX), so curated and
generated data share one vocabulary.
"""

# ── Analytes the storyline sets. Synthea values for these codes are replaced on personas that have
# anchors for them (older results are re-valued to lead into the anchors; recent ones are dropped).
# (LOINC, display, unit, UCUM, low, high, female low, female high) — typical adult reference ranges.
ANALYTES = {
    "tc":   ("2093-3", "Cholesterol [Mass/volume] in Serum or Plasma", "mg/dL", "mg/dL", None, 200, None, None),
    "ldl":  ("13457-7", "Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation", "mg/dL", "mg/dL", None, 100, None, None),
    "hdl":  ("2085-9", "Cholesterol in HDL [Mass/volume] in Serum or Plasma", "mg/dL", "mg/dL", 40, None, 50, None),
    "tg":   ("2571-8", "Triglyceride [Mass/volume] in Serum or Plasma", "mg/dL", "mg/dL", None, 150, None, None),
    "a1c":  ("4548-4", "Hemoglobin A1c/Hemoglobin.total in Blood", "%", "%", None, 5.7, None, None),
    "glu":  ("1558-6", "Fasting glucose [Mass/volume] in Serum or Plasma", "mg/dL", "mg/dL", 70, 99, None, None),
    "alt":  ("1742-6", "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma", "U/L", "U/L", 7, 46, 6, 29),
    "cr":   ("2160-0", "Creatinine [Mass/volume] in Serum or Plasma", "mg/dL", "mg/dL", 0.7, 1.3, 0.5, 1.0),
    "egfr": ("62238-1", "Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI)", "mL/min/1.73m2", "mL/min/{1.73_m2}", 60, None, None, None),
    "tsh":  ("3016-3", "Thyrotropin [Units/volume] in Serum or Plasma", "mIU/L", "m[IU]/L", 0.4, 4.5, None, None),
    "vitd": ("1989-3", "25-hydroxyvitamin D3 [Mass/volume] in Serum or Plasma", "ng/mL", "ng/mL", 30, 100, None, None),
    "ferr": ("2276-4", "Ferritin [Mass/volume] in Serum or Plasma", "ng/mL", "ng/mL", 38, 380, 16, 232),
    "hgb":  ("718-7", "Hemoglobin [Mass/volume] in Blood", "g/dL", "g/dL", 13.2, 17.1, 11.7, 15.5),
    "uric": ("3084-1", "Urate [Mass/volume] in Serum or Plasma", "mg/dL", "mg/dL", 4.0, 8.0, 2.5, 7.0),
}

# Synthea codes that measure the same analyte as a storyline code (its LDL is direct, its glucose is
# non-fasting, its eGFR uses an older LOINC). Personas' Synthea results under these codes are re-valued too.
ANALYTE_ALIASES = {
    "18262-6": "ldl",
    "2339-0": "glu", "2345-7": "glu",
    "33914-3": "egfr",
    "38483-4": "cr",
}

# Lab reports grouping the anchor results, as a clinic orders them.
PANELS = {
    "lipid": ("57698-3", "Lipid panel with direct LDL - Serum or Plasma", ["tc", "ldl", "hdl", "tg"]),
    "cmp":   ("24323-8", "Comprehensive metabolic panel - Serum or Plasma", ["glu", "alt", "cr", "egfr"]),
    "a1c":   ("4548-4", "Hemoglobin A1c/Hemoglobin.total in Blood", ["a1c"]),
    "thy":   ("3016-3", "Thyrotropin [Units/volume] in Serum or Plasma", ["tsh"]),
    "vitd":  ("1989-3", "25-hydroxyvitamin D3 [Mass/volume] in Serum or Plasma", ["vitd"]),
    "iron":  ("24360-0", "Hemoglobin and Hematocrit panel - Blood", ["ferr", "hgb"]),
    "uric":  ("3084-1", "Urate [Mass/volume] in Serum or Plasma", ["uric"]),
}

# Vital signs the storyline sets (Synthea's are re-valued on personas, like labs).
VITAL_CODES = {"bp": "85354-9", "bmi": "39156-5", "weight": "29463-7"}

# Synthea conditions and medications a persona may keep: acute, self-limited background that does
# not compete with the story. Everything chronic comes from the storyline.
PERSONA_KEEP_CONDITIONS = ["Viral sinusitis", "Acute viral pharyngitis", "Acute bronchitis", "Gingivitis",
                           "Dental caries", "Sprain", "Laceration", "Otitis media", "Streptococcal sore throat",
                           "Impacted molars", "Fracture"]
PERSONA_KEEP_MEDICATIONS = ["Amoxicillin", "Penicillin V", "Acetaminophen 325 MG Oral Tablet",
                            "Acetaminophen 500 MG Oral Tablet", "Dextromethorphan", "cetirizine", "Loratadine",
                            "Fexofenadine"]

WELL = ("185349003", "Encounter for check up (procedure)")
FOLLOW_UP = ("390906007", "Follow-up encounter (procedure)")

SNOMED = "http://snomed.info/sct"
RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm"
ICD10 = "http://hl7.org/fhir/sid/icd-10-cm"

PERSONAS = [
    # ── Cerner ────────────────────────────────────────────────────────────────────────────────
    {
        "ehr": "cerner",
        "synthea_base": "304a8be5",           # Synthea patient id prefix (seed 20261, v4.0.0)
        "id": "p-daniel-reyes",
        "mrn": "MRN-100234",
        "given": ["Daniel", "J."], "family": "Reyes", "gender": "male", "birthDate": "1974-03-12",
        "smoking": ("8517006", "Ex-smoker (finding)"),
        "baseline": {"hgb": 15.0},
        "summary": "Silent cardiometabolic drift: LDL-C, HbA1c, glucose and ALT rising for three years; "
                   "father's MI at 54; started lisinopril.",
        "visits": [
            {"date": "2023-11-14", "type": WELL, "reason": "Annual preventive visit",
             "labs": dict(tc=206, ldl=128, hdl=46, tg=160, a1c=5.5, glu=96, alt=28, cr=0.98, egfr=92),
             "panels": ["lipid", "cmp", "a1c"], "vitals": (132, 84, 28.4, 88.2),
             "note": ("Annual preventive visit",
                      "52M, financial analyst, presents for annual exam. Feels well. Sleeps ~6 h; sits most of "
                      "the day, walks on weekends. Former smoker, quit 2009 (10 pack-years). 2-3 drinks/week.\n"
                      "FH: father MI at 54 (survived, CABG), mother HTN.\n"
                      "Exam: BP 132/84, BMI 28.4. Otherwise unremarkable.\n"
                      "A/P: LDL 128 — discussed CV risk given premature family history; patient prefers "
                      "lifestyle changes before statin. Elevated BP without diagnosis — recheck. Labs in 1 year.")},
            {"date": "2024-11-19", "type": WELL, "reason": "Annual preventive visit",
             "labs": dict(tc=218, ldl=139, hdl=43, tg=182, a1c=5.7, glu=101, alt=34, cr=1.01, egfr=88),
             "panels": ["lipid", "cmp", "a1c"], "vitals": (138, 88, 29.1, 90.4),
             "note": ("Annual preventive visit",
                      "Weight up 2 kg. Lifestyle changes not sustained (new role, travel). Denies chest pain, "
                      "dyspnea, claudication.\n"
                      "BP 138/88 on repeat; home readings 135-140/85-90.\n"
                      "A/P: Essential hypertension — start lisinopril 10 mg daily. LDL 139 and rising, HbA1c 5.7 "
                      "(prediabetes range threshold). Again declined statin; agreed to revisit next year. "
                      "Consider advanced lipid testing (ApoB, Lp(a)) given family history.")},
            {"date": "2025-02-11", "type": FOLLOW_UP, "reason": "Blood pressure follow-up after starting lisinopril",
             "labs": {}, "panels": [], "vitals": (128, 80, None, 90.8),
             "note": ("Hypertension follow-up",
                      "Tolerating lisinopril, no cough. Home BP 125-130/78-82. Continue current dose.")},
            {"date": "2025-10-28", "type": WELL, "reason": "Annual preventive visit",
             "labs": dict(tc=233, ldl=152, hdl=41, tg=198, a1c=5.9, glu=106, alt=41, cr=1.03, egfr=86),
             "panels": ["lipid", "cmp", "a1c"], "vitals": (134, 82, 29.6, 91.9),
             "note": ("Annual preventive visit",
                      "Reports afternoon fatigue and more central weight gain. Snores per partner; no witnessed "
                      "apneas. Exercise sporadic.\n"
                      "BP 134/82 on lisinopril, BMI 29.6.\n"
                      "A/P: Third consecutive rise in LDL-C, HbA1c and fasting glucose; ALT up to 41. Pattern "
                      "suggests progressing insulin resistance. Referred to longevity program for comprehensive "
                      "risk assessment (ApoB, Lp(a), hs-CRP, insulin) before deciding on pharmacotherapy.")},
        ],
        "conditions": [
            ("55822004", "E78.5", "Hyperlipidemia (disorder)", "2023-11-14", "active"),
            ("59621000", "I10", "Essential hypertension (disorder)", "2024-11-19", "active"),
        ],
        "medications": [
            {"rxnorm": "314076", "display": "lisinopril 10 MG Oral Tablet", "start": "2024-11-19",
             "status": "active", "dosage": "10 mg by mouth once daily", "kind": "request"},
        ],
        "allergies": [
            {"system": RXNORM, "code": "10831", "display": "Sulfamethoxazole / Trimethoprim", "category": "medication",
             "criticality": "low", "recorded": "2012-06-04",
             "reactions": [("247472004", "Wheal (finding)", "mild"), ("271807003", "Eruption of skin (disorder)", "moderate")]},
        ],
        "family_history": [
            {"relationship": ("FTH", "father"), "sex": "male",
             "conditions": [("22298006", "Myocardial infarction (disorder)", 54)]},
            {"relationship": ("MTH", "mother"), "sex": "female",
             "conditions": [("59621000", "Essential hypertension (disorder)", 61)]},
        ],
    },
    {
        "ehr": "cerner",
        "synthea_base": "e3e8044a",
        "id": "p-priya-nair",
        "mrn": "MRN-100587",
        "given": ["Priya"], "family": "Nair", "gender": "female", "birthDate": "1979-08-22",
        "smoking": ("266919005", "Never smoked tobacco (finding)"),
        "summary": "Treated hypothyroidism with iron stores falling again (iron-deficiency anaemia treated in 2019).",
        "visits": [
            {"date": "2023-10-24", "type": WELL, "reason": "Annual preventive visit",
             "labs": dict(tc=188, ldl=112, hdl=62, tg=98, a1c=5.3, glu=88, alt=19, cr=0.71, egfr=101, tsh=3.8, vitd=18, ferr=22, hgb=12.9),
             "panels": ["lipid", "cmp", "a1c", "thy", "vitd", "iron"], "vitals": (118, 74, 23.1, 63.0),
             "note": ("Annual preventive visit",
                      "44F, software engineer. Hypothyroidism on levothyroxine 75 mcg since 2021. Mild fatigue. "
                      "Vegetarian for 10 years. Menses regular, somewhat heavy.\n"
                      "History: iron-deficiency anaemia 2019, treated with ferrous sulfate x 4 months.\n"
                      "A/P: TSH 3.8 — high-normal, continue dose. Vitamin D 18 — start D3 2000 IU. Ferritin 22, "
                      "low-normal; dietary counselling on iron sources.")},
            {"date": "2024-10-15", "type": WELL, "reason": "Annual preventive visit",
             "labs": dict(tc=192, ldl=118, hdl=60, tg=104, a1c=5.3, glu=90, alt=21, cr=0.72, egfr=99, tsh=2.9, vitd=24, ferr=18, hgb=12.5),
             "panels": ["lipid", "cmp", "a1c", "thy", "vitd", "iron"], "vitals": (116, 72, 23.4, 63.8),
             "note": ("Annual preventive visit",
                      "Fatigue persists, worse mid-afternoon. Some hair shedding. Reports heavier periods over the "
                      "past year (soaking through in 2 h on day 2).\n"
                      "A/P: TSH 2.9 on current dose. Ferritin trending down (22 → 18). Gynecology referral offered "
                      "for menorrhagia — patient will consider. Recheck in 1 year.")},
            {"date": "2025-10-07", "type": WELL, "reason": "Annual preventive visit",
             "labs": dict(tc=196, ldl=121, hdl=61, tg=101, a1c=5.4, glu=91, alt=20, cr=0.74, egfr=98, tsh=2.4, vitd=31, ferr=15, hgb=12.1),
             "panels": ["lipid", "cmp", "a1c", "thy", "vitd", "iron"], "vitals": (114, 72, 23.2, 63.4),
             "note": ("Annual preventive visit",
                      "Exercise tolerance down — breathless on stairs. Craves ice. Did not see gynecology.\n"
                      "A/P: Ferritin 15 (third consecutive fall), Hb 12.1 trending down. TSH well controlled. "
                      "Vitamin D now replete. Referred to longevity program; consider full iron studies and "
                      "evaluation of menstrual losses.")},
        ],
        "conditions": [
            ("40930008", "E03.9", "Hypothyroidism (disorder)", "2021-04-02", "active"),
            ("87522002", "D50.9", "Iron deficiency anemia (disorder)", "2019-05-14", "resolved"),
        ],
        "medications": [
            {"rxnorm": "966222", "display": "Levothyroxine Sodium 0.075 MG Oral Tablet", "start": "2021-04-02",
             "status": "active", "dosage": "75 mcg by mouth every morning", "kind": "request"},
            {"rxnorm": "310325", "display": "ferrous sulfate 325 MG Oral Tablet", "start": "2019-05-14",
             "end": "2019-09-20", "status": "completed", "dosage": "325 mg by mouth once daily", "kind": "request"},
        ],
        "allergies": [
            {"system": SNOMED, "code": "735029006", "display": "Shellfish (substance)", "category": "food",
             "criticality": "high", "recorded": "2008-03-17",
             "reactions": [("39579001", "Anaphylaxis (disorder)", "severe"), ("247472004", "Wheal (finding)", "moderate")]},
        ],
        "family_history": [
            {"relationship": ("MTH", "mother"), "sex": "female",
             "conditions": [("40930008", "Hypothyroidism (disorder)", 38)]},
        ],
    },
    # ── Athena ────────────────────────────────────────────────────────────────────────────────
    {
        "ehr": "athena",
        "synthea_base": "0dba3c9a",
        "id": "p-marcus-bell",
        "mrn": "ATH-40912",
        "given": ["Marcus"], "family": "Bell", "gender": "male", "birthDate": "1961-01-05",
        "smoking": ("266919005", "Never smoked tobacco (finding)"),
        "baseline": {"hgb": 14.8},
        "summary": "Healthy control: a sparse record with nothing to escalate.",
        "visits": [
            {"date": "2025-06-03", "type": WELL, "reason": "Annual preventive visit",
             "labs": dict(tc=182, ldl=104, hdl=58, tg=101, a1c=5.4, glu=92, alt=22, cr=1.02, egfr=84),
             "panels": ["lipid", "cmp", "a1c"], "vitals": (122, 76, 24.8, 79.5),
             "note": ("Annual preventive visit",
                      "64M, retired teacher. Runs 3x/week, plays tennis. No complaints. Never smoker.\n"
                      "A/P: Healthy adult. Labs unremarkable. Continue current habits; routine screening up to date.")},
        ],
        "conditions": [],
        "medications": [],
        "allergies": [
            {"system": SNOMED, "code": "256277009", "display": "Grass pollen (substance)", "category": "environment",
             "criticality": "low", "recorded": "1998-05-02", "reactions": [("878820003", "Rhinoconjunctivitis (disorder)", "mild")]},
        ],
        "family_history": [],
    },
    {
        "ehr": "athena",
        "synthea_base": "64d00bd1",
        "id": "p-sofia-alvarez",
        "mrn": "ATH-41377",
        "given": ["Sofia", "M."], "family": "Alvarez", "gender": "female", "birthDate": "1968-02-09",
        "smoking": ("266919005", "Never smoked tobacco (finding)"),
        "baseline": {"hgb": 13.3},
        "summary": "Kidney function sliding (eGFR 88 → 79 → 71) and ALT rising while taking OTC ibuprofen daily "
                   "on top of hydrochlorothiazide — despite a recorded aspirin allergy with angioedema.",
        "visits": [
            {"date": "2023-12-05", "type": WELL, "reason": "Annual preventive visit",
             "labs": dict(tc=214, ldl=128, hdl=52, tg=150, a1c=5.6, glu=97, alt=24, cr=0.78, egfr=88, vitd=26),
             "panels": ["lipid", "cmp", "a1c", "vitd"], "vitals": (136, 86, 29.0, 77.1),
             "note": ("Annual preventive visit",
                      "55F, school administrator. Right knee pain for ~2 years, worse on stairs; X-ray 2022 showed "
                      "medial compartment osteoarthritis. Manages with OTC ibuprofen.\n"
                      "Hypertension on hydrochlorothiazide 25 mg. Postmenopausal since 51; weight up ~6 kg since.\n"
                      "Alcohol: 1-2 glasses of wine most evenings.\n"
                      "A/P: BP above goal — reinforce salt reduction. Knee: physio referral; limit NSAIDs.")},
            {"date": "2024-11-26", "type": WELL, "reason": "Annual preventive visit",
             "labs": dict(tc=221, ldl=133, hdl=49, tg=168, a1c=5.7, glu=100, alt=33, cr=0.88, egfr=79, uric=6.6),
             "panels": ["lipid", "cmp", "a1c", "uric"], "vitals": (134, 84, 30.4, 80.8),
             "note": ("Annual preventive visit",
                      "Did not attend physio. Knee pain unchanged; now taking ibuprofen 400 mg two to three times "
                      "daily most days. Occasional ankle swelling in the evening.\n"
                      "A/P: eGFR 79 (from 88). ALT 33. Advised to reduce ibuprofen; trial of topical diclofenac "
                      "offered. Recheck renal function in 1 year.")},
            {"date": "2025-11-18", "type": WELL, "reason": "Annual preventive visit",
             "labs": dict(tc=226, ldl=137, hdl=47, tg=181, a1c=5.8, glu=103, alt=41, cr=0.97, egfr=71),
             "panels": ["lipid", "cmp", "a1c"], "vitals": (138, 88, 31.2, 82.9),
             "note": ("Annual preventive visit",
                      "Still using ibuprofen daily; did not fill the topical prescription. More tired. Wine "
                      "unchanged.\n"
                      "A/P: eGFR 71 — third consecutive fall. ALT 41 and triglycerides rising with weight. "
                      "Possible NSAID nephropathy on a thiazide, and metabolic liver disease. Referred to longevity "
                      "program for kidney and metabolic evaluation.")},
        ],
        "conditions": [
            ("59621000", "I10", "Essential hypertension (disorder)", "2019-03-12", "active"),
            ("239873007", "M17.11", "Osteoarthritis of knee (disorder)", "2022-04-21", "active"),
        ],
        "medications": [
            {"rxnorm": "310798", "display": "Hydrochlorothiazide 25 MG Oral Tablet", "start": "2019-03-12",
             "status": "active", "dosage": "25 mg by mouth once daily", "kind": "request"},
            {"rxnorm": "206905", "display": "Ibuprofen 400 MG Oral Tablet [Ibu]", "start": "2022-05-01",
             "status": "active", "dosage": "400 mg by mouth two to three times daily as needed for knee pain (OTC, patient reported)",
             "kind": "statement"},
        ],
        "allergies": [
            {"system": RXNORM, "code": "1191", "display": "Aspirin", "category": "medication",
             "criticality": "high", "recorded": "2004-09-30",
             "reactions": [("402387002", "Allergic angioedema (disorder)", "severe"), ("247472004", "Wheal (finding)", "moderate")]},
        ],
        "family_history": [
            {"relationship": ("MTH", "mother"), "sex": "female",
             "conditions": [("44054006", "Diabetes mellitus type 2 (disorder)", 60)]},
        ],
    },
]
