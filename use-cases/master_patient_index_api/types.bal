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

# Represents a system specific patient mapping.
#
# + systemPatientId - system specific patient ID
# + systemId - system ID
# + resourceUrl - resource URL
# + firstName - first name
# + lastName - last name
# + dateOfBirth - date of birth
# + gender - gender
# + address - address
# + phoneNumber - phone number
# + meta - additional details
public type SystemPatientMapping record {|
    string systemPatientId;
    string systemId;
    string resourceUrl;
    string firstName;
    string lastName?;
    string dateOfBirth;
    string gender;
    string address?;
    string phoneNumber?;
    map<anydata> meta?;
|};

# Record to hold the patient match request.
public type PatientMatchRequestData record {
    # resource type name
    string resourceType;
    # resource Id
    string id;
    # parameter resource in fhir specification
    json[] 'parameter;
};
