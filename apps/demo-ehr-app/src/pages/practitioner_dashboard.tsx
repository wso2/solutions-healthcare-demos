// Copyright (c) 2024-2025, WSO2 LLC. (http://www.wso2.com).
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

import { DARK_RED_COLOR } from "../constants/color";
import { SERVICE_CARD_DETAILS, PATIENT_DETAILS } from "../constants/data";
import Button from "@mui/material/Button";
import { ServiceCardListProps } from "../components/interfaces/card";
import MultiActionAreaCard from "../components/serviceCard";
import { useContext } from "react";
import { ExpandedContext } from "../utils/expanded_context";
import { useSelector } from "react-redux";
import Form from "react-bootstrap/Form";

function ServiceCardList({ services, expanded }: ServiceCardListProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: expanded ? "repeat(1, 1fr)" : "repeat(3, 1fr)",
        gap: "20px",
      }}
    >
      {services.map((service, index) => (
        <MultiActionAreaCard
          key={index}
          serviceImagePath={service.serviceImagePath}
          serviceName={service.serviceName}
          serviceDescription={service.serviceDescription}
          path={service.path}
        />
      ))}
    </div>
  );
}

const DetailsDiv = () => {
  const selectedPatientId = useSelector(
    (state: any) => state.patient.selectedPatientId
  );
  let currentPatient = PATIENT_DETAILS.find(
    (patient) => patient.id === selectedPatientId
  );

  if (!currentPatient) {
    currentPatient = PATIENT_DETAILS[0];
  }

  return (
    <div style={{ display: "flex", gap: "20px" }}>
      <Form.Group
        controlId="formPatientName"
        style={{ marginTop: "20px", flex: "1 1 35%" }}
      >
        <Form.Label>Patient Name</Form.Label>
        <Form.Control
          type="text"
          value={
            currentPatient.name &&
            currentPatient.name[0] &&
            currentPatient.name[0].given &&
            currentPatient.name[0].given[0] +
              " " +
              currentPatient.name[0].family
          }
          disabled
        />
      </Form.Group>
      <Form.Group
        controlId="formPatientID"
        style={{ marginTop: "20px", flex: "1 1 35%" }}
      >
        <Form.Label>Patient ID</Form.Label>
        <Form.Control type="text" value={currentPatient.id} disabled />
      </Form.Group>
      <div
        style={{
          flex: "1 1 10%",
        }}
      ></div>
      <Button
        href="/"
        variant="contained"
        style={{
          borderRadius: "50px",
          backgroundColor: DARK_RED_COLOR,
          height: "fit-content",
          alignSelf: "center",
          flex: "1 1 20%",
          marginTop: "50px",
        }}
      >
        Dismiss Patient
      </Button>
    </div>
  );
};

function PractitionerDashBoard() {
  const { expanded } = useContext(ExpandedContext);
  const selectedPatientId = useSelector(
    (state: any) => state.patient.selectedPatientId
  );
  let currentPatient = PATIENT_DETAILS.find(
    (patient) => patient.id === selectedPatientId
  );

  if (!currentPatient) {
    currentPatient = PATIENT_DETAILS[0];
  }

  return (
    <div style={{ marginLeft: 50, marginBottom: 50 }}>
      <DetailsDiv />
      <div
        style={{
          display: "flex",
          flexDirection: expanded ? "column" : "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      ></div>
      <br />
      <div className="page-heading">HealthCare HQ Services</div>
      <div style={{ height: "5vh" }}>
        <ServiceCardList services={SERVICE_CARD_DETAILS} expanded={expanded} />
      </div>
    </div>
  );
}

export default PractitionerDashBoard;
