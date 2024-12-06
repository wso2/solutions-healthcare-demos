import ReactDOM from "react-dom/client";
import { ExpandedContextProvider } from "./utils/expanded_context.tsx";
import PatientEncounter from "./pages/patient_encounter_start.tsx";
import PractionerDashBoard from "./pages/practitioner_dashboard.tsx";
import AppointmentBookPage from "./pages/appointment_book_page.tsx";
import DrugOrderPage from "./pages/drug_order_page.tsx";
import { DrugDetailsPage } from "./pages/drug_details_page.tsx";
import DeviceOrderPage from "./pages/device_order_page.tsx";
import { DeviceDetailsPage } from "./pages/device_details_page.tsx";
import { PatientViewPage } from "./pages/patient_view.tsx";
import { CoverageCardDisplayPage } from "./pages/coverage_card_display_page.tsx";
import { Layout } from "./components/layout.tsx";
import {Provider} from "react-redux";
import store from "./redux/store.ts";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { Routes, Route } from "react-router-dom";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import MedicalImaging from "./pages/MedicalImaging.tsx";
import PriorAuth from "./pages/PriorAuth.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <ExpandedContextProvider>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PatientEncounter />} />
            <Route path="dashboard/*" element={<Layout />}>
              <Route index element={<PractionerDashBoard />} />
              <Route path="medical-imaging" element={<MedicalImaging />} />
              <Route path="medical-imaging/prior-auth" element={<PriorAuth />} />
              <Route
                path="appointment-schedule"
                element={<AppointmentBookPage />}
              />
              <Route
                path="appointment-schedule/coverage-preview"
                element={<CoverageCardDisplayPage />}
              />
              <Route
                path="appointment-schedule/coverage"
                element={<CoverageCardDisplayPage />}
              />
              <Route path="drug-order" element={<DrugOrderPage />} />
              <Route
                path="drug-order/:drugName"
                element={<DrugDetailsPage />}
              />
              <Route
                path="drug-order/:drugName/coverage-preview"
                element={<CoverageCardDisplayPage />}
              />
              <Route
                path="drug-order/:drugName/coverage"
                element={<CoverageCardDisplayPage />}
              />
              <Route path="device-order" element={<DeviceOrderPage />} />
              <Route
                path="device-order/:deviceName"
                element={<DeviceDetailsPage />}
              />
              <Route
                path="device-order/:deviceName/coverage-preview"
                element={<CoverageCardDisplayPage />}
              />
              <Route
                path="device-order/:deviceName/coverage"
                element={<CoverageCardDisplayPage />}
              />
              <Route path="patient" element={<PatientViewPage />} />
            </Route>

            <Route path="settings" element={<div>Not Implemented</div>} />
          </Routes>
        </BrowserRouter>
      </LocalizationProvider>
    </ExpandedContextProvider>
  </Provider>
);
