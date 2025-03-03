// Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com).
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

const requirementsResponse1 = {
  cards: [
    {
      summary: "Prior Authorization Required",
      detail:
        "This medication (Aimovig 70 mg) requires prior authorization from XYZ Health Insurance. Please complete the required documentation.",
      indicator: "warning",
      source: {
        label: "XYZ Health Insurance ePA Service",
        url: "https://xyzhealth.com/prior-auth",
      },
      suggestions: [
        {
          label: "Submit e-Prior Authorization",
          uuid: "submit-epa",
          actions: [
            {
              type: "create",
              description:
                "Submit an electronic prior authorization request for Aimovig 70 mg.",
              resource: {
                resourceType: "Task",
                status: "requested",
                intent: "order",
                code: {
                  coding: [
                    {
                      system: "http://terminology.hl7.org/CodeSystem/task-code",
                      code: "prior-authorization",
                      display: "Submit Prior Authorization",
                    },
                  ],
                },
                for: {
                  reference: "Patient/56789",
                },
                owner: {
                  reference: "Organization/XYZHealthInsurance",
                },
              },
            },
          ],
        },
      ],
      links: [
        {
          label: "Check PA Status",
          url: "https://xyzhealth.com/check-pa-status",
          type: "absolute",
        },
        {
          label: "Launch SMART App for DTR",
          url: "https://xyzhealth.com/smart-dtr-launch",
          type: "smart",
        },
      ],
    },
  ],
};

const requirementsResponse2 = {
  cards: [
    {
      summary: "Prior Authorization Required",
      detail:
        "This medication (Aimovig 70 mg) requires prior authorization from XYZ Health Insurance. Please complete the required documentation.",
      indicator: "warning",
      source: {
        label: "XYZ Health Insurance ePA Service",
        url: "https://xyzhealth.com/prior-auth",
      },
      suggestions: [
        {
          label: "Submit e-Prior Authorization",
          uuid: "submit-epa",
          actions: [
            {
              type: "create",
              description:
                "Submit an electronic prior authorization request for Aimovig 70 mg.",
              resource: {
                resourceType: "Task",
                status: "requested",
                intent: "order",
                code: {
                  coding: [
                    {
                      system: "http://terminology.hl7.org/CodeSystem/task-code",
                      code: "prior-authorization",
                      display: "Submit Prior Authorization",
                    },
                  ],
                },
                for: {
                  reference: "Patient/56789",
                },
                owner: {
                  reference: "Organization/XYZHealthInsurance",
                },
              },
            },
          ],
        },
      ],
      links: [
        {
          label: "Check PA Status",
          url: "https://xyzhealth.com/check-pa-status",
          type: "absolute",
        },
        {
          label: "Launch SMART App for DTR",
          url: "https://xyzhealth.com/smart-dtr-launch",
          type: "smart",
        },
      ],
    },
    {
      summary: "Prior authorization",
      detail:
        "Obtain prior authorization to avoid claim denials and patient financial liability. Contact: For questions,reach out to the insurance provider or billing department.",
      indicator: "critical",
      source: {
        label: "Static CDS Service Example",
        url: "https://example.com",
        icon: "https://example.com/img/icon-100px.png",
      },
      suggestions: [
        {
          label: "Kindly get pri-authorization",
        },
      ],
      selectionBehavior: "at-most-one",
      links: [
        {
          label: "Prior-auth",
          url: "drug-order-v2/prior-auth",
          type: "absolute",
        },
      ],
    },
    {
      summary: "Alternative approaches",
      detail:
        "Consider X-Ray before ordering a CT scan, especially for common conditions. Contact: For further guidance, consult clinical protocols or imaging specialists",
      indicator: "info",
      source: {
        label: "Static CDS Service Example",
        url: "https://example.com",
        icon: "https://example.com/img/icon-100px.png",
      },
      suggestions: [
        {
          label:
            "We feel this is very early stage to go for CT scan, kindly check whether this can be analysed further during the consultions",
        },
        {
          label: "Try X-Ray as an alternative",
        },
      ],
      selectionBehavior: "any",
    },
  ],
};

export { requirementsResponse1, requirementsResponse2 };
