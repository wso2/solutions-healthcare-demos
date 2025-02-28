// Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com).
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

import React, { useState } from "react";
import Form from "react-bootstrap/Form";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";

const DiagnosisForm = () => {
  return (
    <Card style={{ marginTop: "30px", padding: "20px" }}>
      <Card.Body>
        <Card.Title>Diagnosis</Card.Title>
        <Form>
          <Form.Group controlId="formDiagnosis" style={{ marginTop: "20px" }}>
            <Form.Label>Diagnosis Summary</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Enter diagnosis summary here."
            />
          </Form.Group>
          <Form.Group controlId="formFileUpload" style={{ marginTop: "20px" }}>
            <Form.Label>Upload Supporting Documents</Form.Label>
            <Form.Control type="file" multiple />
          </Form.Group>
        </Form>
      </Card.Body>
    </Card>
  );
};

const PrescribedForm = () => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <Card style={{ marginTop: "30px", padding: "20px" }}>
      <Card.Body>
        <Card.Title>Prescribed Medicine</Card.Title>
        <Form onSubmit={handleSubmit}>
          <Form.Group
            controlId="formTreatingSickness"
            style={{ marginTop: "20px" }}
          >
            <Form.Label>Treating Sickness</Form.Label>
            <Form.Control
              type="text"
              value="Gastroesophageal Reflux Disease"
              readOnly
            />
          </Form.Group>

          <Form.Group controlId="formMedication" style={{ marginTop: "20px" }}>
            <Form.Label>Medication</Form.Label>
            <Form.Control type="text" value="Omeprazole 20 mg" readOnly />
          </Form.Group>

          <div
            style={{
              display: "flex",
              gap: "20px",
            }}
          >
            <Form.Group
              controlId="formQuantity"
              style={{ marginTop: "20px", flex: "1 1 100%" }}
            >
              <Form.Label>Quantity</Form.Label>
              <Form.Control type="text" value="2 pills" readOnly />
            </Form.Group>

            <Form.Group
              controlId="formFrequency"
              style={{ marginTop: "20px", flex: "1 1 100%" }}
            >
              <Form.Label>Frequency</Form.Label>
              <Form.Control type="text" value="Twice a day" readOnly />
            </Form.Group>

            <Form.Group
              controlId="formDuration"
              style={{ marginTop: "20px", flex: "1 1 100%" }}
            >
              <Form.Label>Duration (days)</Form.Label>
              <Form.Control type="text" value="7" readOnly />
            </Form.Group>

            <Form.Group
              controlId="formStartDate"
              style={{ marginTop: "20px", flex: "1 1 100%", width: "100%" }}
            >
              <Form.Label>Starting Date</Form.Label>
              <br />
              <Form.Control type="text" value="2025/02/28" readOnly />
            </Form.Group>
          </div>
        </Form>
      </Card.Body>
    </Card>
  );
};

const DetailsDiv = () => {
  return (
    <div style={{ display: "flex", gap: "20px" }}>
      <Form.Group
        controlId="formPatientName"
        style={{ marginTop: "20px", flex: "1 1 100%" }}
      >
        <Form.Label>Order ID</Form.Label>
        <Form.Control type="text" value="OR022943" disabled />
      </Form.Group>
      <Form.Group
        controlId="formPatientName"
        style={{ marginTop: "20px", flex: "1 1 100%" }}
      >
        <Form.Label>Patient Name</Form.Label>
        <Form.Control type="text" value="PA0012323" disabled />
      </Form.Group>
      <Form.Group
        controlId="formPatientID"
        style={{ marginTop: "20px", flex: "1 1 100%" }}
      >
        <Form.Label>Patient ID</Form.Label>
        <Form.Control type="text" value="PT32403" disabled />
      </Form.Group>
    </div>
  );
};

export default function DrugPiorAuthPage() {
  return (
    <div style={{ marginLeft: 50, marginBottom: 50 }}>
      <div className="page-heading">
        Send a Prior-Authorizing Request for Drugs
      </div>
      <DetailsDiv />
      <PrescribedForm />
      <DiagnosisForm />
      <Button
        variant="primary"
        type="submit"
        style={{ marginTop: "30px", float: "right", marginBottom: "30px" }}
      >
        SUBMIT
      </Button>
      <style jsx>{`
        .card {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .card-body {
          flex: 1;
        }
      `}</style>
    </div>
  );
}
