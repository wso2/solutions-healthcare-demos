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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "@asgardeo/auth-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, LogOut } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import React, { useEffect } from "react";



const PatientSearch = () => {
  const navigate = useNavigate();
  const { signOut, state, getAccessToken, refreshAccessToken } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    phoneNumber: "",
    city: "",
    postalCode: ""
  });

  useEffect(() => {
    const fetchAccessToken = async () => {
      try {
        const accessToken = await getAccessToken();
        localStorage.setItem("accessToken", accessToken);
      } catch (error) {
        console.error("Failed to retrieve access token:", error);
        try {
          await refreshAccessToken();
          const refreshedAccessToken = await getAccessToken();
          localStorage.setItem("accessToken", refreshedAccessToken);
        } catch (refreshError) {
          console.error("Failed to refresh access token:", refreshError);
        }
      }
    };

    fetchAccessToken();
  }, [getAccessToken, refreshAccessToken]);

  const handleSignOut = () => {
    setIsSigningOut(true);
    signOut();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Construct FHIR Patient resource from form data
      const patientResource: Record<string, unknown> = {
        resourceType: "Patient",
        name: [
          {
            family: formData.lastName,
            given: [formData.firstName]
          }
        ],
        gender: formData.gender,
        birthDate: formData.dateOfBirth
      };

      // Add optional fields if they exist
      if (formData.phoneNumber) {
        patientResource.telecom = [
          {
            system: "phone",
            value: formData.phoneNumber,
            use: "mobile"
          }
        ];
      }

      if (formData.city || formData.postalCode) {
        patientResource.address = [
          {
            use: "home",
            ...(formData.city && { city: formData.city }),
            ...(formData.postalCode && { postalCode: formData.postalCode })
          }
        ];
      }

      // Construct FHIR Parameters resource for patient matching
      const matchRequest = {
        resourceType: "Parameters",
        id: "patient-match-request",
        parameter: [
          {
            name: "resource",
            resource: patientResource
          },
          {
            name: "count",
            valueInteger: parseInt(import.meta.env.VITE_PATIENT_MATCH_COUNT || "1")
          },
          {
            name: "onlyCertainMatches",
            valueBoolean: import.meta.env.VITE_PATIENT_MATCH_ONLY_CERTAIN_MATCH === "true"
          },
          {
            name: "onlySingleMatch",
            valueBoolean: import.meta.env.VITE_PATIENT_MATCH_ONLY_SINGLE_MATCH === "true"
          }
        ]
      };

      // Send request to FHIR patient match endpoint
      const response = await fetch( "/mpi/match" , {
        method: "POST",
        headers: {
          "Content-Type": "application/fhir+json",
          "Accept": "application/fhir+json",
          "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
        },
        body: JSON.stringify(matchRequest)
      });

      if (!response.ok) {
        throw new Error(`Patient match request failed: ${response.status}`);
      }

      const matchResult = await response.json();
      
      // Extract patient ID from FHIR bundle response
      let patientId: string | null = null;
      
      // Check if the response is a Bundle with entries
      if (matchResult.resourceType === "Bundle" && matchResult.entry && matchResult.entry.length > 0) {
        // Find the first Patient resource in the bundle entries
        const patientEntry = matchResult.entry.find((entry: Record<string, unknown>) => 
          entry.resource && 
          (entry.resource as Record<string, unknown>).resourceType === "Patient"
        );
        
        if (patientEntry && 
            patientEntry.resource && 
            (patientEntry.resource as Record<string, unknown>).id) {
          patientId = (patientEntry.resource as Record<string, unknown>).id as string;
        }
      }
      
      if (!patientId) {
        throw new Error("No patient found in the response");
      }
      
      navigate(`/patient/${patientId}`);
    } catch (error) {
      console.error("Error during patient search:", error);
      // Handle error - you might want to show a toast or error message
      alert("Failed to search for patient. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Show loading screen when signing out or searching for patients
  if (isSigningOut) {
    return <LoadingScreen message="Signing you out..." />;
  }

  if (isLoading) {
    return <LoadingScreen message="Searching for patient..." />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-1">
              <img src="/image.png" alt="Health Sync Agent Logo" className="h-12 w-12 object-contain"/>
              <h1 className="text-xl font-semibold text-gray-900">Healthcare Contact Center</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Welcome, {state.username || state.displayName || 'User'}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSignOut}
                className="gap-2"
                disabled={isSigningOut}
              >
                <LogOut className="h-4 w-4" />
                {isSigningOut ? "Signing Out..." : "Sign Out"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex items-center justify-center p-4 pt-8">
        <Card className="w-full max-w-3xl shadow-lg border-border">
          <CardHeader className="space-y-3 pb-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-3 rounded-lg">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">Patient Record Search</CardTitle>
                <CardDescription className="text-base">
                  Enter patient details to find matching records
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sm font-medium">
                  First Name *
                </Label>
                <Input
                  id="firstName"
                  required
                  value={formData.firstName}
                  onChange={(e) => handleChange("firstName", e.target.value)}
                  className="h-11"
                  placeholder="Enter first name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium">
                  Last Name *
                </Label>
                <Input
                  id="lastName"
                  required
                  value={formData.lastName}
                  onChange={(e) => handleChange("lastName", e.target.value)}
                  className="h-11"
                  placeholder="Enter last name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateOfBirth" className="text-sm font-medium">
                  Date of Birth *
                </Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  required
                  value={formData.dateOfBirth}
                  onChange={(e) => handleChange("dateOfBirth", e.target.value)}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender" className="text-sm font-medium">
                  Gender *
                </Label>
                <Select value={formData.gender} onValueChange={(value) => handleChange("gender", value)} required>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="unknown">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber" className="text-sm font-medium">
                  Phone Number (Optional)
                </Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => handleChange("phoneNumber", e.target.value)}
                  className="h-11"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city" className="text-sm font-medium">
                  City (Optional)
                </Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleChange("city", e.target.value)}
                  className="h-11"
                  placeholder="Enter city"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="postalCode" className="text-sm font-medium">
                  Postal Code (Optional)
                </Label>
                <Input
                  id="postalCode"
                  value={formData.postalCode}
                  onChange={(e) => handleChange("postalCode", e.target.value)}
                  className="h-11"
                  placeholder="Enter postal code"
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-12 text-base font-medium" size="lg" disabled={isLoading}>
              <Search className="mr-2 h-5 w-5" />
              {isLoading ? "Searching..." : "Search Patient Records"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default PatientSearch;
