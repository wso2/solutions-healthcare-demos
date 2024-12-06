export interface ServiceCardProps {
    serviceImagePath: string;
    serviceName: string;
    serviceDescription: string;
    path: string;
}

export interface ServiceCardListProps {
    services: ServiceCardProps[];
    expanded: boolean;
}