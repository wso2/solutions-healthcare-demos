interface Coding {
    id?: string;
    extension?: object;
    system?: string;
    version?: string;
    code?: string;
    display?: string;
    userSelected?: boolean;
  }
  
  enum ActionType {
    CREATE = "create",
    UPDATE = "update",
    DELETE = "delete",
  }
  
  interface Action {
    type: ActionType;
    description: string;
    resource?: object;
    resourceId?: string;
  }
  
  interface Source {
    label: string;
    url?: string;
    icon?: string;
    topic?: Coding;
  }
  
  interface Suggestion {
    label: string;
    uuid?: string;
    isRecommended?: boolean;
    actions?: Action[];
  }
  
  enum LinkType {
    ABSOLUTE = "absolute",
    SMART = "smart",
  }
  
  export interface CdsLink {
    label: string;
    url: string;
    type: LinkType;
    appContext?: string;
  }
  
  export interface CdsCard {
    uuid?: string;
    summary: string;
    detail?: string;
    indicator: string;
    source: Source;
    suggestions?: Suggestion[];
    selectionBehavior?: string;
    overrideReason?: Coding[];
    links?: CdsLink[];
  }
  
  export interface CdsResponse {
    cards: CdsCard[];
    systemActions?: Action[];
  }