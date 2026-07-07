# + id - FHIR Patient id
# + name - display name extracted from the Patient resource
public type Patient record {|
    string id;
    string name;
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

# + questionnaire - the converted questionnaire to render as chat
# + callbackUrl - where whatsapp-simulator should POST the completed transcript
# + patientId - the FHIR Patient id this session is for
# + patientName - display name for the patient, shown in the chat
public type CreateSessionRequest record {|
    WhatsappQuestionnaire questionnaire;
    string callbackUrl;
    string patientId;
    string patientName;
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
    string role;
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

# + patientId - the FHIR Patient id this session is for
# + patientName - display name for the patient
# + questionnaire - the original FHIR Questionnaire resource, kept so the transcript
#   callback can rebuild a QuestionnaireResponse against the same linkIds
# + emergency - whether this session was generated for an ML-flagged emergency case
# + mlProbability - the heart-risk-service probability that triggered this session, if emergency
public type GeneratedSession record {|
    string patientId;
    string patientName;
    json questionnaire;
    boolean emergency = false;
    float? mlProbability = ();
|};

# + mlProbability - the escalation probability care-loop-analysis-service's ML model produced
public type EmergencyContext record {|
    float mlProbability;
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
public type EmergencyAnswersNotification record {|
    string patientId;
    EmergencyAnswer[] answers;
|};
