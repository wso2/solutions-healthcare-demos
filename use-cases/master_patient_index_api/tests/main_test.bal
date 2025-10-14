import ballerina/http;
import ballerina/test;

@test:Config {}
function testGetExistingPatientMappings() returns error? {
    http:Client testClient = check new ("http://localhost:9090");
    SystemPatientMapping[] response = check testClient->/mpi/["UP001"]/mappings;

    test:assertEquals(response.length(), 1);
    test:assertEquals(response[0].systemPatientId, "444222222");
    test:assertEquals(response[0].systemId, "H001");
    test:assertEquals(response[0].firstName, "John");
    test:assertEquals(response[0].lastName, "Doe");
}

@test:Config {}
function testGetNonExistingPatientMappings() returns error? {
    http:Client testClient = check new ("http://localhost:9090");
    http:Response response = check testClient->/mpi/["UP999"]/mappings;
    test:assertEquals(response.statusCode, 404);
}

@test:Config {}
function testAllInitializedMappings() returns error? {
    http:Client testClient = check new ("http://localhost:9090");

    // Test first patient
    SystemPatientMapping[] response1 = check testClient->/mpi/["UP001"]/mappings;
    test:assertEquals(response1.length(), 1);

    // Test second patient  
    SystemPatientMapping[] response2 = check testClient->/mpi/["UP002"]/mappings;
    test:assertEquals(response2.length(), 2);
    test:assertEquals(response2[0].systemPatientId, "4442223435");
    test:assertEquals(response2[1].systemId, "H002");
}
