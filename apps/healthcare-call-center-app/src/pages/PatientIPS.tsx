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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAuthContext } from "@asgardeo/auth-react";
import PatientDemographics from "@/components/PatientDemographics";
import AllergiesSection from "@/components/AllergiesSection";
import MedicationsSection from "@/components/MedicationsSection";
import ChatInterface from "@/components/ChatInterface";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import LoadingScreen from "@/components/LoadingScreen";
import { FHIRBundle, FHIRBundleEntry, FHIRResource, PatientData, Allergy, Medication } from "@/components/types/FHIRTypes";


const PatientIPS = () => {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { signOut, state, getAccessToken, refreshAccessToken } = useAuthContext();

  const [fhirData, setFhirData] = useState<FHIRBundle | null>(null);
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const handleSignOut = () => {
    setIsSigningOut(true);
    signOut();
  };

  const handleBackToSearch = () => {
    setIsNavigating(true);
    navigate("/patient-match");
  };

  const extractPatientInfo = (data: FHIRBundle): FHIRResource | null => {
    if (!data || !data.entry) return null;

    const patientEntry = data.entry.find(
      (entry: FHIRBundleEntry) =>
        entry.resource && entry.resource.resourceType === "Patient"
    );

    if (!patientEntry) {
      console.log("No Patient resource found in bundle");
      return null;
    }
    return patientEntry.resource;
  };

  // Transform FHIR patient data to component format
  const transformPatientData = (fhirPatient: FHIRResource): PatientData => {
    const patient = fhirPatient as any;
    return {
      name: patient.name && patient.name.length > 0 ? [{
        given: patient.name[0].given || [],
        family: patient.name[0].family || 'Unknown'
      }] : [{
        given: [],
        family: 'Unknown'
      }],
      gender: patient.gender || 'unknown',
      birthDate: patient.birthDate || '1900-01-01',
      address: patient.address && patient.address.length > 0 ? [{
        line: patient.address[0].line || ['Unknown'],
        city: patient.address[0].city || 'Unknown',
        postalCode: patient.address[0].postalCode || 'Unknown'
      }] : [{
        line: ['Unknown'],
        city: 'Unknown',
        postalCode: 'Unknown'
      }]
    };
  };

  const extractAllergies = (data: FHIRBundle): FHIRResource[] => {
    if (!data || !data.entry) return [];

    const allergyEntries = data.entry
      .filter(
        (entry: FHIRBundleEntry) =>
          entry.resource && entry.resource.resourceType === "AllergyIntolerance"
      )
      .map((entry: FHIRBundleEntry) => entry.resource!) as FHIRResource[];

    return allergyEntries;
  };

  const extractMedications = (data: FHIRBundle): FHIRResource[] => {
    if (!data || !data.entry) return [];

    const medicationEntries = data.entry
      .filter(
        (entry: FHIRBundleEntry) =>
          entry.resource && entry.resource.resourceType === "MedicationStatement"
      )
      .map((entry: FHIRBundleEntry) => entry.resource!) as FHIRResource[];

    return medicationEntries;
  };

  // Transform FHIR allergy data to component format
  const transformAllergies = (fhirAllergies: FHIRResource[]): Allergy[] => {
    return fhirAllergies.map((allergy) => ({
      id: allergy.id || '',
      clinicalStatus: (allergy as any).clinicalStatus?.coding?.[0]?.code || (allergy as any).clinicalStatus || 'unknown',
      criticality: (allergy as any).criticality || 'normal',
      code: (allergy as any).code?.coding?.[0]?.display || (allergy as any).code?.text || 'Unknown allergy',
      reaction: (allergy as any).reaction?.[0]?.manifestation?.[0]?.coding?.[0]?.display || 
               (allergy as any).reaction?.[0]?.manifestation?.[0]?.text || 
               'No reaction details'
    }));
  };

  // Transform FHIR medication data to component format
  const transformMedications = (fhirMedications: FHIRResource[], bundleData?: FHIRBundle): Medication[] => {
    return fhirMedications.map((medicationStatement) => {
      const medStatement = medicationStatement as any;
      
      // Get medication name from referenced resource
      let medicationName = 'Unknown medication';
      if (medStatement.medicationCodeableConcept && (medStatement.medicationCodeableConcept as any).text) {
        medicationName = (medStatement.medicationCodeableConcept as any).text;
      }
      
      // Extract dosage information from MedicationStatement.dosage
      let dosageInfo = 'No dosage info';
      let frequencyInfo = 'No frequency info';
      
      if (medStatement.dosage && medStatement.dosage.length > 0) {
        const dosage = medStatement.dosage[0];
        
        // Extract dose quantity
        if (dosage.doseAndRate && dosage.doseAndRate.length > 0) {
          const doseAndRate = dosage.doseAndRate[0];
          if (doseAndRate.doseQuantity) {
            dosageInfo = `${doseAndRate.doseQuantity.value || ''} ${doseAndRate.doseQuantity.unit || ''}`.trim();
          }
        }
        
        // Extract frequency from timing
        if (dosage.timing?.repeat) {
          const repeat = dosage.timing.repeat;
          const count = repeat.count || 1;
          const periodUnit = repeat.periodUnit;
          
          if (periodUnit === 'd') {
            switch (count) {
              case 1:
                frequencyInfo = 'Once a day';
                break;
              case 2:
                frequencyInfo = 'Twice a day';
                break;
              case 3:
                frequencyInfo = 'Three times a day';
                break;
              case 4:
                frequencyInfo = 'Four times a day';
                break;
              default:
                frequencyInfo = `${count} times a day`;
            }
          } else if (periodUnit === 'h') {
            frequencyInfo = `Every ${repeat.period || 1} hour(s)`;
          } 
          else if (periodUnit === 'w') {
            switch (count) {
              case 1:
                frequencyInfo = 'Once a week';
                break;
              case 2:
                frequencyInfo = 'Twice a week';
                break;
              case 3:
                frequencyInfo = 'Three times a week';
                break;
              default:
                frequencyInfo = `${count} times a week`;
            }
          } else if (periodUnit === 'mo') {
            switch (count) {
              case 1:
                frequencyInfo = 'Once a month';
                break;
              case 2:
                frequencyInfo = 'Twice a month';
                break;
              default:
                frequencyInfo = `${count} times a month`;
            }
          } else {
            frequencyInfo = `${count} times per ${periodUnit}`;
          }
        }
        
        // If no doseAndRate, try to get text
        if (dosageInfo === 'No dosage info' && dosage.text) {
          dosageInfo = dosage.text;
        }
      }
      
      return {
        id: medicationStatement.id || '',
        status: medStatement.status || 'unknown',
        medication: medicationName,
        dosage: dosageInfo,
        frequency: frequencyInfo
      };
    });
  };

    const removePhoto = (data: FHIRBundle): FHIRBundle | null => {
    if (!data || !data.entry) return null;
  
    return {
      ...data,
      entry: data.entry.map((entry) => ({
        ...entry,
        resource: entry.resource
          ? {
              ...entry.resource,
              photo: undefined, // Removes the photo property
            }
          : entry.resource,
      })),
    };
  };

  useEffect(() => {
    const fetchPatientData = async () => {
      if (!patientId) return;

      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/data/Patient/${patientId}/$everything`,
          {
            method: "GET",
            headers: {
              "Accept": "application/fhir+json",
              "Authorization": `Bearer ${localStorage.getItem("accessToken")}`
            }
            
          }

        );
        
        if (!response.ok) {
          throw new Error(`Failed to fetch patient data: ${response.status}`);
        }

        const raw_data = await response.json();

        const data = removePhoto(raw_data);
        setFhirData(data);
        
        // Extract data using the provided functions
        const rawPatient = extractPatientInfo(data);
        const extractedAllergies = extractAllergies(data);
        const extractedMedications = extractMedications(data);

        console.log("Extracted raw patient:", rawPatient);
        console.log("Extracted allergies:", extractedAllergies);
        console.log("Extracted medications:", extractedMedications);

        // Transform FHIR data to component format
        const patient = rawPatient ? transformPatientData(rawPatient) : null;
        const transformedAllergies = transformAllergies(extractedAllergies);
        const transformedMedications = transformMedications(extractedMedications, data);

        console.log("Transformed patient:", patient);
        console.log("Transformed allergies:", transformedAllergies);
        console.log("Transformed medications:", transformedMedications);

        setPatientData(patient);
        setAllergies(transformedAllergies);
        setMedications(transformedMedications);
      } catch (err) {
        console.error("Error fetching patient data:", err);
        setError(err instanceof Error ? err.message : "Unknown error occurred");
      } finally {
        setLoading(false);
      }
    };

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

    const initializeData = async () => {
      await fetchAccessToken();
      await fetchPatientData();
    };  

    initializeData();
  }, [patientId, getAccessToken, refreshAccessToken]);

  // Show loading screens for various states
  if (isSigningOut) {
    return <LoadingScreen message="Signing you out..." />;
  }

  if (isNavigating) {
    return <LoadingScreen message="Returning to search..." />;
  }

  if (loading) {
    return <LoadingScreen message="Loading patient data..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-4 md:p-6 space-y-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Search
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Patient Summary</h1>
              <p className="text-sm text-muted-foreground">Patient ID: {patientId}</p>
            </div>
          </div>
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <p className="text-destructive mb-4">Error loading patient data:</p>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
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
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToSearch}
            className="gap-2"
            disabled={isNavigating}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Search
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Patient Summary</h1>
            <p className="text-sm text-muted-foreground">Patient ID: {patientId}</p>
          </div>
        </div>

        <div className="grid gap-6">
          {patientData && <PatientDemographics patient={patientData} />}
          <div className="grid md:grid-cols-2 gap-6">
            <AllergiesSection allergies={allergies} />
            <MedicationsSection medications={medications} />
          </div>
          <ChatInterface patientId={patientId || ""} chatContext={fhirData} />
        </div>
      </div>
    </div>
  );
};

export default PatientIPS;
