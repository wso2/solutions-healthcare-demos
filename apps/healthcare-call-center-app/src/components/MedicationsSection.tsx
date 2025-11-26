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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Pill } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Medication {
  id: string;
  status: string;
  medication: string;
  dosage: string;
  frequency: string;
}

interface MedicationsSectionProps {
  medications: Medication[];
}

const MedicationsSection = ({ medications }: MedicationsSectionProps) => {
  return (
    <Card className="shadow-md border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-secondary/10 p-2 rounded-lg">
            <Pill className="h-5 w-5 text-secondary" />
          </div>
          <CardTitle className="text-xl font-semibold">Medications</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {medications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-muted rounded-lg">
            No medication information available
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <ScrollArea className="h-[240px]">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/50 z-10">
                  <TableRow>
                    <TableHead className="font-semibold">Medication</TableHead>
                    <TableHead className="font-semibold">Dosage</TableHead>
                    <TableHead className="font-semibold">Frequency</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medications.map((medication) => (
                    <TableRow key={medication.id}>
                      <TableCell className="font-medium">{medication.medication}</TableCell>
                      <TableCell>{medication.dosage}</TableCell>
                      <TableCell>{medication.frequency}</TableCell>
                      <TableCell>
                        <Badge
                          variant={medication.status === "active" ? "default" : "secondary"}
                          className="capitalize"
                        >
                          {medication.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MedicationsSection;
