import { useState, useEffect } from "react";
import { SelectChangeEvent } from "@mui/material/Select";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "../constants/page";
import { DropDownBox } from "../components/dropDown";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import { QUATERNARY_COLOR } from "../constants/color";
import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { ExpandedContext } from "../utils/expanded_context";
import { APPOINTMENT_TYPE, SPECIALITY, PRACTITIONERS } from "../constants/data";
import { constructAppointmentResource } from "../utils/appointment_resource_constructor";
import { useDispatch, useSelector } from "react-redux";
import { updateCdsHook, updateCdsContext } from "../redux/cdsRequestSlice";
import {Dayjs} from "dayjs";

export default function AppointmentBookPage() {
  const { expanded } = useContext(ExpandedContext);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const selectedPatientId = useSelector((state: any) => state.patient.selectedPatientId);

  const [filteredPractitioners, setFilteredPractitioners] = useState<string[]>(
    []
  );

  const [filteredTreatingDiseases, setFilteredTreatingDiseases] = useState<
    string[]
  >([]);

  const [filteredHospital, setFilteredHospital] = useState<string[]>([]);
  const [filteredSlots, setFilteredSlots] = useState<string[]>([]);

  const [description, setDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [selectedPractitioner, setSelectedPractitioner] = useState("");
  const [selectedSpeciality, setSelectedSpeciality] = useState("");
  const [selectedHospital, setSelectedHospital] = useState("");
  const [selectedSlots, setSelectedSlots] = useState("");
  const [selectedAppointmentType, setSelectedAppointmentType] = useState("");
  const [selectedTreatingDisease, setSelectedTreatingDisease] = useState("");

  const form_selector_width = SCREEN_WIDTH * 0.3;

  const appointmentTypeOptions: string[] = [];

  APPOINTMENT_TYPE.forEach((appointmentType) => {
    appointmentTypeOptions.push(appointmentType.display);
  });

  const specialityOptions: string[] = [];

  SPECIALITY.forEach((speciality) => {
    specialityOptions.push(speciality.Display);
  });

  const handlePreviewClick = (contextData: string) => {
    navigate("coverage-preview", { state: contextData });
  };

  const handleScheduleClick = (contextData: string) => {
    navigate("coverage", { state: contextData });
  };

  const handleDateChange = (date: Dayjs | null) => {
    setSelectedDate(date);
  }

  const handleChangeDescription = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDescription(event.target.value);
  }

  const handleChangeTreatingDisease = (event: SelectChangeEvent) => {
    setSelectedTreatingDisease(event.target.value);
  };

  const handleChangeAppointmentType = (event: SelectChangeEvent) => {
    setSelectedAppointmentType(event.target.value);
  };

  const handleChangePractitioner = (event: SelectChangeEvent) => {
    setSelectedPractitioner(event.target.value);

    const filteredHospitals: string[] = PRACTITIONERS.filter(
      (practitioner) => practitioner.Name === event.target.value
    ).flatMap((practitioner) =>
      practitioner.Appointments.map((appointment) => appointment.Hospital)
    );

    setFilteredHospital(filteredHospitals);
  };

  const handleChangeSpeciality = (event: SelectChangeEvent) => {
    setSelectedSpeciality(event.target.value);

    const filteredPractitioners: string[] = SPECIALITY.filter(
      (specialityData) => specialityData.Display === event.target.value
    ).flatMap((specialityData) =>
      specialityData.Practitioners.map((practitioner) => practitioner.Name)
    );

    const filteredTreatingDiseases: string[] = SPECIALITY.filter(
      (specialityData) => specialityData.Display === event.target.value
    ).flatMap((specialityData) =>
      specialityData.Treatings.map((treating) => treating.disease)
    );

    setFilteredTreatingDiseases(filteredTreatingDiseases);
    setFilteredPractitioners(filteredPractitioners);
  };

  const handleChangeHospital = (event: SelectChangeEvent) => {
    setSelectedHospital(event.target.value);

    const filteredSlots: string[] = PRACTITIONERS.filter(
      (practitioner) => practitioner.Name === selectedPractitioner
    ).flatMap((practitioner) =>
      practitioner.Appointments.flatMap((appointment) =>
        appointment.Hospital === event.target.value
          ? appointment.Slots.map(
              (slot) => slot.StartTime + " - " + slot.EndTime
            )
          : []
      )
    );

    setFilteredSlots(filteredSlots);
  };

  const handleChangeSlots = (event: SelectChangeEvent) => {
    setSelectedSlots(event.target.value);
  }; 

  useEffect(() => {
    let formattedDate = selectedDate?.format("YYYY-MM-DD");
    if (!formattedDate) {
      formattedDate = "";
    }
    const appointment_resource = constructAppointmentResource(
      selectedPractitioner,
      selectedSpeciality,
      formattedDate, 
      selectedHospital,
      selectedSlots,
      selectedTreatingDisease,
      selectedAppointmentType,
      description,
      selectedPatientId
    );

    const appointmentCDSContext = {
      userID: "123",
      patientID: selectedPatientId,
      encounterID: "456",
      appointments: [appointment_resource],
    };

    dispatch(updateCdsHook("appointment-book"));
    dispatch(updateCdsContext(appointmentCDSContext));

  }, [
    selectedPractitioner,
    selectedSpeciality,
    selectedHospital,
    selectedSlots,
    selectedTreatingDisease,
    selectedAppointmentType,
    selectedPatientId,
    selectedDate,
    description,
    dispatch
  ]);

  return (
    <div
      style={{ display: "flex", flexDirection: expanded ? "column" : "row" }}
    >
      {expanded && (
        <img
          src="/appointment_book.png"
          alt="Healthcare"
          style={{
            marginLeft: SCREEN_WIDTH * 0.05,
            height: SCREEN_HEIGHT * 0.5,
            width: SCREEN_WIDTH * 0.3,
          }}
        />
      )}

      <div style={{ marginLeft: SCREEN_WIDTH * 0.07 }}>
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            marginBottom: 30,
            marginLeft: -20,
          }}
        >
          Book an Appointment
        </div>

        <DropDownBox
          dropdown_label="Speciality"
          dropdown_options={specialityOptions}
          selectedValue={selectedSpeciality}
          handleChange={handleChangeSpeciality}
          form_selector_width={form_selector_width}
        />

        <DropDownBox
          dropdown_label="Practitioner"
          dropdown_options={filteredPractitioners}
          selectedValue={selectedPractitioner}
          handleChange={handleChangePractitioner}
          form_selector_width={form_selector_width}
        />

        <div style={{ marginLeft: 8, marginBottom: 10, marginTop: 10 }}>
          <DatePicker sx={{ minWidth: form_selector_width }} value={selectedDate} onChange={handleDateChange}/>
        </div>

        <DropDownBox
          dropdown_label="Hospital"
          dropdown_options={filteredHospital}
          selectedValue={selectedHospital}
          handleChange={handleChangeHospital}
          form_selector_width={form_selector_width}
        />

        <DropDownBox
          dropdown_label="Slots"
          dropdown_options={filteredSlots}
          selectedValue={selectedSlots}
          handleChange={handleChangeSlots}
          form_selector_width={form_selector_width}
        />

        <DropDownBox
          dropdown_label="Treating"
          dropdown_options={filteredTreatingDiseases}
          selectedValue={selectedTreatingDisease}
          handleChange={handleChangeTreatingDisease}
          form_selector_width={form_selector_width}
        />
      </div>

      <div
        style={{
          marginLeft: SCREEN_WIDTH * 0.1,
          marginTop: SCREEN_HEIGHT * 0.07,
        }}
      >
        {!expanded && (
          <img
            src="/appointment_book.png"
            alt="Healthcare"
            style={{ marginLeft: SCREEN_WIDTH * 0.05 }}
          />
        )}

        <div
          style={{
            marginTop: expanded ? -40 : 10,
            marginLeft: expanded ? -40 : 0,
          }}
        >
          <DropDownBox
            dropdown_label="Appointment Type"
            dropdown_options={appointmentTypeOptions}
            selectedValue={selectedAppointmentType}
            handleChange={handleChangeAppointmentType}
            form_selector_width={form_selector_width}
          />
        </div>

        <TextField
          id="outlined-multiline-static"
          label="Description"
          multiline
          value={description}
          onChange={handleChangeDescription}
          rows={5}
          sx={{
            marginLeft: expanded ? -SCREEN_WIDTH * 0.003 : 1,
            minWidth: expanded ? SCREEN_WIDTH * 0.35 : SCREEN_WIDTH * 0.4,
            marginTop: 1,
          }}
        />

        <div style={{ display: "flex", flexDirection: "row" }}>
          <Button
            variant="contained"
            onClick={() => handlePreviewClick("preview")}
            style={{
              borderRadius: "50px",
              marginLeft: SCREEN_WIDTH * 0.22,
              marginTop: 20,
              backgroundColor: QUATERNARY_COLOR,
            }}
          >
            Preview
          </Button>
          <Button
            variant="contained"
            onClick={() => handleScheduleClick("schedule")}
            style={{
              borderRadius: "50px",
              marginLeft: 20,
              marginTop: 20,
              backgroundColor: QUATERNARY_COLOR,
            }}
          >
            Schedule
          </Button>
        </div>
      </div>
    </div>
  );
}
