const config = {
    baseUrl: "https://c32618cf-389d-44f1-93ee-b67a3468aae3-dev.e1-us-east-azure.choreoapis.dev/cmsdemosetups/medconnect-service",
    paths: {
      practitioner: "v1.0/fhir/r4/Practitioner",
      slot: "cerner-fhir-slot-api-745/v1.0/fhir/r4/Slot",
      location: "cerner-fhir-location-api-cbc/v1.0/fhir/r4/Location",
      appointment: "cerner-fhir-appointment-api-2ae/v1.0/fhir/r4/Appointment",
    },
  };

  export const baseUrl = "https://c32618cf-389d-44f1-93ee-b67a3468aae3-dev.e1-us-east-azure.choreoapis.dev";
  
  export const paths = {
    prescribe_medication:"/cms-0057-f/cds-service/v1.0/cds-services/prescirbe-medication",
    questionnaire: "/cms-0057-f/questionnaire-service/v1.0/fhir/r4/Questionnaire/",
    questionnaire_response: "/cms-0057-f/questionnaire-response-se/v1.0/fhir/r4/QuestionnaireResponse",
    claim: "/cms-0057-f/claim-service/v1.0/fhir/r4/Claim",
  };
  
  export default config;