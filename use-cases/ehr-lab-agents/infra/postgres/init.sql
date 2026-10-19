-- One Postgres instance, one database per concern. Runs once, on first container start.
--
--   fhir_cerner  wso2/fhir-server acting as the Oracle Health (Cerner) EHR
--   fhir_athena  wso2/fhir-server acting as the athenahealth EHR
--   fhir_lab     wso2/fhir-server acting as the reference lab (Quest stand-in)
--   temporal     Temporal's own history store (created by temporal auto-setup)
--   longevity    the integration's state: agent memory + the assessment read model the portal queries

CREATE DATABASE fhir_cerner;
CREATE DATABASE fhir_athena;
CREATE DATABASE fhir_lab;
CREATE DATABASE longevity;
