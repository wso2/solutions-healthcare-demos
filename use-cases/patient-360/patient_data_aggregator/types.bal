
// Type to represent candidate information in the resource parameter
public type CandidateInfo record {|
    string candidateId;
    string sourceSystem;
    string? resourceType?;
|};

// Type to represent the resource parameter for $everything operation
public type EverythingResourceParam record {|
    CandidateInfo[] candidates;
|};

// Authentication types
public enum AuthType {
    NONE = "none",
    BASIC = "basic",
    OAUTH2_CLIENT_CREDENTIALS = "oauth2_client_credentials"
}

// Backend types
public enum BackendType {
    FHIR = "fhir",
    HTTP = "http"
}

// LIS types for HTTP backends
public enum LISType {
    SENAITE = "senaite",
    OTHER = "other"
}

// Configuration for backend FHIR servers
public type BackendConfig record {|
    string baseUrl;
    BackendType backendType = FHIR; // Default to FHIR for backward compatibility
    AuthType authType = NONE;
    LISType? lisType?; // LIS type for HTTP backends
    
    // Basic Auth configuration
    string username?;
    string password?;
    
    // OAuth2 Client Credentials configuration
    string tokenUrl?;
    string clientId?;
    string clientSecret?;
    string[] scopes?;
|};

// Senaite API Response Types
public type SenaiteAnalysisRequest record {|
    string uid;
    string id;
    string url;
    string api_url;
    string portal_type;
    string title;
    string description?;
    string review_state;
    string? state_title?;
    string assigned_state;
    string author;
    string created;
    string modified;
    string effective?;
    
    // Client information
    string getClientUID;
    string getClientID;
    string getClientTitle;
    string getClientURL;
    string getClientReference?;
    string getClientOrderNumber?;
    
    // Patient information
    string getPatientFullName;
    string getMedicalRecordNumberValue;
    boolean isMedicalRecordTemporary;
    
    // Sample information
    string getSampleTypeUID;
    string getSampleTypeTitle;
    string getSamplePointTitle?;
    string getClientSampleID?;
    
    // Dates
    string? getDateSampled;
    string? getDateReceived;
    string? getDatePublished;
    string? getDateVerified;
    string? getSamplingDate;
    string? getDueDate;
    
    // Contact and location
    string getContactUID?;
    string getProvince?;
    string getDistrict?;
    string getStorageLocationUID?;
    string getStorageLocationTitle?;
    
    // Batch and template
    string? getBatchUID;
    string getBatchID?;
    string getBatchURL?;
    string getTemplateUID?;
    string getTemplateTitle?;
    string getTemplateURL?;
    
    // Status and progress
    int getProgress;
    int[] getAnalysesNum;
    string getPrinted;
    boolean getInvoiceExclude;
    boolean getHazardous;
    boolean getInternalUse;
    boolean getSamplingWorkflowEnabled;
    string getPrioritySortkey?;
    string getSampler?;
    string getSamplingDeviationTitle?;
    string getProfilesTitleStr?;
    
    // Parent information
    string parent_id;
    string parent_uid;
    string parent_url;
    string parent_path;
    
    // Other fields
    string[] getDescendantsUIDs;
    string[] allowedRolesAndUsers;
    string[] tags;
    string[] getPhysicalPath;
    string path;
    string? getRawParentAnalysisRequest;
|};

public type SenaiteAnalysisRequestResponse record {|
    int count;
    int pagesize;
    int page;
    int pages;
    SenaiteAnalysisRequest[] items;
    string? next;
    string? previous;
    decimal _runtime;
|};
