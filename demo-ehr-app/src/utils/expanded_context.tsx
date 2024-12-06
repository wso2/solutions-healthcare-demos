import { createContext, useState, ReactNode } from "react";

interface ProviderProps {
    children: ReactNode;
}

const ExpandedContext = createContext({expanded: false, toggleExpanded: () => {} });

const ExpandedContextProvider = ({ children }: ProviderProps) => {
    const [expanded, setExpanded] = useState(false);

    const toggleExpanded = () => {
        setExpanded(!expanded);
    };

    return (
        <ExpandedContext.Provider value={{expanded, toggleExpanded}}>
            {children}
        </ExpandedContext.Provider>
    );
}

export { ExpandedContext, ExpandedContextProvider };
