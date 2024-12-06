export enum CDSIndicator {
    WARNING = 'warning',
    INFO = 'info',
    CRITICAL = 'critical',
}

export enum CDSSelectorBehavior {
    Single = 'at-most-one',
    Multi = 'any',
}

export enum CDSActionType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
}

interface CDSLink {
    label: string;
    url: string;
    type: string;
    appContext?: string;
}

interface CDSActions {
    type: CDSActionType;
    description: string;
    resource?: unknown; 
    resourceId?: string;
}

interface CDSSuggesstion {
    label: string;
    uuid?: string;
    isRecommended?: boolean;
    actions?: CDSActions[];
}

interface CDSCoding {
    code: string;
    system: string;
    display?: string;
}

interface CDSSource {
    label: string;
    url?: string;
    icon?: string;
    topic?: CDSCoding;
}

export interface SystemActionExtension {
    extension: Extension[];
}

interface Extension {
    url: string;
    valueReference?: {
        reference: string;
    };
    valueCode?: string;
    valueCoding?: {
        system: string;
        code: string;
    }
    valueCodeableConcept?: {
        coding: CDSCoding[];
        text: string;
    }
}

export interface CoverageCardProps {
    source: CDSSource;
    summary: string;
    indicator: CDSIndicator;
    detail?: string;
    suggestions?: CDSSuggesstion[];
    selectorBehavior?: CDSSelectorBehavior;
    links?: CDSLink[];
    isPreview: boolean;
}