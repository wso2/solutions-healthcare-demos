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
public type CustomPatient record {
    string patientType;
    string patientId;
    string version;
    string lastUpdatedOn;
    string originSource;
    Description description;
    Identifier[] identifiers;
    string firstName;
    string lastName;
    string gender;
    LocatoionDetail[] locatoionDetail;

};

public type Identifier record {
    IdType id_type;
    string id_value;
};

public type IdType record {
    Code[] codes;
};

public type Code record {
    string system_source;
    string identifier_code;
};

public type Description record {
    string status;
    string details?;
};

public type LocatoionDetail record {
    string nation?;
    string town?;
    string region?;
    string zipCode?;
    string identifier?;
    string province?;
};

public type ResponseResource record{
    string resourceId;
    string version;
};

