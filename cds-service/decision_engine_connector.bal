import ballerinax/health.fhir.cds;

# ====================================== Please do your implementations to the below methods ===========================
#
# Consider the below steps while do your implementations.
#
# 1. Map the received CdsRequest/ Feedback request to the custom payload format, if needed (Optional).
# 2. Implement the connectivity with your external decision support systems.
# 3. Send the CdsRequest/ Feedback request to appropriate external systems.
# 4. Get the response.
# 5. Map the received response to the CdsCards and Cds actions.
# 6. Return the CdsResponse to the client.
#
# ======================================================================================================================

# Handle decision service connectivity.
#
# + cdsRequest - CdsRequest to sent to the backend.
# + hookId - ID of the hook being invoked.
# + return - return CdsResponse or CdsError
isolated function connectDecisionSystemForBookImagingCenter(cds:CdsRequest cdsRequest, string hookId) returns cds:CdsResponse|cds:CdsError {
    cds:CdsResponse cdsResponse = {
        cards: [],
        systemActions: []
    };

    cds:Card card1 = {
        summary: "Prior authorization",
        indicator: "critical",
        'source: {
            label: "Static CDS Service Example",
            url: "https://example.com",
            icon: "https://example.com/img/icon-100px.png"
        },
        detail: "Obtain prior authorization to avoid claim denials and patient financial liability. Contact: For questions,reach out to the insurance provider or billing department.",
        suggestions: [{label: "Kindly get pri-authorization"}],
        selectionBehavior: "at-most-one",
        links: [{label: "Prior-auth", url: "https://www.acmehealth.com/policies/lab-coverage", 'type: cds:ABSOLUTE}]
    };

    cds:Card card2 = {
        summary: "Alternative centers",
        indicator: "info",
        'source: {
            label: "Static CDS Service Example",
            url: "https://example.com",
            icon: "https://example.com/img/icon-100px.png"
        },
        detail: "Discuss alternative imaging centers with patients to enhance access and affordability. For assistance, reach out to the facility's scheduling department or insurance provider.",
        suggestions: [
            {label: "The selected imaging center is far away from your location. Please select nearby one. Suggested: Asiri labs : Col - 3"}
        ],
        selectionBehavior: "any"
    };

    cdsResponse.cards.push(card1);
    cdsResponse.cards.push(card2);
    return cdsResponse;
}

# Handle feedback service connectivity.
#
# + feedback - Feedback record to be processed.
# + hookId - ID of the hook being invoked.
# + return - return CdsError, if any.
isolated function connectFeedbackSystemForBookImagingCenter(cds:Feedbacks feedback, string hookId) returns cds:CdsError? {
    return cds:createCdsError(string `Rule repository backend not implemented/ connected yet for ${hookId}`, 501);
}

# Handle decision service connectivity.
#
# + cdsRequest - CdsRequest to sent to the backend.
# + hookId - ID of the hook being invoked.
# + return - return CdsResponse or CdsError
isolated function connectDecisionSystemForRadiology(cds:CdsRequest cdsRequest, string hookId) returns cds:CdsResponse|cds:CdsError {
    return cds:createCdsError(string `Rule repository backend not implemented/ connected yet for ${hookId}`, 501);
}

# Handle feedback service connectivity.
#
# + feedback - Feedback record to be processed.
# + hookId - ID of the hook being invoked.
# + return - return CdsError, if any.
isolated function connectFeedbackSystemForRadiology(cds:Feedbacks feedback, string hookId) returns cds:CdsError? {
    return cds:createCdsError(string `Rule repository backend not implemented/ connected yet for ${hookId}`, 501);
}

# Handle decision service connectivity.
#
# + cdsRequest - CdsRequest to sent to the backend.
# + hookId - ID of the hook being invoked.
# + return - return CdsResponse or CdsError
isolated function connectDecisionSystemForRadiologyOrder(cds:CdsRequest cdsRequest, string hookId) returns cds:CdsResponse|cds:CdsError {
    cds:CdsResponse cdsResponse = {
        cards: [],
        systemActions: []
    };

    cds:Card card1 = {
        summary: "Prior authorization",
        indicator: "critical",
        'source: {
            label: "Static CDS Service Example",
            url: "https://example.com",
            icon: "https://example.com/img/icon-100px.png"
        },
        detail: "Obtain prior authorization to avoid claim denials and patient financial liability. Contact: For questions,reach out to the insurance provider or billing department.",
        suggestions: [{label: "Kindly get pri-authorization"}],
        selectionBehavior: "at-most-one",
        links: [{label: "Prior-auth", url: "https://www.acmehealth.com/policies/lab-coverage", 'type: cds:ABSOLUTE}]
    };

    cds:Card card2 = {
        summary: "Alternative approaches",
        indicator: "info",
        'source: {
            label: "Static CDS Service Example",
            url: "https://example.com",
            icon: "https://example.com/img/icon-100px.png"
        },
        detail: "Consider X-Ray before ordering a CT scan, especially for common conditions. Contact: For further guidance, consult clinical protocols or imaging specialists",
        suggestions: [
            {label: "We feel this is very early stage to go for CT scan, kindly check whether this can be analysed further during the consultions"},
            {label: "Try X-Ray as an alternative"}
        ],
        selectionBehavior: "any"
    };

    cdsResponse.cards.push(card1);
    cdsResponse.cards.push(card2);
    return cdsResponse;
}

# Handle feedback service connectivity.
#
# + feedback - Feedback record to be processed.
# + hookId - ID of the hook being invoked.
# + return - return CdsError, if any.
isolated function connectFeedbackSystemForRadiologyOrder(cds:Feedbacks feedback, string hookId) returns cds:CdsError? {
    return cds:createCdsError(string `Rule repository backend not implemented/ connected yet for ${hookId}`, 501);
}

# Handle decision service connectivity.
#
# + cdsRequest - CdsRequest to sent to the backend.
# + hookId - ID of the hook being invoked.
# + return - return CdsResponse or CdsError
isolated function connectDecisionSystemForStaticPatientGreeter(cds:CdsRequest cdsRequest, string hookId) returns cds:CdsResponse|cds:CdsError {
    return cds:createCdsError(string `Rule repository backend not implemented/ connected yet for ${hookId}`, 501);
}

# Handle feedback service connectivity.
#
# + feedback - Feedback record to be processed.
# + hookId - ID of the hook being invoked.
# + return - return CdsError, if any.
isolated function connectFeedbackSystemForStaticPatientGreeter(cds:Feedbacks feedback, string hookId) returns cds:CdsError? {
    return cds:createCdsError(string `Rule repository backend not implemented/ connected yet for ${hookId}`, 501);
}

# Handle decision service connectivity.
#
# + cdsRequest - CdsRequest to sent to the backend.
# + hookId - ID of the hook being invoked.
# + return - return CdsResponse or CdsError
isolated function connectDecisionSystemForVaccines(cds:CdsRequest cdsRequest, string hookId) returns cds:CdsResponse|cds:CdsError {
    return cds:createCdsError(string `Rule repository backend not implemented/ connected yet for ${hookId}`, 501);
}

# Handle feedback service connectivity.
#
# + feedback - Feedback record to be processed.
# + hookId - ID of the hook being invoked.
# + return - return CdsError, if any.
isolated function connectFeedbackSystemForVaccines(cds:Feedbacks feedback, string hookId) returns cds:CdsError? {
    return cds:createCdsError(string `Rule repository backend not implemented/ connected yet for ${hookId}`, 501);
}

# Handle decision service connectivity.
#
# + cdsRequest - CdsRequest to sent to the backend.
# + hookId - ID of the hook being invoked.
# + return - return CdsResponse or CdsError
isolated function connectDecisionSystemForRegularMedications(cds:CdsRequest cdsRequest, string hookId) returns cds:CdsResponse|cds:CdsError {
    return cds:createCdsError(string `Rule repository backend not implemented/ connected yet for ${hookId}`, 501);
}

# Handle feedback service connectivity.
#
# + feedback - Feedback record to be processed.
# + hookId - ID of the hook being invoked.
# + return - return CdsError, if any.
isolated function connectFeedbackSystemForRegularMedications(cds:Feedbacks feedback, string hookId) returns cds:CdsError? {
    return cds:createCdsError(string `Rule repository backend not implemented/ connected yet for ${hookId}`, 501);
}
