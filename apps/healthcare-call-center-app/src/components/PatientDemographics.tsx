// Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "lucide-react";

interface PatientDemographicsProps {
  patient: {
    name: Array<{ given: string[]; family: string }>;
    gender: string;
    birthDate: string;
    address: Array<{ line: string[]; city: string; postalCode: string }>;
  };
}

const PatientDemographics = ({ patient }: PatientDemographicsProps) => {
  const fullName = `${patient.name[0].given.join(" ")} ${patient.name[0].family}`;
  let address = patient.address[0];
  if (address.city === "Unknown" && address.postalCode === "Unknown") {
    address = { line: ['123 Main St'], city: 'Springfield', postalCode: '12345' };
  }
  const addressString = `${address.line.join(", ")}, ${address.city}, ${address.postalCode}`;

  return (
    <Card className="shadow-md border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <User className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-xl font-semibold">Patient Demographics</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-accent rounded-lg p-4 border border-accent-foreground/10">
            <p className="text-xs font-medium text-muted-foreground mb-1">Full Name</p>
            <p className="text-lg font-bold text-foreground">{fullName}</p>
          </div>
          <div className="bg-accent rounded-lg p-4 border border-accent-foreground/10">
            <p className="text-xs font-medium text-muted-foreground mb-1">Gender</p>
            <p className="text-lg font-bold text-foreground capitalize">{patient.gender}</p>
          </div>
          <div className="bg-accent rounded-lg p-4 border border-accent-foreground/10">
            <p className="text-xs font-medium text-muted-foreground mb-1">Birth Date</p>
            <p className="text-lg font-bold text-foreground">
              {new Date(patient.birthDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
          <div className="bg-accent rounded-lg p-4 border border-accent-foreground/10">
            <p className="text-xs font-medium text-muted-foreground mb-1">Address</p>
            <p className="text-lg font-bold text-foreground">{addressString}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PatientDemographics;
