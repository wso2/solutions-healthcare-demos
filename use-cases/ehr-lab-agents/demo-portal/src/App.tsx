import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Home } from './pages/Home'
import { PhysicianHome } from './pages/PhysicianHome'
import { PatientPage } from './pages/PatientPage'
import { AssessmentPage } from './pages/AssessmentPage'
import { PatientHome, PatientJourneyPage } from './pages/PatientPages'
import { LabConsole } from './pages/LabConsole'

// The home page shows the flow and opens each app in its own browser tab; an app has no navigation to
// the others, so every tab stays one persona.

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route element={<AppShell app="physician" />}>
        <Route path="/physician" element={<PhysicianHome />} />
        <Route path="/physician/ehrs/:ehr/patients/:patientId" element={<PatientPage />} />
        <Route path="/physician/assessments/:id" element={<AssessmentPage />} />
      </Route>
      <Route element={<AppShell app="patient" />}>
        <Route path="/patient" element={<PatientHome />} />
        <Route path="/patient/:ehr/:patientId" element={<PatientJourneyPage />} />
      </Route>
      <Route element={<AppShell app="lab" />}>
        <Route path="/lab" element={<LabConsole />} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
