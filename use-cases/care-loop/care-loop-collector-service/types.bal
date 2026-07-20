# + id - FHIR Patient id
# + name - display name extracted from the Patient resource
public type Patient record {|
    string id;
    string name;
|};

# The 11 Kaggle heart-failure features. age/sex/maxHr are always known; the rest are prefilled from
# FHIR (by analysis-service) or gathered in the live chat. A non-nil value is locked and never asked.
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

# + patientId - FHIR Patient id to draft a questionnaire for
public type AiQuestionnaireRequest record {|
    string patientId;
|};

# + questionnaire - the drafted FHIR Questionnaire resource, with no answers filled in
public type AiQuestionnaireResponse record {|
    json questionnaire;
|};

# + id - the linkId of the questionnaire item
# + text - the question text
public type WhatsappQuestion record {|
    string id;
    string text;
|};

# + title - the questionnaire title shown in the chat
# + questions - the flattened list of questions
public type WhatsappQuestionnaire record {|
    string title;
    WhatsappQuestion[] questions;
|};

# + turnUrl - where whatsapp-simulator should POST each patient message for a live session
public type LiveConfig record {|
    string turnUrl;
|};

# + questionnaire - the converted questionnaire to render as chat
# + callbackUrl - where whatsapp-simulator should POST the completed transcript
# + patientId - the FHIR Patient id this session is for
# + patientName - display name for the patient, shown in the chat
# + live - present for a turn-by-turn live session; drives whatsapp-simulator's live mode
public type CreateSessionRequest record {|
    WhatsappQuestionnaire questionnaire;
    string callbackUrl;
    string patientId;
    string patientName;
    LiveConfig live?;
|};

# + id - the session id assigned by whatsapp-simulator
# + path - the relative chat path
# + url - the absolute chat url
public type CreateSessionResponse record {|
    string id;
    string path;
    string url;
|};

# + patientId - the FHIR Patient id the session was generated for
# + patientName - display name used in the chat
# + sessionId - the whatsapp-simulator session id, if created successfully
# + path - the relative chat path, if created successfully
# + error - what went wrong, if generation or session creation failed
public type GenerateResult record {|
    string patientId;
    string patientName;
    string sessionId?;
    string path?;
    string 'error?;
|};

# + results - one entry per patient found in the FHIR server
public type GenerateResponse record {|
    GenerateResult[] results;
|};

# + questionId - the linkId of the question being answered
# + questionText - the question text at the time it was asked
public type ReplyRef record {|
    string questionId;
    string questionText;
|};

# + role - who sent the message
# + text - the message text
# + time - ISO timestamp the message was sent
# + questionId - the linkId this message answers, if any
# + replyTo - the question this message is replying to, if any
public type ChatMessage record {|
    MessageRole role;
    string text;
    string time;
    string questionId?;
    ReplyRef replyTo?;
|};

# + sessionId - the whatsapp-simulator session id
# + title - the questionnaire title
# + messages - the full chat transcript
public type TranscriptCallback record {|
    string sessionId;
    string title;
    ChatMessage[] messages;
|};

# + saved - whether the QuestionnaireResponse was saved to the FHIR server
# + fhirId - the id FHIR assigned to the saved QuestionnaireResponse
public type TranscriptSavedResponse record {|
    boolean saved;
    string fhirId?;
|};

# + id - the questionnaire item's linkId
# + text - the question text as asked
# + target - which slot/topic the question addressed (from the agent), for traceability
# + answer - the patient's reply, () until answered
public type AskedQuestion record {|
    string id;
    string text;
    string target;
    string? answer = ();
|};

# + patientId - the FHIR Patient id this session is for
# + patientName - display name for the patient
# + questionnaire - the original FHIR Questionnaire resource for scripted sessions, kept so the
#   transcript callback can rebuild a QuestionnaireResponse against the same linkIds; unused (empty)
#   for live sessions, which build their Questionnaire from `asked`
# + emergency - whether this session was generated for an ML-flagged emergency case
# + mlProbability - the heart-risk-service probability that triggered this session, if emergency
# + live - whether this is a turn-by-turn adaptive session driven by /turns
# + slots - the running feature set (FHIR prefill + chat extraction) for a live session
# + asked - the questions asked so far in a live session, with answers as they arrive
# + pendingQuestionId - the linkId of the question awaiting an answer in a live session
# + finalized - whether this live session has been finalized (single-writer guard against
#   double-processing between /turns, /transcripts, and the timeout claim)
# + checkInComplete - true once the clinical check-in has finished and escalation has fired;
#   the session stays live afterward for open-ended patient questions
public type GeneratedSession record {|
    string patientId;
    string patientName;
    json questionnaire;
    boolean emergency = false;
    float? mlProbability = ();
    boolean live = false;
    FeatureSlots? slots = ();
    AskedQuestion[] asked = [];
    string? pendingQuestionId = ();
    boolean finalized = false;
    boolean checkInComplete = false;
|};

# + mlProbability - the escalation probability care-loop-analysis-service's ML model produced
# + slots - the FHIR-prefilled feature set, so the live chat only asks for the genuine gaps
public type EmergencyContext record {|
    float mlProbability;
    FeatureSlots slots;
|};

# One turn of the live check-in, as posted by whatsapp-simulator.
#
# + sessionId - the whatsapp-simulator session id
# + text - the patient's message
# + time - ISO timestamp the message was sent, if provided
public type TurnCallback record {|
    string sessionId;
    string text;
    string? time = ();
|};

# A bot message to render in the chat.
#
# + text - the message text
# + questionId - the linkId this message is asking, if it is a question
public type BotMessage record {|
    string text;
    string? questionId = ();
|};

# The collector's reply to one live turn.
#
# + done - kept for wire compatibility; the live turn handler always returns false so the chat
#   stays open for open-ended patient questions after the clinical check-in finishes
# + botMessages - the bot bubbles to render (a reply, the next question, and/or the closing message)
public type TurnReply record {|
    boolean done;
    BotMessage[] botMessages;
|};

# The collector's reply to a timeout claim from analysis-service.
#
# + found - true if an unfinalized live session was handed over
# + slots - the feature set enriched by whatever the patient answered before timing out
# + answers - the partial question/answer pairs gathered before timeout
public type ClaimResponse record {|
    boolean found;
    FeatureSlots? slots = ();
    EmergencyAnswer[] answers = [];
|};

# The interview agent turn request sent to care-loop-ai-service.
#
# + patientId - FHIR Patient id, used to isolate agent memory per patient
# + patientName - patient display name
# + slots - what is already known; a non-nil slot is locked
# + answered - question/answer pairs already completed in this chat
# + currentQuestion - the question just answered, () on the opening turn
# + currentAnswer - the patient's latest reply, () on the opening turn
# + questionsAsked - how many questions have been asked so far
# + questionsRemaining - authoritative remaining budget
# + checkInComplete - true once the clinical check-in has already finished; tells the agent
#   to stop asking clinical questions and only reply to currentAnswer
public type AiConversationTurnRequest record {|
    string patientId;
    string patientName;
    FeatureSlots slots;
    EmergencyAnswer[] answered;
    string? currentQuestion = ();
    string? currentAnswer = ();
    int questionsAsked;
    int questionsRemaining;
    boolean checkInComplete = false;
|};

# Slot values the agent extracted from the latest answer (the only slots chat may fill).
#
# + chestPainType - chest pain type
# + exerciseAngina - exercise-induced angina
# + restingBp - systolic reading from a recent home blood-pressure measurement
public type AiSlotUpdates record {|
    "TA"|"ATA"|"NAP"|"ASY"? chestPainType = ();
    "Y"|"N"? exerciseAngina = ();
    float? restingBp = ();
|};

# The interview agent's decision for one turn.
#
# + updated_slots - slot values extracted this turn
# + answer_assessment - "ok" | "unclear" | "refused", informational
# + done - true when the check-in should end
# + next_question - the single next question, () when done
# + next_question_target - which slot/topic the next question addresses
# + closing_message - the warm closing line, set only when done
# + reply - a short free-form answer or acknowledgement to currentAnswer, () when there is
#   nothing to say beyond the next question
public type AiConversationTurnResponse record {|
    AiSlotUpdates updated_slots = {};
    string? answer_assessment = ();
    boolean done;
    string? next_question = ();
    string? next_question_target = ();
    string? closing_message = ();
    string? reply = ();
|};

# + emergencyContext - present when this generation was triggered by an ML escalation, absent otherwise
public type GenerateRequestBody record {|
    EmergencyContext? emergencyContext = ();
|};

# + question - the question text as asked in the chat
# + answer - the patient's answer text
public type EmergencyAnswer record {|
    string question;
    string answer;
|};

# + patientId - the FHIR Patient id these answers are for
# + answers - the flattened question/answer pairs from the emergency questionnaire transcript
# + questionnaireResponseId - the FHIR id of the QuestionnaireResponse just saved, so analysis-service
#   can reference it from the Task it builds if this escalates; () for live sessions, which don't yet
#   thread a saved QuestionnaireResponse id through to this notification
# + slots - the chat-enriched feature set, so analysis-service can re-score /predict
public type EmergencyAnswersNotification record {|
    string patientId;
    EmergencyAnswer[] answers;
    string? questionnaireResponseId = ();
    FeatureSlots? slots = ();
|};

public enum MessageRole {
    BOT = "bot",
    USER = "user"
}
