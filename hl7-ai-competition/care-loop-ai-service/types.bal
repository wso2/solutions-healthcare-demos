# + patientId - FHIR Patient id to draft a questionnaire for
public type QuestionnaireRequest record {|
    string patientId;
|};

# + questionnaire - the drafted FHIR Questionnaire resource, with no answers filled in
public type QuestionnaireResponse record {|
    json questionnaire;
|};
