import care_loop/care_loop_common as common;

# + patientId - the FHIR Patient id whose vitals were just forwarded
public type VitalsReadyRequest record {|
    string patientId;
|};

# The 11 Kaggle heart-failure features care-loop-heart-risk-service scores. age/sex/maxHr are
# always known; the rest are prefilled from FHIR or gathered in the check-in chat, and left nil
# (missing) otherwise. A non-nil value is authoritative and is never overwritten by chat extraction.
#
# + age - age in years
# + sex - biological sex
# + maxHr - maximum heart rate in bpm
# + restingBp - resting systolic blood pressure in mmHg
# + cholesterol - serum cholesterol in mg/dL
# + fastingBs - 1 if fasting blood sugar > 120 mg/dL, else 0
# + restingEcg - resting ECG result
# + chestPainType - chest pain type (TA/ATA/NAP/ASY)
# + exerciseAngina - exercise-induced angina
# + oldpeak - ST depression induced by exercise relative to rest
# + stSlope - slope of the peak exercise ST segment
public type FeatureSlots record {|
    float age;
    "M"|"F" sex;
    float maxHr;
    float? restingBp = ();
    float? cholesterol = ();
    int? fastingBs = ();
    "Normal"|"ST"|"LVH"? restingEcg = ();
    "TA"|"ATA"|"NAP"|"ASY"? chestPainType = ();
    "Y"|"N"? exerciseAngina = ();
    float? oldpeak = ();
    "Up"|"Flat"|"Down"? stSlope = ();
|};

# The heart-risk-service /predict request. age/sex/max_hr are required; the eight clinical features
# are optional (nil serializes as missing, which the service imputes). Field names are snake_case
# to match the FastAPI schema, and categorical spellings match the Kaggle dataset exactly.
#
# + age - age in years, 0-120
# + sex - biological sex
# + max_hr - maximum heart rate in bpm, 40-240
# + chest_pain_type - chest pain type
# + resting_bp - resting systolic blood pressure in mmHg
# + cholesterol - serum cholesterol in mg/dL
# + fasting_bs - 1 if fasting blood sugar > 120 mg/dL, else 0
# + resting_ecg - resting ECG result
# + exercise_angina - exercise-induced angina
# + oldpeak - ST depression induced by exercise relative to rest
# + st_slope - slope of the peak exercise ST segment
public type HeartRiskRequest record {|
    float age;
    "M"|"F" sex;
    float max_hr;
    "TA"|"ATA"|"NAP"|"ASY"? chest_pain_type = ();
    float? resting_bp = ();
    float? cholesterol = ();
    int? fasting_bs = ();
    "Normal"|"ST"|"LVH"? resting_ecg = ();
    "Y"|"N"? exercise_angina = ();
    float? oldpeak = ();
    "Up"|"Flat"|"Down"? st_slope = ();
|};

# + probability - P(heart disease) in [0, 1]
# + prediction - 1 if probability >= threshold, else 0
# + threshold - heart-risk-service's own model-classification threshold, not analysis-service's escalation policy
# + selected_model - name of the model behind the exported ONNX graph
public type HeartRiskResponse record {|
    float probability;
    int prediction;
    float threshold;
    string selected_model;
|};

# + mlProbability - the ML escalation probability that triggered the emergency questionnaire
# + slots - the FHIR-prefilled feature set, so the collector's live chat only asks for the gaps
public type EmergencyContext record {|
    float mlProbability;
    FeatureSlots slots;
|};

# + emergencyContext - present when this generation was triggered by an ML escalation, so the resulting GeneratedSession can be looked up by /transcripts later
public type GenerateRequest record {|
    EmergencyContext emergencyContext?;
|};

# + question - the question text asked
# + answer - the patient's answer
public type QuestionAnswer record {|
    string question;
    string answer;
|};

# + patientId - the FHIR Patient id the answers belong to
# + answers - flattened question/answer pairs from the emergency questionnaire transcript
# + questionnaireResponseId - the FHIR id of the QuestionnaireResponse these answers were saved as, so the Task built on escalation can reference it; defaulted so pre-existing {patientId, answers} payloads still bind
# + slots - the feature set enriched with anything the chat gathered (chest pain, home BP, etc.),
#   used to re-score /predict; nil falls back to the pending case's FHIR-prefilled slots
public type EmergencyAnswersRequest record {|
    string patientId;
    QuestionAnswer[] answers;
    string? questionnaireResponseId = ();
    FeatureSlots? slots = ();
|};

# + patientId - the FHIR Patient id being assessed
# + mlProbability - the heart-risk-service probability that triggered this assessment
# + answers - the patient's emergency-questionnaire answers
# + slots - the structured feature set the ML model scored, for the agent's context
public type AiRiskAssessmentRequest record {|
    string patientId;
    float mlProbability;
    QuestionAnswer[] answers;
    FeatureSlots? slots = ();
|};

# The result of claiming a still-pending live conversation from the collector at timeout.
#
# + found - true if the collector had an unfinalized live session it could hand over
# + slots - the feature set enriched by whatever the patient answered before timing out
# + answers - the partial question/answer pairs gathered before timeout
public type ClaimResponse record {|
    boolean found;
    FeatureSlots? slots = ();
    QuestionAnswer[] answers = [];
|};

# + probability - the agent's own assessed probability, 0-1
# + risk - the agent's own assessed risk level
# + reasoning - the agent's own plain-language explanation
# + referencedResources - "Observation/{id}" resources the agent says it actually consulted
public type AiRiskAssessmentResponse record {|
    float probability;
    common:RiskLevel risk;
    string reasoning;
    string[] referencedResources;
|};

# + patientId - the FHIR Patient id the Task is for
# + mlProbability - the heart-risk-service probability that triggered this assessment
# + answers - the patient's emergency-questionnaire answers
# + display - the patient's name/age/sex
# + agentic - the already-computed risk assessment to narrate
public type TaskDescriptionRequest record {|
    string patientId;
    float mlProbability;
    QuestionAnswer[] answers;
    PatientDisplay display;
    AiRiskAssessmentResponse agentic;
|};

# + description - ready-to-use Task.description narrative
public type TaskDescriptionResponse record {|
    string description;
|};

# + heartRisk - the heart-risk-service response that triggered escalation
# + observationRefs - "Observation/{id}" references for the vitals used to compute max_hr
# + display - the patient's name/age/sex, fetched once at escalation time so the Task built
#   later doesn't need to re-fetch the Patient resource
# + slots - the FHIR-prefilled feature set at escalation time, used to re-score /predict if the
#   chat is never answered (timeout path)
public type PendingCase record {|
    HeartRiskResponse heartRisk;
    string[] observationRefs;
    PatientDisplay display;
    FeatureSlots slots;
|};

public enum VitalsBand {
    ELEVATED = "elevated",
    NORMAL = "normal"
}
