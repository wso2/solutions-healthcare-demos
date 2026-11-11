-- One Postgres instance, one database per concern. Runs once, on first container start.
--
--   fhir_ehr     wso2/fhir-server acting as the clinic's EHR
--   fhir_lab     wso2/fhir-server acting as the reference lab (Quest stand-in)
--   temporal     Temporal's own history store (created by temporal auto-setup)
--   longevity    the integration's state: agent memory + the assessment read model the portal queries

CREATE DATABASE fhir_ehr;
CREATE DATABASE fhir_lab;
CREATE DATABASE longevity;
