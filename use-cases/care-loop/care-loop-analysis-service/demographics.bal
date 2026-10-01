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

# Derives whole years of age from a FHIR `date` (YYYY-MM-DD) birthDate against `now`.
#
# + birthDate - the Patient's FHIR `date` birthDate, e.g. "1990-08-01"
# + now - the current instant to compute age against
# + return - whole years of age, or an error if birthDate isn't parseable
isolated function deriveAge(string birthDate, time:Utc now) returns int|error {
    string[] parts = re `-`.split(birthDate);
    if parts.length() != 3 {
        return error("birthDate is not in YYYY-MM-DD form: " + birthDate);
    }
    int birthYear = check int:fromString(parts[0]);
    int birthMonth = check int:fromString(parts[1]);
    int birthDay = check int:fromString(parts[2]);

    time:Civil nowCivil = time:utcToCivil(now);
    int age = nowCivil.year - birthYear;
    if nowCivil.month < birthMonth || (nowCivil.month == birthMonth && nowCivil.day < birthDay) {
        age -= 1;
    }
    return age;
}

# Maps FHIR administrative-gender to the heart-risk-service's "M"|"F" sex - any other value
# (including missing) has no safe mapping, so the caller must skip the cycle rather than guess.
#
# + gender - the Patient's FHIR administrative-gender value, if any
# + return - "M"/"F" if mappable, () otherwise
isolated function deriveSex(string? gender) returns "M"|"F"? {
    if gender == "male" {
        return "M";
    }
    if gender == "female" {
        return "F";
    }
    return ();
}
