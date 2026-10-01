// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import ballerina/time;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

// LOINC codes apple-healthkit-simulator forwards, per its VITALS_OBSERVATION_CODES map.
const string LOINC_HEART_RATE = "8867-4";
const string LOINC_SPO2 = "59408-5";
const string LOINC_RESP_RATE = "9279-1";
const string LOINC_BP_SYSTOLIC = "8480-6";
const string LOINC_BP_DIASTOLIC = "8462-4";

final string[] & readonly VITALS_LOINC_CODES = [LOINC_HEART_RATE, LOINC_SPO2, LOINC_RESP_RATE, LOINC_BP_SYSTOLIC, LOINC_BP_DIASTOLIC];

# + id - the Observation's FHIR id, used to build a "Observation/{id}" basis reference
# + code - the LOINC code
# + value - the observation's valueQuantity.value
# + time - the parsed effectiveDateTime
public type VitalReading record {|
    string id;
    string code;
    float value;
    time:Utc time;
|};

isolated function extractVitalReadings(json bundle) returns VitalReading[] {
    VitalReading[] readings = [];
    r4:Bundle|error typedBundle = bundle.cloneWithType(r4:Bundle);
    if typedBundle is error {
        return readings;
    }
    foreach r4:BundleEntry entry in typedBundle.entry ?: [] {
        anydata|r4:FHIRWireFormat? entryResource = entry?.'resource;
        international401:Observation|error observation = entryResource.cloneWithType(international401:Observation);
        if observation is error {
            continue;
        }
        string? id = observation.id;
        r4:Coding[] codings = observation.code.coding ?: [];
        string? code = codings.length() > 0 ? codings[0].code : ();
        decimal? decimalValue = observation.valueQuantity?.value;
        float? value = decimalValue is decimal ? <float>decimalValue : ();
        string? effective = observation.effectiveDateTime;
        if id is () || code is () || value is () || effective is () {
            continue;
        }
        time:Utc|time:Error parsedTime = time:utcFromString(effective);
        if parsedTime is time:Error {
            continue;
        }
        readings.push({id, code, value, time: parsedTime});
    }
    return readings;
}

isolated function withinWindow(VitalReading[] readings, time:Utc windowStart, time:Utc windowEnd) returns VitalReading[] {
    return readings.filter(r => time:utcDiffSeconds(r.time, windowStart) >= 0d && time:utcDiffSeconds(windowEnd, r.time) >= 0d);
}

isolated function maxHeartRate(VitalReading[] readings) returns VitalReading? {
    VitalReading? max = ();
    foreach VitalReading r in readings {
        if r.code != LOINC_HEART_RATE {
            continue;
        }
        if max is () || r.value > max.value {
            max = r;
        }
    }
    return max;
}
