interface Reference {
  reference: string;
}

interface Note {
  text: string;
}

export interface DeviceRequest {
  resourceType: string;
  id: string;
  text?: {
    status: string;
    div: string;
  };
  basedOn?: Reference[];
  status?: string;
  intent?: string;
  priority?: string;
  codeReference?: {
    reference: string;
  };
  note?: Note[];
  subject?: {
    reference: string;
  };
  authoredOn?: string;
  requester?: {
    reference: string;
  };
}
