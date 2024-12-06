interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

interface Category {
  coding?: Coding[];
}

interface Reference {
  reference?: string;
  display?: string;
}

interface Actor {
  reference?: string;
  display?: string;
}

interface Participant {
  actor?: Actor;
  required?: string;
  status?: string;
  type?: Category[];
}

interface Period {
  start?: string ;
  end?: string ;
}

export interface AppointmentResource {
  resourceType: string;
  id: string;
  text?: {
    status: string;
    div: string;
  };
  status?: string;
  serviceCategory?: Category[];
  serviceType?: Category[];
  specialty?: Category[];
  appointmentType?: Category;
  reasonReference?: Reference[];
  priority?: number;
  description?: string;
  start?:  string ;
  end?: string ;
  created?: string;
  basedOn?: Reference[];
  participant?: Participant[];
  requestedPeriod?: Period[];
}