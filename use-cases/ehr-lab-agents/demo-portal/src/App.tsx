import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Home } from './pages/Home'
import { PhysicianHome } from './pages/PhysicianHome'
import { PatientPage } from './pages/PatientPage'
import { AssessmentPage } from './pages/AssessmentPage'
import { PatientHome, PatientJourneyPage } from './pages/PatientPages'
import { LabConsole } from './pages/LabConsole'
import { AgentManagerPage } from './pages/AgentManagerPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/physician" element={<PhysicianHome />} />
        <Route path="/physician/ehrs/:ehr/patients/:patientId" element={<PatientPage />} />
        <Route path="/physician/assessments/:id" element={<AssessmentPage />} />
        <Route path="/patient" element={<PatientHome />} />
        <Route path="/patient/:ehr/:patientId" element={<PatientJourneyPage />} />
        <Route path="/lab" element={<LabConsole />} />
        <Route path="/agent-manager" element={<AgentManagerPage />} />
      </Routes>
    </AppShell>
  )
}
