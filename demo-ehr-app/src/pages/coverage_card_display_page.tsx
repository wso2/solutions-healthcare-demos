import { useContext } from "react";
import { ExpandedContext } from "../utils/expanded_context";
import { useSelector } from "react-redux";
import { SystemActionComponent } from "../components/systemAction";

export function CoverageCardDisplayPage() {
  const { expanded } = useContext(ExpandedContext);

  const cdsResponse = useSelector((state: any) => state.cdsResponse);
  console.log("cdsResponse in CoverageCardDisplayPage");
  console.log(cdsResponse);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: expanded ? "repeat(1, 1fr)" : "repeat(2, 1fr)",
          gap: "20px",
          columnGap: "10px",
          justifyItems: "center",
        }}
      >
        {/* {cdsResponse.cards.map((coverageCard) => (
          <CoverageCard
            indicator={coverageCard.indicator as CDSIndicator}
            links={coverageCard.links}
            source={coverageCard.source}
            suggestions={coverageCard.suggestions?.map((suggestion) => ({
              ...suggestion,
              actions: suggestion.actions.map((action) => ({
                ...action,
                type: action.type as CDSActionType,
              })),
            }))}
            selectorBehavior={
              coverageCard.selectorBehavior as CDSSelectorBehavior
            }
            summary={coverageCard.summary}
            detail={coverageCard.detail}
            isPreview={isPreview}
          />
        ))} */}
        {cdsResponse.systemActions &&
          cdsResponse.systemActions[0].resource &&
          cdsResponse.systemActions[0].resource.extension && (
            <SystemActionComponent
              extension={cdsResponse.systemActions[0].resource.extension}
            />
          )}
      </div>
    </div>
  );
}
