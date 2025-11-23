import ballerina/io;
import ballerina/log;
import ballerina/tcp;

// Define the ADT^A01 message (Patient Admission)
string message_a01 = string `MSH|^~\&|SIMHOSP|SFAC|RAPP|RFAC|2020-05-08T13:06:43||ADT^A01|5|T|2.3|||AL||44|ASCII
EVN|A01|2020-05-08T13:06:43|||2001^Wolf^Kathy^^^Dr^^^DRNBR
PID|1|2590157853^^^SIMULATOR MRN^MRN|2590157853^^^SIMULATOR MRN^MRN~2478684691^^^NHSNBR^NHSNMBR||Esterkin^AKI Scenario 6^^^Miss^^CURRENT||1989-01-18T00:00:00|F|||170 Juice Place^^London^^RW21 6KC^GBR^HOME||020 5368 1665^HOME|||||||||R
PD1|||FAMILY PRACTICE^^12345
PV1|1|I|RenalWard^MainRoom^Bed 1^Simulated Hospital^^BED^Main Building^5|28b|||2001^Wolf^Kathy^^Dr^^^DRNBR^PRSNL^^^ORGDR|||MED|||||||||6145914547062969032^^^^visitid||||||||||||||||||||||ARRIVED|||2020-05-08T13:06:43`;

// Define the ADT^A06 message (Patient Update)
string message_ormo01 = string `MSH|^~\&|AlShifa-RIS|WXYZ Hospital|ABCPACS|ABCPACS - WXYZ Hospital|20250430133848||ORM^O01^ORM_O01|6876799-2970342|P|2.4||||||||
EVN|O01|20250430140145|20250430140223|02||
PID|||WXYZ318935^^^WXYZ Hospital^^WXYZ Hospital~9692426^^^MOHMPI^^MOHMPI||KLINE^ANDREA^SCHMIDT PRUITT||19660601000000|F
PV1||O||R||||56279^DAVIDSON^BRITTANY^BARAJAS MULLINS|||||||||||5840183||||||||||||||||||||||||||||||||V
ORC|NW|6876799^AlShifa-RIS|4530004|4530004^AlShifa-RIS|SC|F|1^^^20250430140223^^R||20250430140145|56279^DAVIDSON^BRITTANY^BARAJAS MULLINS||56279^DAVIDSON^BRITTANY^BARAJAS MULLINS|||20250430140223||267^ORTHOPEDICS
OBR||6876799^AlShifa-RIS|6876799|402^Knee X-Ray :: Right :: Lateral|||20250430140223||||||||^^^Lateral^Right|56279^DAVIDSON^BRITTANY^BARAJAS MULLINS||5029906|Eleva3|6876799|1.2.826.0.1.3680043.2.1048.400010104530004|||DX|||1^^^20250430140223^^R||||post tkr|||||||||||||402^Knee X-Ray
ZDS|1.2.826.0.1.3680043.2.1048.400010104530004^AlShifa-RIS^Application^DICOM`;

// Define the ADT^A06 message (Patient Update)
string message_a39 = string `MSH|^~\&|SendingApp|SendingFac|ReceivingApp|ReceivingFac|20241013130000||ADT^A06|54321|P|2.3
EVN|A08|20241013130000
PID|1||5^^^Hospital^MR||Doe^John^A||1980-01-01|M|||789 Updated St^^Newtown^CA^54321|555-777-8888|||M
NK1|1|Doe^Jane|SPO|789 Secondary St^^Newtown^CA^54321|555-999-0000
PV1|1|I|W^389^1^UCLA|3|||1111^Jones^John^A^^Dr.||2222^Smith^Jane^B^^Dr.||SUR||||ADM|A0|`;

string message_a40 = string `MSH|^~\&|||||2025-02-24T21:58:21||ADT^A40|1001|T|2.3
EVN|A40|2024-02-24T16:05:34
PID|1|2590157853^^^SIMULATOR MRN^MRN|2590157853^^^SIMULATOR MRN^MRN||Esterkin^AKI^MARIE||19890118|F
MRG|3891256742^^^SIMULATOR MRN^MRN|2590157853^^^SIMULATOR MRN^MRN||22cfc81a-fec8-4cd3-bd68-86d231f89ee5^^^OLDHOSP^PI
PV1|1|I|RenalWard^MainRoom^Bed 1^Simulated Hospital^^BED^Main Building^5|28b|||2001^Wolf^Kathy^^Dr^^^DRNBR^PRSNL^^^ORGDR|||MED|||||||||6145914547062969032^^^^visitid||||||||||||||||||||||ARRIVED|||2020-05-08T13:06:43`;

configurable string serverAddress = "localhost";
configurable int serverPort = 8000;

public function main(string messageType = "ADT_A01") returns error? {

    log:printInfo(string `Starting HL7 message sender...+ ${messageType}. condition ${messageType == "ADT_A01"}`);

    // Create a TCP client
    tcp:Client tcpClient = check new (serverAddress, serverPort);

    if messageType == "ADT_A01" {

        log:printInfo("Sending ADT^A01 message...");

        check sendMessageAndReceiveResponse(tcpClient, message_a01);
    } else if messageType == "ORM" {

        log:printInfo("Sending ADT^A06 message...");

        check sendMessageAndReceiveResponse(tcpClient, message_ormo01);

    } else if messageType == "ADT_A40" {
        log:printInfo("Sending ADT^A40 message...");
        check sendMessageAndReceiveResponse(tcpClient, message_a40);
    }

    // Close the TCP client connection
    check tcpClient->close();
    log:printInfo("TCP client connection closed.");
}

// Function to send a message and receive the response
function sendMessageAndReceiveResponse(tcp:Client tcpClient, string message) returns error? {
    // Send the message to the server
    check tcpClient->writeBytes(message.toBytes());
    log:printInfo("Message sent to the server.");

    // Read the response from the server
    byte[] response = check tcpClient->readBytes();
    string responseMessage = check string:fromBytes(response);
    io:println("Response from server: ", responseMessage);
}
