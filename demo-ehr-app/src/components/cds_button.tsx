import { useContext } from "react";
import { Box, Button } from "@mui/material";
import { ExpandedContext } from "../utils/expanded_context";

export const CDSButton = () => {
  const { toggleExpanded } = useContext(ExpandedContext);

  return (
    <Box sx={{ display: "flex", alignItems: "center", height: "70vh" }}>
      <Button
        variant="outlined"
        sx={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          height: "70vh",
          minWidth: "2vw",
        }}
        onClick={toggleExpanded}
      >
        CDS Service Developer Portal
      </Button>
    </Box>
  );
};
