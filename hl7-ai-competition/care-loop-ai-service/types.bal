import care_loop/care_loop_common as common;

# + patientId - FHIR Patient id to draft a questionnaire for
public type QuestionnaireRequest record {|
    string patientId;
|};

# + questionnaire - the drafted FHIR Questionnaire resource, with no answers filled in
public type QuestionnaireResponse record {|
    json questionnaire;
|};

# + question - the questionnaire item's text
# + answer - the patient's reply to that question
public type QuestionAnswer record {|
    string question;
    string answer;
|};

# The 11 Kaggle heart-failure features care-loop-heart-risk-service scores. age/sex/maxHr are
# always known; the rest are prefilled from the patient's FHIR record or gathered in the check-in
# chat, and left nil (missing) otherwise. A non-nil value is authoritative.
#
# + age - age in years
# + sex - biological sex
# + maxHr - maximum heart rate in bpm
# + restingBp - resting systolic blood pressure in mmHg
# + cholesterol - serum cholesterol in mg/dL
# + fastingBs - 1 if fasting blood sugar > 120 mg/dL, else 0
# + restingEcg - resting ECG result
# + chestPainType - chest pain type (TA typical, ATA atypical, NAP non-anginal, ASY asymptomatic)
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

# One turn of the adaptive patient check-in. The collector owns all session state and sends the
# full (small) history each turn; the agent is stateless and returns slot deltas + the next question.
#
# + patientId - FHIR Patient id, used to isolate agent memory per patient
# + patientName - patient display name (first name is enough for a warm tone)
# + slots - what is already known; a non-nil slot is locked and must not be asked about
# + answered - question/answer pairs already completed in this chat, in order
# + currentQuestion - the question just answered, () on the opening turn
# + currentAnswer - the patient's latest reply, () on the opening turn
# + questionsAsked - how many questions have been asked so far
# + questionsRemaining - authoritative remaining budget; 0 means the agent must finish
# + checkInComplete - true once the clinical check-in has already finished; the agent must not
#   ask any more clinical questions and should only reply to currentAnswer, if anything
public type ConversationTurnRequest record {|
    string patientId;
    string patientName;
    FeatureSlots slots;
    QuestionAnswer[] answered;
    string? currentQuestion = ();
    string? currentAnswer = ();
    int questionsAsked;
    int questionsRemaining;
    boolean checkInComplete = false;
|};

# The only slots the chat may ever fill. Closed on purpose: if the model tries to fill a
# FHIR-only slot (e.g. oldpeak), cloneWithType fails and the turn falls into the error path
# instead of silently accepting an invented value.
#
# + chestPainType - chest pain type derived from the patient's own words
# + exerciseAngina - exercise-induced angina derived from the patient's own words
# + restingBp - systolic reading from a recent home blood-pressure measurement
public type SlotUpdates record {|
    "TA"|"ATA"|"NAP"|"ASY"? chestPainType = ();
    "Y"|"N"? exerciseAngina = ();
    float? restingBp = ();
|};

# The agent's decision for one turn.
#
# + updated_slots - slot values extracted from the current answer; empty when nothing was filled
# + answer_assessment - "ok" | "unclear" | "refused", informational
# + done - true when the check-in should end
# + next_question - the single next question to ask, () when done
# + next_question_target - which slot/topic the next question addresses, informational
# + closing_message - the warm closing line to show the patient, set only when done
# + reply - a short free-form answer or acknowledgement to currentAnswer, shown before
#   next_question/closing_message; () when there is nothing to say beyond the next question
public type ConversationTurnResponse record {|
    SlotUpdates updated_slots = {};
    string? answer_assessment = ();
    boolean done;
    string? next_question = ();
    string? next_question_target = ();
    string? closing_message = ();
    string? reply = ();
|};

# + patientName - display name extracted from the Patient resource, falling back to the patientId
# + ageSexSummary - e.g. "68F", for a compact narrative lead-in
public type PatientDisplay record {|
    string patientName;
    string ageSexSummary;
|};

# + patientId - FHIR Patient id to assess
# + mlProbability - probability of a cardiac event from care-loop-heart-risk-service
# + answers - the patient's questionnaire answers
# + slots - the structured feature set the ML model scored, if available; some values come from
#   the patient's record and some from the check-in chat
public type RiskAssessmentRequest record {|
    string patientId;
    float mlProbability;
    QuestionAnswer[] answers;
    FeatureSlots? slots = ();
|};

# + probability - the agent's own assessed probability of a cardiac event, 0-1
# + risk - the agent's own assessed risk level
# + reasoning - plain-language explanation citing the vitals trend, the ML probability, and the answers
# + referencedResources - "Observation/{id}"-style references the agent actually saw in a tool result;
# never a guess - empty if it isn't sure of any real id
public type RiskAssessmentResponse record {|
    float probability;
    common:RiskLevel risk;
    string reasoning;
    string[] referencedResources;
|};

# + patientId - FHIR Patient id the Task is for
# + mlProbability - probability of a cardiac event from care-loop-heart-risk-service
# + answers - the patient's questionnaire answers
# + display - the patient's name/age/sex
# + agentic - the already-computed risk assessment to narrate; call this only once the caller
# knows a Task will actually be created, not on every /risk-assessment response
public type TaskDescriptionRequest record {|
    string patientId;
    float mlProbability;
    QuestionAnswer[] answers;
    PatientDisplay display;
    RiskAssessmentResponse agentic;
|};

# + description - ready-to-use Task.description narrative
public type TaskDescriptionResponse record {|
    string description;
|};
