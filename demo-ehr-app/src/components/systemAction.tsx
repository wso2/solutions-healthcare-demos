import { SystemActionExtension } from "./interfaces/coverage";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import { PRIMARY_COLOR } from "../constants/color";

export const SystemActionComponent = (extension: SystemActionExtension) => {
  if (extension === undefined) {
    return null;
  }
  return (
    <Card variant="outlined" sx={{ width: 500, bgcolor: PRIMARY_COLOR }}>
      {extension.extension.map((ext, index) => (
        <CardContent key={index}>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <div>{ext.url}</div>
            <div>
              {ext.valueReference &&
                `${ext.valueReference.reference}`}
              {ext.valueCode && `${ext.valueCode}`}
              {ext.valueCoding && `${ext.valueCoding.code}`}
              {ext.valueCodeableConcept &&
                `${ext.valueCodeableConcept.text}`}
            </div>
          </div>
        </CardContent>
      ))}
    </Card>
  );
};
