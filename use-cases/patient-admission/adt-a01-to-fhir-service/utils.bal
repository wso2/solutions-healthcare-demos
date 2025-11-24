
// Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com).

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

import ballerina/log;
import ballerina/uuid;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;
import ballerinax/health.fhir.r4.parser as r4parser;
import ballerinax/health.hl7v2;
import ballerinax/health.hl7v23;
import ballerinax/health.hl7v23.utils.v2tofhirr4;

public isolated function generateAckMessage(hl7v2:Message message) returns byte[]|error {

    hl7v2:Message? ack = ();
    string? hl7Version = ();

    if message is hl7v23:ADT_A01 || message is hl7v23:ADT_A39 {

        hl7v23:MSH? msh = ();
        if message is hl7v2:Message && message.hasKey("msh") {
            anydata mshEntry = message["msh"];
            hl7v23:MSH|error tempMSH = mshEntry.ensureType();
            if tempMSH is error {
                log:printError(string `Error occurred while casting MSH: ${tempMSH.message()}`);
                return error("Error occurred while casting MSH", tempMSH);
            }
            msh = tempMSH;
        }
        if msh is () {
            log:printError(string `Failed to extract MSH from HL7 message`);
            return error("Failed to extract MSH from HL7 message");
        }
        // Create Acknowledgement message.
        hl7v23:ACK hl7v23Ack = {
            msh: {
                msh2: "^~\\&",
                msh3: {hd1: "TESTSERVER"},
                msh4: {hd1: "WSO2OH"},
                msh5: {hd1: msh.msh3.hd1},
                msh6: {hd1: msh.msh4.hd1},
                msh9: {cm_msg1: hl7v23:ACK_MESSAGE_TYPE},
                msh10: uuid:createType1AsString().substring(0, 8),
                msh11: {pt1: "P"},
                msh12: "2.3"
            },
            msa: {
                msa1: "AA",
                msa2: msh.msh10
            }
        };
        ack = hl7v23Ack;
        hl7Version = hl7v23:VERSION;
    } else {
        log:printError(string `Received message is not an ADT_A01 message: ${message.toString()}`);
    }

    if ack is () || hl7Version is () {
        log:printError(string `Failed to create ACK message`);
        return error("Failed to create ACK message");
    } else {
        // Encode message to wire format.
        byte[]|hl7v2:HL7Error encodedMsg = hl7v2:encode(hl7Version, ack);
        if encodedMsg is hl7v2:HL7Error {
            return error("Error occurred while encoding acknowledgement", encodedMsg);
        }
        return encodedMsg;
    }
}

public isolated function extractFHIRBundleAndPersist(hl7v2:Message adtA01) returns error? {

    int[] statusCodes = [];
    json v2tofhirResult = check v2tofhirr4:v2ToFhir(adtA01);

    r4:Bundle bundle = <r4:Bundle>check r4parser:parse(v2tofhirResult);

    if bundle is r4:Bundle {
        r4:BundleEntry[] entries = <r4:BundleEntry[]>bundle.entry;
        foreach var entry in entries {
            map<anydata> fhirResource = <map<anydata>>entry?.'resource;
            if fhirResource["resourceType"].toString() == "Encounter" {
                international401:Encounter encounterResource = <international401:Encounter>check r4parser:parse(fhirResource.toJson());
                // Modify encounterResource here before sending to FHIR repository if needed
                int sendToFhirRepoResult = sendToFhirRepo(encounterResource.toJson());
                statusCodes.push(sendToFhirRepoResult);
                log:printInfo(string `Sent Encounter resource to FHIR repository with response code: ${sendToFhirRepoResult}`);
            } else if fhirResource["resourceType"].toString() == "Patient" {
                international401:Patient patientResource = <international401:Patient>check r4parser:parse(fhirResource.toJson());
                // Modify Patient resource here before sending to FHIR repository if needed
                int sendToFhirRepoResult = sendToFhirRepo(patientResource.toJson());
                statusCodes.push(sendToFhirRepoResult);
                log:printInfo(string `Sent Patient resource to FHIR repository with response code: ${sendToFhirRepoResult}`);

            } else {
                log:printWarn(`Unsupported resource type: ${fhirResource["resourceType"].toString()}`);
            }
        }
        if statusCodes.length() == 0 {
            return error("No Patient or Encounter resources found in the FHIR bundle");
        }
        foreach int i in statusCodes {
            if i != 201 {
                log:printError("Failed to send one or more resources to the FHIR repository. Check debug logs for details.");
                return error("Failed to send one or more resources to the FHIR repository");
            }
        }
        log:printInfo("All resources sent to FHIR repository successfully");
    }
}
