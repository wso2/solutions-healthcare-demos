type EvalParams record {|
    string patientId;
    string patientName;
    string policyId;
    string cptCode;
    string? cptDescription;
    string payer;
|};

type EvalContext record {|
    string evaluationId;
    string patientId;
    string policyId;
    int resultSortOrder;
|};

type CoverageClauseRow record {|
    string id;
    string policyId;
    string? parentId;
    string clauseText;
    string clauseType;
    string? logicalOperator;
    int sortOrder;
    boolean isEditable;
|};

type EvaluationRow record {|
    string id;
    string patientId;
    string patientName;
    string policyId;
    string cptCode;
    string? cptDescription;
    string payer;
    string status;
    string? overallReasoning;
    string? reviewer;
    string createdAt;
|};

type EvaluationResultRow record {|
    string id;
    string evaluationId;
    string clauseId;
    string? clauseText;
    string status;
    decimal confidence;
    string? reasoning;
    boolean aiAugmented;
    int sortOrder;
|};

type EvaluationEvidenceRow record {|
    string id;
    string resultId;
    string 'source;
    string? documentId;
    string? date;
    string? text;
    string resourceType;
|};

type ClinicalCondition record {|
    string id;
    string code;
    string display;
    string? onset;
    string status;
|};

type ClinicalMedication record {|
    string id;
    string name;
    string status;
    string? startDate;
    string? endDate;
    string? reason;
|};

type ClinicalProcedure record {|
    string id;
    string code;
    string display;
    string? date;
    string? outcome;
|};

type ClinicalObservation record {|
    string id;
    string code;
    string display;
    string value;
    string? unit;
    string? date;
|};

type EvidenceItem record {
    string 'source;
    string document_id;
    string date;
    string text;
    string resource_type;
};

