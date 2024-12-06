import { QUATERNARY_COLOR } from "../constants/color";
import { SCREEN_WIDTH } from "../constants/page";
import { SERVICE_CARD_DETAILS, PATIENT_DETAILS } from "../constants/data";
import Button from "@mui/material/Button";
import { ServiceCardListProps } from "../components/interfaces/card";
import MultiActionAreaCard from "../components/serviceCard";
import { useContext } from "react";
import { ExpandedContext } from "../utils/expanded_context";
import { useSelector, useDispatch } from "react-redux";
import { updateCdsHook } from "../redux/cdsRequestSlice";

function ServiceCardList({ services, expanded }: ServiceCardListProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: expanded ? "repeat(1, 1fr)" : "repeat(3, 1fr)", gap: "20px", marginLeft: expanded ? "8vw" : "2vw"}}>
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

function PractitionerDashBoard() 
  {
  const { expanded } = useContext(ExpandedContext);
  const selectedPatientId = useSelector((state: any) => state.patient.selectedPatientId);
  let currentPatient = PATIENT_DETAILS.find((patient) => patient.id === selectedPatientId);
  const dispatch = useDispatch();

  dispatch(updateCdsHook("cds-services"));

  if (!currentPatient) {
    currentPatient = PATIENT_DETAILS[0];
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: expanded ? "column" :"row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        
        <div style={{ fontSize: 20, marginLeft: SCREEN_WIDTH * 0.01 }}>
          Patient: {currentPatient.name[0].given[0] + " " + currentPatient.name[0].family} ID: {currentPatient.id}
        </div>

        <Button
          variant="contained"
          href="/"
          style={{
            borderRadius: "50px",
            marginLeft: SCREEN_WIDTH * 0.3,
            backgroundColor: QUATERNARY_COLOR,
          }}
        >
          Dismiss Patient
        </Button>
      </div>

      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 48 }}>HealthCare HQ Services</h1>
      </div>

      <div style={{height: "5vh"}} />
      
      <ServiceCardList services={SERVICE_CARD_DETAILS} expanded={expanded}/>
    </div>
  );
}
export default PractitionerDashBoard;
