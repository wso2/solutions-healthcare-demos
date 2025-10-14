// Configuration for different backend systems
configurable map<BackendConfig> backendConfigs = {
    "system1": {
        baseUrl: "https://hapi.fhir.org/baseR4",
        authType: NONE
    }
};

configurable int servicePort = 9091;
