interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

interface Note {
  text: string;
}

interface Code {
  coding: Coding[];
}

interface Contained {
  resourceType: string;
  id: string;
  code: Code;
}

interface DoseAndRate {
  type: Code;
  doseQuantity: {
    value: number;
    unit: string;
    system: string;
    code: string;
  };
}

interface DosageInstruction {
  sequence?: number;
  text?: string;
  additionalInstruction?: Code[];
  timing?: {
    repeat: {
      frequency: number;
      period: number;
      periodUnit: string;
    };
  };
  route?: Code;
  method?: Code;
  doseAndRate?: DoseAndRate[];
}

export interface MedicationRequest {
  resourceType: string;
  id: string;
  text?: {
    status: string;
    div: string;
  };
  contained?: Contained[];
  status?: string;
  intent?: string;
  medicationReference?: {
    reference: string;
  };
  subject?: {
    reference: string;
  };
  encounter?: {
    reference: string;
  };
  authoredOn?: string;
  requester?: {
    reference: string;
  };
  reasonCode?: Code[];
  note?: Note[];
  dosageInstruction?: DosageInstruction[];
  dispenseRequest?: {
    validityPeriod?: {
      start: string;
      end: string;
    };
    numberOfRepeatsAllowed?: number;
    quantity?: {
      value: number;
      unit: string;
      system: string;
      code: string;
    };
    expectedSupplyDuration?: {
      value: number;
      unit: string;
      system: string;
      code: string;
    };
  };
}
