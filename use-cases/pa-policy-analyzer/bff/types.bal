// ----------------------------------
// Database Related Record Types
// ----------------------------------

type JobRow record {|
    string id;
    string payerName;
    string status;
    int stepIndex;
    string? errorMessage;
|};

type PdfRow record {|
    string id;
    string jobId;
    string filename;
    int sizeBytes;
    string pdfStatus;
    string? localPath;
|};

type PolicyDocRow record {|
    string id;
    string jobId;
    string pdfId;
    string policyName;
    string? markdownPath;
    string? medicalRecordsRef;
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

type PayerRow record {|
    string id;
    string name;
    string status;
|};

type PolicyCodeRow record {|
    string id;
    string policyId;
    string codeType;
    string code;
    string? description;
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

// ----------------------------------
// LLM response record types
// ----------------------------------

type LLMClause record {
    int depth;
    string text;
    string 'type;
    string? logical_operator;
};

type LLMClausesResponse record {
    LLMClause[] clauses;
};

type LLMCode record {
    string code_type;
    string code;
    string description;
};

type LLMCodesResponse record {
    LLMCode[] codes;
};

type ToCResponse record {
    string[] response;
};

// ----------------------------------
// Evaluation Related Record Types
// ----------------------------------

type EvalContext record {|
    string evaluationId;
    string patientId;
    string policyId;
    int resultSortOrder;
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
