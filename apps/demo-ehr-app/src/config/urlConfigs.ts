const config = {
  baseUrl:
    "https://c32618cf-389d-44f1-93ee-b67a3468aae3-dev.e1-us-east-azure.choreoapis.dev/cmsdemosetups/medconnect-service",
  paths: {
    practitioner: "v1.0/fhir/r4/Practitioner",
    slot: "cerner-fhir-slot-api-745/v1.0/fhir/r4/Slot",
    location: "cerner-fhir-location-api-cbc/v1.0/fhir/r4/Location",
    appointment: "cerner-fhir-appointment-api-2ae/v1.0/fhir/r4/Appointment",
  },
};

export const baseUrl =
  "https://c32618cf-389d-44f1-93ee-b67a3468aae3-dev.e1-us-east-azure.choreoapis.dev/cms-0057-f";

export const paths = {
  medication_request:
    "/medication-request-servic/v1.0/fhir/r4/MedicationRequest",
  prescribe_medication: "/cds-service/v1.0/cds-services/prescirbe-medication",
  questionnaire: "/questionnaire-service/v1.0/fhir/r4/Questionnaire/",
  questionnaire_package:
    "/questionnaire-package-ser/v1.0/fhir/r4/Questionnaire/questionnaire-package",
  questionnaire_response:
    "/questionnaire-response-se/v1.0/fhir/r4/QuestionnaireResponse",
  claim: "/claim-service/v1.0/fhir/r4/Claim",
  claim_submit: "/claim-submission-service/v1.0/fhir/r4/Claim/submit",
};

export default config;
