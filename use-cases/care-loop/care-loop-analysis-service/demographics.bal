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
