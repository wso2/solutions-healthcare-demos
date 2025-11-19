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
import ballerina/io;
import ballerina/tcp;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4;
import ballerinax/health.hl7v2;
// import ballerinax/health.hl7v24;
import ballerinax/health.fhir.r4.international401;

configurable string fhirServerUrl = ?;
configurable string tokenUrl = ?;
configurable string[] scopes = ?;
configurable string client_id = ?;
configurable string client_secret = ?;

service on new tcp:Listener(3000) {
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

        // Note: When you know the message type you can directly get it parsed.
        hl7v24:QBP_Q21|error qbpQ21 = hl7v2:parse(data).ensureType(hl7v24:QBP_Q21);
        if qbpQ21 is error {
            return error(string `Error occurred while parsing the received message: ${qbpQ21.message()}`,
            qbpQ21);
        }
        hl7v24:ST idVal = qbpQ21.qpd.qpd2;
        r4:FHIRError|fhir:FHIRResponse resourceById = getResourceById(idVal.toString());
        if resourceById is fhir:FHIRResponse {
            international401:Patient|error fhirPatient = resourceById.'resource.cloneWithType();
            if fhirPatient is error {
                return error(string `Error occurred while parsing the FHIR Patient resource: ${fhirPatient.message()}`,
                        fhirPatient);
            }
            byte[]|error hl7msg = mapFhirPatientToHL7(fhirPatient, qbpQ21.msh.msh5.hd1, qbpQ21.msh.msh6.hd1, qbpQ21.msh.msh3.hd1, qbpQ21.msh.msh4.hd1, "67890");
            if hl7msg is error {
                return error(string `Error occurred while mapping the FHIR Patient resource to HL7: ${hl7msg.message()}`,
                        hl7msg);
            }
            check caller->writeBytes(hl7msg);
        }
    }

    remote function onError(tcp:Error err) {
        io:println(string `An error occurred while receiving HL7 message: ${err.message()}. Stack trace: `,
                err.stackTrace());
    }

    remote function onClose() {
        io:println("Client left");
    }
}
