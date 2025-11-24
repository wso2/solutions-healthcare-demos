
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
import ballerina/io;
import ballerina/log;
import ballerina/tcp;
import ballerinax/health.hl7v2;

configurable string fhirServerUrl = ?;
configurable string tokenUrl = ?;
configurable string[] scopes = ?;
configurable string client_id = ?;
configurable string client_secret = ?;
configurable string location_header_key = "location";

service on new tcp:Listener(8000) {
    remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService {
        io:println("Client connected to HL7 server: ", caller.remotePort.toString());
        return new HL7ServiceConnectionService();
    }
}

service class HL7ServiceConnectionService {
    *tcp:ConnectionService;

    remote function onBytes(tcp:Caller caller, readonly & byte[] data) returns tcp:Error? {
        string|error fromBytes = string:fromBytes(data);
        if fromBytes is string {
            io:println("Received HL7 Message: ", fromBytes);
        }

        // Uncomment the following section to use HL7 listener with a FHIR server as backend

        // // HL7 Listner with FHIR server as backend
        hl7v2:Message|error parsedMsg = hl7v2:parse(data);
        if parsedMsg is error {
            log:printError(string `Error occurred while parsing the received message: ${parsedMsg.message()}`);
            return error(string `Error occurred while parsing the received message: ${parsedMsg.message()}`,
            parsedMsg);
        }
        do {
            error? extractFHIRBundleAndPersistResult = extractFHIRBundleAndPersist(parsedMsg);
            if extractFHIRBundleAndPersistResult is error {
                log:printError(string `Error occurred while extracting FHIR bundle and persisting to FHIR repository: ${extractFHIRBundleAndPersistResult.message()}`);
            } else {
                log:printInfo("Successfully extracted FHIR bundle and persisted to FHIR repository");
            }
        } on fail var e {
            log:printError(string `Error occurred while sending HL7 message to processor: ${fhirServerUrl}, Error: ${e.message()}`);

        }

        // Encode message to wire format.
        byte[]|error encodedMsg = generateAckMessage(parsedMsg);

        if encodedMsg is error {
            log:printError(string `Error occurred while encoding the ACK message: ${encodedMsg.message()}`);
            return error(string `Error occurred while encoding the ACK message: ${encodedMsg.message()}`, encodedMsg);
        }

        string|error resp = string:fromBytes(encodedMsg);
        if resp is string {
            log:printDebug(string `Encoded HL7 ACK Response Message: ${resp}`);
        }

        // Echoes back the data to the client from which the data is received.
        check caller->writeBytes(encodedMsg);

        // // End of HL7 listener with FHIR server as backend
    }

    remote function onError(tcp:Error err) {
        io:println(string `An error occurred while receiving HL7 message: ${err.message()}. Stack trace: `,
                err.stackTrace());
    }

    remote function onClose() {
        io:println("Client left");
    }
}
