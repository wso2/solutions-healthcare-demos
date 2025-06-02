// Copyright (c) 2024 - 2025, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

export const baseUrl =
  "https://c32618cf-389d-44f1-93ee-b67a3468aae3-dev.e1-us-east-azure.choreoapis.dev";

export const paths = {
  medication_request:
    "/cms-0057-f/medication-request-servic/v1.0/fhir/r4/MedicationRequest",
  prescribe_medication:
    "/cms-0057-f/cds-service/v1.0/cds-services/prescirbe-medication",
  questionnaire:
    "/cms-0057-f/questionnaire-service/v1.0/fhir/r4/Questionnaire/",
  questionnaire_package:
    "/cms-0057-f/questionnaire-package-ser/v1.0/fhir/r4/Questionnaire/questionnaire-package",
  questionnaire_response:
    "/cms-0057-f/questionnaire-response-se/v1.0/fhir/r4/QuestionnaireResponse",
  claim: "/cms-0057-f/claim-service/v1.0/fhir/r4/Claim",
  claim_submit:
    "/cms-0057-f/claim-submission-service/v1.0/fhir/r4/Claim/submit",

  // old urls
  radiology_order:
    "/cmsdemosetups/cds-server/v1.0/cds-services/radiology-order",
  book_imaging_center:
    "/cmsdemosetups/cds-server/v1.0/cds-services/book-imaging-center",
  practitioner: "/cmsdemosetups/medconnect-service/v1.0/fhir/r4/Practitioner",
  slot: "/cmsdemosetups/medconnect-service/cerner-fhir-slot-api-745/v1.0/fhir/r4/Slot",
  location:
    "/cmsdemosetups/medconnect-service/cerner-fhir-location-api-cbc/v1.0/fhir/r4/Location",
  appointment:
    "/cmsdemosetups/medconnect-service/cerner-fhir-appointment-api-2ae/v1.0/fhir/r4/Appointment",
};
