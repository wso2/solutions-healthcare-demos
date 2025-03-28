// Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import ballerinax/health.fhir.r4;

final r4:ResourceAPIConfig apiConfig = {
    resourceType: "Patient",
    profiles: [
            "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"        
    ],
    defaultProfile: (),
    searchParameters: [
            {
        name: "family",
        active: true,
        information: {
            description: "**A portion of the family name of the patient**  **NOTE**: This US Core SearchParameter definition extends the usage context of the[Conformance expectation extension](http://hl7.org/fhir/R4/extension-capabilitystatement-expectation.html) - multipleAnd - multipleOr - comparator - modifier - chain",
            builtin: false,
            documentation: "http://hl7.org/fhir/us/core/SearchParameter/us-core-patient-family"
        }
    },
            {
        name: "name",
        active: true,
        information: {
            description: "**A server defined search that may match any of the string fields in the HumanName, including family, give, prefix, suffix, suffix, and/or text**  **NOTE**: This US Core SearchParameter definition extends the usage context of the[Conformance expectation extension](http://hl7.org/fhir/R4/extension-capabilitystatement-expectation.html) - multipleAnd - multipleOr - comparator - modifier - chain",
            builtin: false,
            documentation: "http://hl7.org/fhir/us/core/SearchParameter/us-core-patient-name"
        }
    },
            {
        name: "gender-identity",
        active: true,
        information: {
            description: "Returns patients with an gender-identity extension matching the specified code.",
            builtin: false,
            documentation: "http://hl7.org/fhir/us/core/SearchParameter/us-core-patient-gender-identity"
        }
    },
            {
        name: "ethnicity",
        active: true,
        information: {
            description: "Returns patients with an ethnicity extension matching the specified code.",
            builtin: false,
            documentation: "http://hl7.org/fhir/us/core/SearchParameter/us-core-ethnicity"
        }
    },
            {
        name: "race",
        active: true,
        information: {
            description: "Returns patients with a race extension matching the specified code.",
            builtin: false,
            documentation: "http://hl7.org/fhir/us/core/SearchParameter/us-core-race"
        }
    },
            {
        name: "given",
        active: true,
        information: {
            description: "**A portion of the given name of the patient**  **NOTE**: This US Core SearchParameter definition extends the usage context of the[Conformance expectation extension](http://hl7.org/fhir/R4/extension-capabilitystatement-expectation.html) - multipleAnd - multipleOr - comparator - modifier - chain",
            builtin: false,
            documentation: "http://hl7.org/fhir/us/core/SearchParameter/us-core-patient-given"
        }
    },
            {
        name: "identifier",
        active: true,
        information: {
            description: "**A patient identifier**  **NOTE**: This US Core SearchParameter definition extends the usage context of the[Conformance expectation extension](http://hl7.org/fhir/R4/extension-capabilitystatement-expectation.html) - multipleAnd - multipleOr - comparator - modifier - chain",
            builtin: false,
            documentation: "http://hl7.org/fhir/us/core/SearchParameter/us-core-patient-identifier"
        }
    },
            {
        name: "_id",
        active: true,
        information: {
            description: "**Logical id of this artifact**  **NOTE**: This US Core SearchParameter definition extends the usage context of the[Conformance expectation extension](http://hl7.org/fhir/R4/extension-capabilitystatement-expectation.html) - multipleAnd - multipleOr - comparator - modifier - chain",
            builtin: false,
            documentation: "http://hl7.org/fhir/us/core/SearchParameter/us-core-patient-id"
        }
    },
            {
        name: "gender",
        active: true,
        information: {
            description: "**Gender of the patient**  **NOTE**: This US Core SearchParameter definition extends the usage context of the[Conformance expectation extension](http://hl7.org/fhir/R4/extension-capabilitystatement-expectation.html) - multipleAnd - multipleOr - comparator - modifier - chain",
            builtin: false,
            documentation: "http://hl7.org/fhir/us/core/SearchParameter/us-core-patient-gender"
        }
    },
            {
        name: "birthdate",
        active: true,
        information: {
            description: "**The patient's date of birth**  **NOTE**: This US Core SearchParameter definition extends the usage context of the[Conformance expectation extension](http://hl7.org/fhir/R4/extension-capabilitystatement-expectation.html) - multipleAnd - multipleOr - comparator - modifier - chain",
            builtin: false,
            documentation: "http://hl7.org/fhir/us/core/SearchParameter/us-core-patient-birthdate"
        }
    }
        ],
    operations: [
    
    ],
    serverConfig: (),
    authzConfig: (),
    auditConfig: { 
        enabled : true, 
        auditServiceUrl: auditServiceUrl
    }
};
