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
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Allergy {
  id: string;
  clinicalStatus: string;
  criticality: string;
  code: string;
  reaction: string;
}

interface AllergiesSectionProps {
  allergies: Allergy[];
}

const AllergiesSection = ({ allergies }: AllergiesSectionProps) => {
  return (
    <Card className="shadow-md border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-destructive/10 p-2 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <CardTitle className="text-xl font-semibold">Allergies & Intolerances</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {allergies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-muted rounded-lg">
            No allergy information available
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <ScrollArea className="h-[240px]">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/50 z-10">
                  <TableRow>
                    <TableHead className="font-semibold">Allergy</TableHead>
                    <TableHead className="font-semibold">Reaction</TableHead>
                    <TableHead className="font-semibold">Severity</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allergies.map((allergy) => (
                    <TableRow
                      key={allergy.id}
                      className={allergy.criticality === "high" ? "bg-destructive/5" : ""}
                    >
                      <TableCell className="font-medium">{allergy.code}</TableCell>
                      <TableCell>{allergy.reaction}</TableCell>
                      <TableCell>
                        <Badge
                          variant={allergy.criticality === "high" ? "destructive" : "secondary"}
                          className="capitalize"
                        >
                          {allergy.criticality}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={allergy.clinicalStatus === "active" ? "default" : "outline"}
                          className="capitalize"
                        >
                          {allergy.clinicalStatus}
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

export default AllergiesSection;
