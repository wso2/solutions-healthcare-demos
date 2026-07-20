import ballerina/test;
import ballerina/time;

@test:Config {}
function testDeriveAgeBeforeBirthdayThisYear() returns error? {
    time:Utc now = check time:utcFromString("2026-07-06T00:00:00Z");
    int age = check deriveAge("1990-08-01", now);
    test:assertEquals(age, 35);
}

@test:Config {}
function testDeriveAgeAfterBirthdayThisYear() returns error? {
    time:Utc now = check time:utcFromString("2026-07-06T00:00:00Z");
    int age = check deriveAge("1990-01-01", now);
    test:assertEquals(age, 36);
}

@test:Config {}
function testDeriveAgeOnBirthday() returns error? {
    time:Utc now = check time:utcFromString("2026-07-06T00:00:00Z");
    int age = check deriveAge("1990-07-06", now);
    test:assertEquals(age, 36);
}

@test:Config {}
function testDeriveAgeRejectsUnparseableBirthDate() {
    time:Utc now = time:utcNow();
    int|error age = deriveAge("not-a-date", now);
    test:assertTrue(age is error);
}

@test:Config {}
function testDeriveSexMapsMaleAndFemale() {
    test:assertEquals(deriveSex("male"), "M");
    test:assertEquals(deriveSex("female"), "F");
}

@test:Config {}
function testDeriveSexSkipsUnknownOrMissing() {
    test:assertEquals(deriveSex("other"), ());
    test:assertEquals(deriveSex(()), ());
}

@test:Config {}
function testMaxHeartRatePicksHighestHeartRateReading() {
    time:Utc t = time:utcNow();
    VitalReading[] readings = [
        {id: "1", code: LOINC_HEART_RATE, value: 72.0, time: t},
        {id: "2", code: LOINC_HEART_RATE, value: 95.0, time: t},
        {id: "3", code: LOINC_SPO2, value: 99.0, time: t}
    ];
    VitalReading? result = maxHeartRate(readings);
    test:assertTrue(result is VitalReading);
    test:assertEquals((<VitalReading>result).id, "2");
    test:assertEquals((<VitalReading>result).value, 95.0);
}

@test:Config {}
function testMaxHeartRateReturnsNilWhenNoHeartRateReadings() {
    time:Utc t = time:utcNow();
    VitalReading[] readings = [
        {id: "1", code: LOINC_SPO2, value: 99.0, time: t}
    ];
    test:assertEquals(maxHeartRate(readings), ());
}

@test:Config {}
function testWithinWindowFiltersOutOfRangeReadings() returns error? {
    time:Utc windowStart = check time:utcFromString("2026-07-06T10:00:00Z");
    time:Utc windowEnd = check time:utcFromString("2026-07-06T11:00:00Z");
    VitalReading inWindow = {id: "1", code: LOINC_HEART_RATE, value: 80.0, time: check time:utcFromString("2026-07-06T10:30:00Z")};
    VitalReading tooEarly = {id: "2", code: LOINC_HEART_RATE, value: 60.0, time: check time:utcFromString("2026-07-06T09:00:00Z")};
    VitalReading tooLate = {id: "3", code: LOINC_HEART_RATE, value: 200.0, time: check time:utcFromString("2026-07-06T12:00:00Z")};

    VitalReading[] result = withinWindow([inWindow, tooEarly, tooLate], windowStart, windowEnd);
    test:assertEquals(result.length(), 1);
    test:assertEquals(result[0].id, "1");
}

@test:Config {}
function testMlEscalationThresholdComparison() {
    test:assertTrue(0.4 < mlEscalationThreshold);
    test:assertTrue(0.6 >= mlEscalationThreshold);
}
