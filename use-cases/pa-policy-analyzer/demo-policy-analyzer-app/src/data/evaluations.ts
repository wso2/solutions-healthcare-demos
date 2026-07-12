import type { Evaluation } from './types';

export const evaluations: Evaluation[] = [
  {
    id: 'eval-001',
    patient_id: 'pat-001',
    patient_name: 'John Mitchell',
    policy_id: 'pol-uhc-27447',
    cpt_code: '27447',
    cpt_description: 'Total Knee Arthroplasty (TKA)',
    payer: 'UnitedHealthcare',
    timestamp: '2024-02-05T09:14:22Z',
    status: 'approved',
    reviewer: 'Dr. Amanda Reyes',
    overall_reasoning:
      'All mandatory criteria satisfied. Patient has documented OA diagnosis, completed 10 weeks of PT with insufficient response, has been on NSAIDs for 8 months, KOOS 34/100 indicating severe impairment, KL Grade 4 on imaging. No contraindications present. Authorization recommended.',
    results: [
      {
        clause_id: 'C1',
        status: 'satisfied',
        confidence: 0.99,
        ai_augmented: false,
        reasoning:
          'ICD-10 code M17.11 (Primary OA right knee) confirmed in active problem list with onset 2019-08-01.',
        evidence: [
          {
            source: 'Active Problem List',
            document_id: 'cond-001',
            date: '2019-08-01',
            text: 'Primary osteoarthritis, right knee (M17.11)',
            resource_type: 'Condition',
          },
        ],
      },
      {
        clause_id: 'C2a',
        status: 'satisfied',
        confidence: 0.97,
        ai_augmented: true,
        reasoning:
          'Physical therapy procedure (97110) completed September–November 2023, 10 weeks duration (exceeds required 6 weeks). PT discharge summary confirms inadequate response.',
        evidence: [
          {
            source: 'Procedure Record',
            document_id: 'proc-001',
            date: '2023-09-01',
            text: 'Physical therapy — therapeutic exercises (97110), 10-week course. Outcome: Insufficient improvement; pain persists at 7/10.',
            resource_type: 'Procedure',
          },
          {
            source: 'PT Discharge Summary',
            document_id: 'note-002',
            date: '2023-11-30',
            text: 'Patient completed 10-week supervised physical therapy program. Goals of achieving functional independence and pain control were not met.',
            resource_type: 'DocumentReference',
          },
        ],
      },
      {
        clause_id: 'C2b',
        status: 'satisfied',
        confidence: 0.95,
        ai_augmented: false,
        reasoning:
          'Meloxicam 15mg (NSAID) active since 2023-06-01 — 8 months of continuous NSAID therapy (exceeds required 3 months). Prior Ibuprofen also used Jan 2022–May 2023.',
        evidence: [
          {
            source: 'Medication List',
            document_id: 'med-001',
            date: '2023-06-01',
            text: 'Meloxicam 15mg — active. Indication: Osteoarthritis pain management. Start: 2023-06-01.',
            resource_type: 'MedicationRequest',
          },
        ],
      },
      {
        clause_id: 'C2c',
        status: 'satisfied',
        confidence: 0.93,
        ai_augmented: true,
        reasoning:
          'Orthopedic note documents pain at 7/10 at most recent visit (2024-02-01) after 10 weeks PT and 8 months NSAID therapy. Meets threshold for inadequate response.',
        evidence: [
          {
            source: 'Orthopedic Consultation Note',
            document_id: 'note-001',
            date: '2024-02-01',
            text: 'He has undergone 10 weeks of physical therapy without significant improvement, achieving < 20% pain reduction. He has been on Meloxicam 15mg daily for 8 months with inadequate pain control.',
            resource_type: 'DocumentReference',
          },
          {
            source: 'Pain Assessment',
            document_id: 'obs-001',
            date: '2024-02-01',
            text: 'Pain severity — right knee: 7/10 NRS',
            resource_type: 'Observation',
          },
        ],
      },
      {
        clause_id: 'C3',
        status: 'satisfied',
        confidence: 0.98,
        ai_augmented: false,
        reasoning:
          'KOOS functional score 34/100 (severe impairment). Policy threshold is KOOS < 60. Score is well below threshold.',
        evidence: [
          {
            source: 'Functional Assessment',
            document_id: 'obs-003',
            date: '2024-02-01',
            text: 'KOOS Function Score: 34/100 (lower = worse)',
            resource_type: 'Observation',
          },
        ],
      },
      {
        clause_id: 'C4',
        status: 'satisfied',
        confidence: 0.99,
        ai_augmented: false,
        reasoning:
          'X-ray right knee (73560) obtained 2024-01-08 demonstrates Kellgren-Lawrence Grade 4 — severe joint space narrowing. Exceeds required KL Grade ≥ 3.',
        evidence: [
          {
            source: 'Radiology Report',
            document_id: 'proc-003',
            date: '2024-01-08',
            text: 'X-ray right knee, 2 views. Outcome: Kellgren-Lawrence Grade 4 — severe joint space narrowing.',
            resource_type: 'ImagingStudy',
          },
        ],
      },
      {
        clause_id: 'C5a',
        status: 'satisfied',
        confidence: 0.96,
        ai_augmented: false,
        reasoning: 'No diagnosis codes for active joint infection found in problem list or recent notes.',
        evidence: [
          {
            source: 'Problem List',
            document_id: 'cond-001',
            date: '2024-02-01',
            text: 'Active conditions: OA right knee (M17.11), T2DM (E11.9), Hypertension (I10). No infection codes present.',
            resource_type: 'Condition',
          },
        ],
      },
      {
        clause_id: 'C5b',
        status: 'satisfied',
        confidence: 0.97,
        ai_augmented: false,
        reasoning: 'No coagulation disorder diagnosis in problem list. No anticoagulant medications on record.',
        evidence: [
          {
            source: 'Medication List',
            document_id: 'med-001',
            date: '2024-02-01',
            text: 'Active medications: Meloxicam, Metformin, Lisinopril. No anticoagulants present.',
            resource_type: 'MedicationRequest',
          },
        ],
      },
      {
        clause_id: 'C5c',
        status: 'satisfied',
        confidence: 0.99,
        ai_augmented: false,
        reasoning: 'BMI 29.4 kg/m² — well below threshold of 40 kg/m². No BMI exclusion.',
        evidence: [
          {
            source: 'Vitals',
            document_id: 'obs-002',
            date: '2024-02-01',
            text: 'BMI: 29.4 kg/m²',
            resource_type: 'Observation',
          },
        ],
      },
    ],
  },
  {
    id: 'eval-002',
    patient_id: 'pat-002',
    patient_name: 'Sarah Chen',
    policy_id: 'pol-aetna-27447',
    cpt_code: '27447',
    cpt_description: 'Total Knee Arthroplasty (TKA)',
    payer: 'Aetna',
    timestamp: '2024-02-16T14:30:05Z',
    status: 'pending_review',
    overall_reasoning:
      'Two criteria require human review: PT duration is 4 weeks (below 6-week minimum) and BMI 38.1 is within the 40 kg/m² threshold but borderline. Surgical clearance letter requested from bariatric team.',
    results: [
      {
        clause_id: 'A1',
        status: 'satisfied',
        confidence: 0.99,
        ai_augmented: false,
        reasoning: 'ICD-10 M17.12 (Primary OA left knee) confirmed in active problem list.',
        evidence: [
          {
            source: 'Active Problem List',
            document_id: 'cond-010',
            date: '2021-11-01',
            text: 'Primary osteoarthritis, left knee (M17.12)',
            resource_type: 'Condition',
          },
        ],
      },
      {
        clause_id: 'A2a',
        status: 'insufficient',
        confidence: 0.95,
        ai_augmented: false,
        reasoning:
          'PT course started 2024-01-10 — only 4 weeks completed at time of evaluation. Policy requires ≥ 6 weeks. Additional 2 weeks of PT must be completed.',
        evidence: [
          {
            source: 'Procedure Record',
            document_id: 'proc-010',
            date: '2024-01-10',
            text: 'Physical therapy — therapeutic exercises (97110). Duration: 4 weeks. Partial improvement; pain reduced from 6/10 to 5/10.',
            resource_type: 'Procedure',
          },
        ],
      },
      {
        clause_id: 'A2b',
        status: 'satisfied',
        confidence: 0.92,
        ai_augmented: false,
        reasoning:
          'Naproxen 500mg started 2023-10-01 (4 months) and Acetaminophen started 2023-08-01 (6 months). Combined analgesic therapy exceeds 3-month requirement.',
        evidence: [
          {
            source: 'Medication List',
            document_id: 'med-010',
            date: '2023-10-01',
            text: 'Naproxen 500mg — active. Start: 2023-10-01 (4 months duration).',
            resource_type: 'MedicationRequest',
          },
        ],
      },
      {
        clause_id: 'A3',
        status: 'satisfied',
        confidence: 0.98,
        ai_augmented: false,
        reasoning: 'X-ray left knee shows KL Grade 3 — meets Aetna threshold of KL Grade ≥ 2.',
        evidence: [
          {
            source: 'Radiology Report',
            document_id: 'proc-011',
            date: '2024-01-05',
            text: 'X-ray left knee, 3 views. KL Grade 3 — moderate joint space narrowing.',
            resource_type: 'ImagingStudy',
          },
        ],
      },
      {
        clause_id: 'A4a',
        status: 'satisfied',
        confidence: 0.97,
        ai_augmented: false,
        reasoning: 'No active infection diagnosis codes. No antibiotic prescriptions on record.',
        evidence: [
          {
            source: 'Problem List',
            document_id: 'cond-010',
            date: '2024-02-15',
            text: 'Active conditions: Left knee OA (M17.12), Morbid obesity (E66.01). No infection codes.',
            resource_type: 'Condition',
          },
        ],
      },
      {
        clause_id: 'A4b',
        status: 'needs_review',
        confidence: 0.6,
        ai_augmented: true,
        reasoning:
          'BMI 38.1 kg/m² — below the 40 kg/m² threshold but elevated. Orthopedic note references pending bariatric clearance letter. Recommend human review to confirm clearance documentation received.',
        evidence: [
          {
            source: 'Vitals',
            document_id: 'obs-011',
            date: '2024-02-15',
            text: 'BMI: 38.1 kg/m²',
            resource_type: 'Observation',
          },
          {
            source: 'Orthopedic Note',
            document_id: 'note-010',
            date: '2024-02-15',
            text: 'Surgical clearance from bariatric team has been requested.',
            resource_type: 'DocumentReference',
          },
        ],
      },
    ],
  },
  {
    id: 'eval-003',
    patient_id: 'pat-003',
    patient_name: 'Robert Davis',
    policy_id: 'pol-cigna-27447',
    cpt_code: '27447',
    cpt_description: 'Total Knee Arthroplasty (TKA)',
    payer: 'Cigna',
    timestamp: '2024-02-12T11:05:44Z',
    status: 'denied',
    reviewer: 'Dr. Paul Harrison',
    overall_reasoning:
      'Authorization denied. Two absolute contraindications identified: active Staphylococcal joint infection (M00.061) confirmed by culture 01/21/2024, and uncorrected coagulopathy (D68.9) on active Warfarin therapy. Elective TKA is contraindicated until infection resolves and coagulation is corrected.',
    results: [
      {
        clause_id: 'G1',
        status: 'satisfied',
        confidence: 0.99,
        ai_augmented: false,
        reasoning: 'Bilateral knee OA (M17.0) confirmed in problem list, onset 2018.',
        evidence: [
          {
            source: 'Active Problem List',
            document_id: 'cond-020',
            date: '2018-04-01',
            text: 'Bilateral primary osteoarthritis of knee (M17.0)',
            resource_type: 'Condition',
          },
        ],
      },
      {
        clause_id: 'G2a',
        status: 'satisfied',
        confidence: 0.97,
        ai_augmented: false,
        reasoning: 'PT completed July 2023, 8 weeks duration (exceeds 6-week requirement).',
        evidence: [
          {
            source: 'Procedure Record',
            document_id: 'proc-020',
            date: '2023-07-01',
            text: 'Physical therapy — 8-week course completed. Pain reduced to 5/10.',
            resource_type: 'Procedure',
          },
        ],
      },
      {
        clause_id: 'G2b',
        status: 'satisfied',
        confidence: 0.94,
        ai_augmented: false,
        reasoning: 'Meloxicam used from 2023-02-01 to 2024-01-20 (11 months). Exceeds 3-month requirement.',
        evidence: [
          {
            source: 'Medication History',
            document_id: 'med-022',
            date: '2023-02-01',
            text: 'Meloxicam 15mg — completed. Duration: Feb 2023 – Jan 2024 (11 months).',
            resource_type: 'MedicationRequest',
          },
        ],
      },
      {
        clause_id: 'G2c',
        status: 'satisfied',
        confidence: 0.89,
        ai_augmented: true,
        reasoning: 'Corticosteroid injection documented (20610) in procedure history via AI note extraction.',
        evidence: [
          {
            source: 'Orthopedic Note',
            document_id: 'note-020',
            date: '2024-02-10',
            text: 'Patient has received prior corticosteroid injections for bilateral knee OA.',
            resource_type: 'DocumentReference',
          },
        ],
      },
      {
        clause_id: 'G3',
        status: 'satisfied',
        confidence: 0.99,
        ai_augmented: false,
        reasoning: 'X-ray bilateral knees (Sept 2023) shows KL Grade 4 — exceeds KL ≥ 3 requirement.',
        evidence: [
          {
            source: 'Radiology Report',
            document_id: 'proc-021',
            date: '2023-09-10',
            text: 'X-ray bilateral knees. KL Grade 4 bilateral — severe OA.',
            resource_type: 'ImagingStudy',
          },
        ],
      },
      {
        clause_id: 'G4a',
        status: 'insufficient',
        confidence: 0.99,
        ai_augmented: false,
        reasoning:
          'ACTIVE CONTRAINDICATION: Staphylococcal arthritis right knee (M00.061) diagnosed 2024-01-20. Culture positive for Staph aureus. Patient currently on IV Vancomycin. Active infection is an absolute contraindication to elective TKA.',
        evidence: [
          {
            source: 'Active Problem List',
            document_id: 'cond-021',
            date: '2024-01-20',
            text: 'Staphylococcal arthritis, right knee (M00.061) — ACTIVE',
            resource_type: 'Condition',
          },
          {
            source: 'Procedure Report',
            document_id: 'proc-022',
            date: '2024-01-21',
            text: 'Knee joint aspiration and culture — Positive Staph aureus — active septic arthritis confirmed.',
            resource_type: 'Procedure',
          },
          {
            source: 'Medication List',
            document_id: 'med-020',
            date: '2024-01-22',
            text: 'Vancomycin IV — active. Indication: Active Staphylococcal joint infection.',
            resource_type: 'MedicationRequest',
          },
        ],
      },
      {
        clause_id: 'G4b',
        status: 'insufficient',
        confidence: 0.98,
        ai_augmented: false,
        reasoning:
          'ACTIVE CONTRAINDICATION: Coagulation defect (D68.9) on active Warfarin 5mg therapy. INR 2.8 — not corrected. Uncorrected coagulopathy is an absolute contraindication.',
        evidence: [
          {
            source: 'Active Problem List',
            document_id: 'cond-022',
            date: '2020-06-01',
            text: 'Coagulation defect, unspecified (D68.9)',
            resource_type: 'Condition',
          },
          {
            source: 'Medication List',
            document_id: 'med-021',
            date: '2020-07-01',
            text: 'Warfarin 5mg — active. INR 2.8.',
            resource_type: 'MedicationRequest',
          },
        ],
      },
    ],
  },
  {
    id: 'eval-004',
    patient_id: 'pat-001',
    patient_name: 'John Mitchell',
    policy_id: 'pol-uhc-27447',
    cpt_code: '27447',
    cpt_description: 'Total Knee Arthroplasty (TKA)',
    payer: 'UnitedHealthcare',
    timestamp: '2024-01-15T08:22:11Z',
    status: 'approved',
    reviewer: 'Dr. Amanda Reyes',
    overall_reasoning: 'All criteria met. Authorization approved.',
    results: [],
  },
];

export const getEvaluation = (id: string): Evaluation | undefined =>
  evaluations.find((e) => e.id === id);

export const getEvaluationsForPatient = (patientId: string): Evaluation[] =>
  evaluations.filter((e) => e.patient_id === patientId);
