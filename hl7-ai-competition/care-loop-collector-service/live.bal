import care_loop/care_loop_common as common;
import ballerina/http;
import ballerina/log;
import ballerina/uuid;
import ballerinax/health.clients.fhir;

const string DEFAULT_CLOSE_MESSAGE = "Thank you. Your care team will look everything over and be in touch.";
const string EARLY_CLOSE_MESSAGE = "Thank you. Your care team will be in touch. Take care.";
const string GONE_CLOSE_MESSAGE = "This check-in has already been completed. Thank you.";
const string OPEN_QA_FALLBACK_MESSAGE = "Sorry, I could not get an answer just now. Your care team will follow up if needed.";

# Starts a turn-by-turn adaptive check-in: asks the interview agent for the first question, opens a
# live whatsapp session for it, and records the session so /turns can drive it. Replaces the scripted
# questionnaire for ML-escalated (emergency) cases.
#
# + patient - the patient to check in on
# + emergencyContext - the ML probability and FHIR-prefilled feature slots from analysis-service
# + return - the outcome of starting the conversation
isolated function startLiveConversation(Patient patient, EmergencyContext emergencyContext) returns GenerateResult {
    GenerateResult result = {patientId: patient.id, patientName: patient.name};
    FeatureSlots slots = emergencyContext.slots;

    AiConversationTurnRequest openingTurn = {
        patientId: patient.id,
        patientName: patient.name,
        slots,
        answered: [],
        questionsAsked: 0,
        questionsRemaining: maxQuestionsPerConversation
    };
    AiConversationTurnResponse|http:ClientError turn = aiClient->post("/conversation/turn", openingTurn);
    if turn is http:ClientError {
        result.'error = "failed to start conversation: " + turn.message();
        return result;
    }

    string? firstQuestion = turn.next_question;
    if turn.done || firstQuestion is () {
        // The agent decided nothing needs asking (everything prefilled): hand the features straight
        // to analysis-service so it can score and escalate without a chat.
        notifyEmergencyAnswers(patient.id, [], slots);
        return result;
    }

    notifyDashboard(patient.id, common:QUESTIONNAIRE_DRAFTED, "Live check-in opened for " + patient.name);

    string questionId = uuid:createType4AsString();
    AskedQuestion firstAsked = {id: questionId, text: firstQuestion, target: turn.next_question_target ?: ""};

    CreateSessionRequest sessionRequest = {
        questionnaire: {title: "Care team check-in", questions: [{id: questionId, text: firstQuestion}]},
        callbackUrl: collectorPublicUrl + "/transcripts",
        patientId: patient.id,
        patientName: patient.name,
        live: {turnUrl: collectorPublicUrl + "/turns"}
    };
    anydata|http:ClientError sessionResult = postWithRetry(whatsappClient, "/api/sessions", sessionRequest, CreateSessionResponse);
    if sessionResult is http:ClientError {
        result.'error = "failed to create whatsapp session: " + sessionResult.message();
        return result;
    }
    CreateSessionResponse sessionResponse = <CreateSessionResponse>sessionResult;

    GeneratedSession newSession = {
        patientId: patient.id,
        patientName: patient.name,
        questionnaire: {},
        emergency: true,
        mlProbability: emergencyContext.mlProbability,
        live: true,
        slots,
        asked: [firstAsked],
        pendingQuestionId: questionId,
        finalized: false
    };
    lock {
        generatedSessions[sessionResponse.id] = newSession.cloneReadOnly();
    }

    result.sessionId = sessionResponse.id;
    result.path = sessionResponse.path;
    return result;
}

# Processes one patient message. Before the clinical check-in is complete, this asks the interview
# agent for the next question (or a finish), enforces the question budget, and finalizes exactly
# once when done. After the check-in is complete, the session stays live and every message is
# answered in open Q&A mode instead - see handleClinicalTurn / handleOpenQaTurn. Returns http:Gone
# only for an unknown or non-live session, so whatsapp-simulator closes the chat cleanly in that case.
#
# + callback - the callback containing the session ID and patient's text response to the pending question
# + return - TurnReply|http:Gone
isolated function handleTurn(TurnCallback callback) returns TurnReply|http:Gone {
    GeneratedSession? loaded = loadActiveLiveSession(callback.sessionId);
    if loaded is () {
        return <http:Gone>{};
    }
    // Rebuild into a genuinely mutable value here, outside the lock in loadActiveLiveSession - see
    // that function's doc comment for why .clone() alone is not enough.
    GeneratedSession|error mutableSession = loaded.cloneWithType(GeneratedSession);
    if mutableSession is error {
        return <http:Gone>{};
    }
    GeneratedSession session = mutableSession;

    FeatureSlots? maybeSlots = session.slots;
    if maybeSlots is () {
        return <http:Gone>{};
    }
    FeatureSlots slots = maybeSlots;

    if session.checkInComplete {
        return handleOpenQaTurn(callback, session, slots);
    }
    return handleClinicalTurn(callback, session, slots);
}

# Answers one message once the clinical check-in has already finished and escalation has fired.
# No more slots are extracted and no clinical question is asked - the agent is only asked to reply.
# The chat never closes from here; the returned "done" is always false.
isolated function handleOpenQaTurn(TurnCallback callback, GeneratedSession session, FeatureSlots slots) returns TurnReply {
    AiConversationTurnRequest turnRequest = {
        patientId: session.patientId,
        patientName: session.patientName,
        slots,
        answered: collectLiveAnswers(session),
        currentAnswer: callback.text,
        questionsAsked: session.asked.length(),
        questionsRemaining: 0,
        checkInComplete: true
    };
    AiConversationTurnResponse|error turn = callTurnWithRetry(turnRequest);
    string reply = turn is AiConversationTurnResponse ? (turn.reply ?: OPEN_QA_FALLBACK_MESSAGE) : OPEN_QA_FALLBACK_MESSAGE;
    return {done: false, botMessages: [{text: reply}]};
}

# Runs one turn of the adaptive clinical check-in: records the answer, asks the interview agent for
# the next question (or a finish), enforces the question budget, and finalizes exactly once when
# done - then flips the session into open Q&A mode and keeps the chat live rather than closing it.
isolated function handleClinicalTurn(TurnCallback callback, GeneratedSession session, FeatureSlots slots) returns TurnReply {
    // Record the patient's answer against the pending question and gather the earlier pairs.
    // session.asked can still carry a readonly array from the session's initial cloneReadOnly() at
    // creation (even .clone() does not lift it), so build a fresh array via push() rather than
    // mutating an existing one in place - that would throw InvalidUpdate.
    string? pendingId = session.pendingQuestionId;
    string currentQuestion = "";
    EmergencyAnswer[] answered = [];
    AskedQuestion[] asked = [];
    foreach AskedQuestion question in session.asked {
        if question.id == pendingId {
            currentQuestion = question.text;
            asked.push({id: question.id, text: question.text, target: question.target, answer: callback.text});
        } else {
            string? existing = question.answer;
            if existing is string {
                answered.push({question: question.text, answer: existing});
            }
            asked.push(question);
        }
    }
    session.asked = asked;

    int questionsAsked = asked.length();
    int questionsRemaining = maxQuestionsPerConversation - questionsAsked;

    AiConversationTurnRequest turnRequest = {
        patientId: session.patientId,
        patientName: session.patientName,
        slots,
        answered,
        currentQuestion,
        currentAnswer: callback.text,
        questionsAsked,
        questionsRemaining
    };
    AiConversationTurnResponse|error turn = callTurnWithRetry(turnRequest);
    if turn is error {
        // The agent is unreachable/broken: finalize early with whatever slots we have. Safe because
        // /predict tolerates missing features. The chat stays open in answer-less open Q&A mode.
        session.slots = slots;
        session.pendingQuestionId = ();
        session.checkInComplete = true;
        persistSession(callback.sessionId, session);
        notifyDashboard(session.patientId, common:PATIENT_RESPONDED_VIA_WHATSAPP, "Check-in ended early for " + session.patientName);
        finalizeIfUnclaimed(callback.sessionId);
        return {done: false, botMessages: [{text: EARLY_CLOSE_MESSAGE}]};
    }

    session.slots = mergeSlots(slots, turn.updated_slots);

    BotMessage[] messages = [];
    string? reply = turn.reply;
    if reply is string {
        messages.push({text: reply});
    }

    boolean done = turn.done || questionsAsked >= maxQuestionsPerConversation;
    string? nextQuestion = turn.next_question;
    if !done && nextQuestion is string {
        string nextId = uuid:createType4AsString();
        asked.push({id: nextId, text: nextQuestion, target: turn.next_question_target ?: ""});
        session.asked = asked;
        session.pendingQuestionId = nextId;
        persistSession(callback.sessionId, session);
        messages.push({text: nextQuestion, questionId: nextId});
        return {done: false, botMessages: messages};
    }

    session.pendingQuestionId = ();
    session.checkInComplete = true;
    persistSession(callback.sessionId, session);
    string closing = turn.closing_message ?: DEFAULT_CLOSE_MESSAGE;
    messages.push({text: closing});
    notifyDashboard(session.patientId, common:PATIENT_RESPONDED_VIA_WHATSAPP,
            questionsAsked.toString() + " question(s) answered for " + session.patientName);
    finalizeIfUnclaimed(callback.sessionId);
    return {done: false, botMessages: messages};
}

# Hands a still-pending live session over to analysis-service's timeout watcher: finalizes it and
# returns the partial slots + answers so analysis can run the enriched assessment itself. Does NOT
# notify analysis (the timeout watcher is the caller).
#
# + patientId - the patient whose live session to claim
# + return - the partial slots and answers, or found=false when there is nothing to claim
isolated function claimConversation(string patientId) returns ClaimResponse {
    string? targetSessionId = ();
    lock {
        foreach [string, GeneratedSession] [sessionId, session] in generatedSessions.entries() {
            if session.patientId == patientId && session.live && !session.finalized {
                targetSessionId = sessionId;
            }
        }
    }
    if targetSessionId is () {
        return {found: false};
    }

    GeneratedSession? claimed = claimFinalize(targetSessionId);
    if claimed is () {
        return {found: false};
    }
    persistLiveFhir(targetSessionId, claimed);
    return {found: true, slots: claimed.slots, answers: collectLiveAnswers(claimed)};
}

// Finalizes a live session unless someone else already claimed it, persisting FHIR resources and
// notifying analysis-service of the answers. Used by the done-turn path, early "End conversation",
// and an unreachable-agent early finish.
isolated function finalizeIfUnclaimed(string sessionId) {
    GeneratedSession? claimed = claimFinalize(sessionId);
    if claimed is GeneratedSession {
        persistLiveFhir(sessionId, claimed);
        notifyEmergencyAnswers(claimed.patientId, collectLiveAnswers(claimed), claimed.slots);
    }
}

// Persists the Questionnaire + QuestionnaireResponse for a finalized live session.
isolated function persistLiveFhir(string sessionId, GeneratedSession session) {
    string? questionnaireId = ();
    fhir:FHIRResponse|fhir:FHIRError qSave = fhirConnector->create(buildLiveQuestionnaire(session));
    if qSave is fhir:FHIRResponse {
        questionnaireId = extractFhirId(qSave);
    } else {
        log:printWarn("failed to save live Questionnaire", sessionId = sessionId, 'error = qSave);
    }
    fhir:FHIRResponse|fhir:FHIRError qrSave = fhirConnector->create(buildLiveQuestionnaireResponse(session, questionnaireId));
    if qrSave is fhir:FHIRError {
        log:printWarn("failed to save live QuestionnaireResponse", sessionId = sessionId, 'error = qrSave);
    }
}

// Notifies analysis-service's /emergency-answers with the answers and enriched slots.
isolated function notifyEmergencyAnswers(string patientId, EmergencyAnswer[] answers, FeatureSlots? slots) {
    EmergencyAnswersNotification notification = {patientId, answers, slots};
    http:Response|http:ClientError notifyResult = analysisClient->post("/emergency-answers", notification);
    if notifyResult is http:ClientError {
        log:printWarn("failed to notify analysis-service of emergency answers", patientId = patientId, 'error = notifyResult);
    }
}

// Merges chat-extracted slot updates into the running feature set, filling only empty slots so a
// FHIR-prefilled value is never overwritten.
isolated function mergeSlots(FeatureSlots current, AiSlotUpdates updates) returns FeatureSlots {
    FeatureSlots merged = current.clone();
    if merged.chestPainType is () {
        merged.chestPainType = updates.chestPainType;
    }
    if merged.exerciseAngina is () {
        merged.exerciseAngina = updates.exerciseAngina;
    }
    if merged.restingBp is () {
        merged.restingBp = updates.restingBp;
    }
    return merged;
}

isolated function callTurnWithRetry(AiConversationTurnRequest request) returns AiConversationTurnResponse|error {
    AiConversationTurnResponse|http:ClientError first = aiClient->post("/conversation/turn", request);
    if first !is http:ClientError {
        return first;
    }
    log:printWarn("conversation/turn failed, retrying once", patientId = request.patientId, 'error = first);
    return aiClient->post("/conversation/turn", request);
}

// A finalized live session is not "gone" - it stays open for open Q&A (see handleOpenQaTurn) once
// the clinical check-in has escalated. Only an unknown or non-live session is unavailable. The
// returned value can still be `& readonly` under the hood (see startLiveConversation's
// cloneReadOnly()) even after .clone() - callers that need to mutate it must reconstruct it via
// cloneWithType() themselves, outside this lock (cloneWithType()'s result is not an isolated
// expression, so the compiler rejects returning it directly from here).
isolated function loadActiveLiveSession(string sessionId) returns GeneratedSession? {
    lock {
        if !generatedSessions.hasKey(sessionId) {
            return ();
        }
        GeneratedSession session = generatedSessions.get(sessionId);
        if !session.live {
            return ();
        }
        return session.clone();
    }
}

isolated function persistSession(string sessionId, GeneratedSession session) {
    lock {
        generatedSessions[sessionId] = session.clone();
    }
}

// Marks a live session finalized and returns its snapshot, but only for the first caller - later
// callers get () so the same session is never finalized twice.
isolated function claimFinalize(string sessionId) returns GeneratedSession? {
    lock {
        if !generatedSessions.hasKey(sessionId) {
            return ();
        }
        GeneratedSession session = generatedSessions.get(sessionId);
        if !session.live || session.finalized {
            return ();
        }
        session.finalized = true;
        return session.clone();
    }
}
