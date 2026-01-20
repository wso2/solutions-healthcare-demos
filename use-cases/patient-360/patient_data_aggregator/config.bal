// Configuration for different backend systems
configurable map<BackendConfig> backendConfigs = {
    "H001": {
        baseUrl: "http://hapi.fhir.org/baseR4",
        authType: NONE,
        backendType: "fhir"
    },
    "H002": {
        baseUrl: "http://lisapi-3676681785:8090/senaite/api/senaite/v1",
        authType: NONE,
        backendType: "http",
        lisType: SENAITE
    }
};

// MPI (Master Patient Index) Configuration
configurable string mpiBaseUrl = "http://masterpatientindexapiserv-2287183769:9090/mpi";
configurable string mpiMappingsPath = "/{patientId}/mappings";
configurable AuthType mpiAuthType = NONE;
configurable string? mpiUsername = ();
configurable string? mpiPassword = ();
configurable string? mpiTokenUrl = ();
configurable string? mpiClientId = ();
configurable string? mpiClientSecret = ();
configurable string[]? mpiScopes = ();

configurable int servicePort = 9091;
