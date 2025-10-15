// Configuration for different backend systems
configurable map<BackendConfig> backendConfigs = {
    "system1": {
        baseUrl: "https://hapi.fhir.org/baseR4",
        authType: NONE
    }
};

// MPI (Master Patient Index) Configuration
configurable string mpiBaseUrl = "http://localhost:8080/mpi";
configurable string mpiMappingsPath = "/v1.0/{patientId}/mappings";
configurable AuthType mpiAuthType = NONE;
configurable string? mpiUsername = ();
configurable string? mpiPassword = ();
configurable string? mpiTokenUrl = ();
configurable string? mpiClientId = ();
configurable string? mpiClientSecret = ();
configurable string[]? mpiScopes = ();

configurable int servicePort = 9091;
