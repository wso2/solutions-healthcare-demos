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

import React, { useEffect, useState } from "react";
import axios from "axios";
import Form from "react-bootstrap/Form";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import { useLocation } from "react-router-dom";
import { baseUrl, paths } from "../config/urlConfigs";
import Select from "react-select";

import { useDispatch, useSelector } from "react-redux";
import { updateRequest } from "../redux/cdsRequestSlice";
import { updateCdsResponse } from "../redux/cdsResponseSlice";

const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

const QuestionnniarForm = ({
  questionnaireId,
}: {
  questionnaireId: string;
}) => {
  const dispatch = useDispatch();
  const [questions, setQuestions] = useState<any[]>([]);
  const [formData, setFormData] = useState<{ [key: string]: any }>({});

  useEffect(() => {
    // Fetch the questionnaire data from the API
    axios
      .get(baseUrl + paths.questionnaire + questionnaireId)
      .then((response) => {
        const questionnaire = response.data;
        setQuestions(questionnaire.item || []);

        dispatch(
          updateCdsResponse({
            cards: questionnaire,
            systemActions: {},
          })
        );
      })
      .catch((error) => {
        console.error("Error fetching questionnaire data:", error);
      });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleBooleanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData({ ...formData, [name]: checked });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form Data:", formData);
    dispatch(updateRequest(formData));
  };

  const renderFormField = (question: any) => {
    switch (question.type) {
      case "boolean":
        return (
          <Select
            name={question.linkId}
            onChange={(selectedOption) =>
              handleBooleanChange({
                target: {
                  name: question.linkId,
                  checked: selectedOption?.value === "Yes",
                },
              } as React.ChangeEvent<HTMLInputElement>)
            }
            options={[
              { value: "Yes", label: "Yes" },
              { value: "No", label: "No" },
            ]}
          />
        );
      case "integer":
        return (
          <Form.Control
            type="number"
            name={question.linkId}
            value={formData[question.linkId] || ""}
            onChange={handleInputChange}
          />
        );
      case "string":
      default:
        return (
          <Form.Control
            type="text"
            name={question.linkId}
            value={formData[question.linkId] || ""}
            onChange={handleInputChange}
          />
        );
    }
  };

  return (
    <Card style={{ marginTop: "30px", padding: "20px" }}>
      <Card.Body>
        <Card.Title>Questionnaire</Card.Title>
        <Form onSubmit={handleSubmit}>
          {questions.map((question, index) => (
            <Form.Group
              controlId={`formQuestion${index}`}
              style={{ marginTop: "20px" }}
              key={index}
            >
              <Form.Label>{question.text}</Form.Label>
              {renderFormField(question)}
            </Form.Group>
          ))}
          <Button
            variant="primary"
            type="submit"
            style={{ marginTop: "30px", float: "right" }}
          >
            SUBMIT
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
};

const PrescribedForm = () => {
  const query = useQuery();
  const medicationFormData = useSelector(
    (state: any) => state.medicationFormData
  );
  console.log("medicationFormData", medicationFormData);
  const treatingSickness = medicationFormData.treatingSickness;
  const medication = medicationFormData.medication;
  const quantity = medicationFormData.quantity;
  const frequency = medicationFormData.frequency;
  const startDate = medicationFormData.startDate;
  return (
    <Card style={{ marginTop: "30px", padding: "20px" }}>
      <Card.Body>
        <Card.Title>Prescribed Medicine</Card.Title>
        <Form>
          <Form.Group
            controlId="formTreatingSickness"
            style={{ marginTop: "20px" }}
          >
            <Form.Label>Treating Sickness</Form.Label>
            <Form.Control
              type="text"
              value={treatingSickness || ""}
              readOnly
            />
          </Form.Group>

          <Form.Group controlId="formMedication" style={{ marginTop: "20px" }}>
            <Form.Label>Medication</Form.Label>
            <Form.Control
              type="text"
              value={medication || ""}
              readOnly
            />
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
              <Form.Control
                type="text"
                value={quantity || ""}
                readOnly
              />
            </Form.Group>

            <Form.Group
              controlId="formFrequency"
              style={{ marginTop: "20px", flex: "1 1 100%" }}
            >
              <Form.Label>Frequency</Form.Label>
              <Form.Control
                type="text"
                value={frequency || ""}
                readOnly
              />
            </Form.Group>

            <Form.Group
              controlId="formDuration"
              style={{ marginTop: "20px", flex: "1 1 100%" }}
            >
              <Form.Label>Duration (days)</Form.Label>
              <Form.Control
                type="text"
                value={frequency || ""}
                readOnly
              />
            </Form.Group>

            <Form.Group
              controlId="formStartDate"
              style={{ marginTop: "20px", flex: "1 1 100%", width: "100%" }}
            >
              <Form.Label>Starting Date</Form.Label>
              <br />
              <Form.Control
                type="text"
                value={startDate || ""}
                readOnly
              />
            </Form.Group>
          </div>
        </Form>
      </Card.Body>
    </Card>
  );
};

const DetailsDiv = ({ questionnaireId }: { questionnaireId: string }) => {
  return (
    <div style={{ display: "flex", gap: "20px" }}>
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
      <Form.Group
        controlId="formPatientName"
        style={{ marginTop: "20px", flex: "1 1 100%" }}
      >
        <Form.Label>Questionnaire ID</Form.Label>
        <Form.Control type="text" value={questionnaireId} disabled />
      </Form.Group>
    </div>
  );
};

export default function DrugPiorAuthPage() {
  const query = useQuery();
  const questionnaireId = query.get("questionnaireId");
  const medicationFormData = useSelector(
    (state: any) => state.medicationFormData
  );
  console.log("medicationFormData", medicationFormData);
  return (
    <div style={{ marginLeft: 50, marginBottom: 50 }}>
      <div className="page-heading">
        Send a Prior-Authorizing Request for Drugs
      </div>
      <DetailsDiv questionnaireId={questionnaireId || ""} />
      <PrescribedForm />
      <QuestionnniarForm questionnaireId={questionnaireId || ""} />
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
