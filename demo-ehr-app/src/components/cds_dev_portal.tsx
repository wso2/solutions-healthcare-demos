import { Box } from "@mui/material";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrowNight } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { useSelector } from "react-redux";
import "../assets/styles/code_theme.css";

const CDSDevPortal = () => {
  const hook = useSelector((state: any) => state.cdsRequest.hook);
  const requestState = useSelector((state: any) => state.cdsRequest.request);
  const response = useSelector((state: any) => state.cdsResponse.cards);

  // Newly added
  const cdsRequest = requestState;

  return (
    <Box>
      <Box fontSize={36} fontWeight={200} textAlign={"center"}>
        CDS Developer Portal
      </Box>
      <div
        style={{
          height: "8vh",
          width: "80%",
          borderRadius: 2,
          backgroundColor: "#D9D9D9",
          textAlign: "center",
          alignSelf: "center",
          marginTop: 30,
          marginLeft: "10%",
          fontSize: 24,
        }}
      >
        {hook ? hook : "dummy-service-name"}
      </div>

      <div
        style={{
          height: "8vh",
          width: "80%",
          borderRadius: 2,
          backgroundColor: "#D9D9D9",
          textAlign: "center",
          alignSelf: "center",
          marginTop: 30,
          marginLeft: "10%",
          fontSize: 24,
        }}
      >
        Request
      </div>

      <div
        style={{
          width: "80%",
          alignContent: "center",
          marginLeft: "10%",
          height: hook == "cds-services" ? "100%" : "100vh",
          overflow: "auto",
        }}
      >
        <SyntaxHighlighter
          language="json"
          style={tomorrowNight}
          showLineNumbers={true}
        >
          {hook != "cds-services"
            ? JSON.stringify(cdsRequest, null, 2)
            : "No Request Body"}
        </SyntaxHighlighter>
      </div>

      <div
        style={{
          height: "8vh",
          width: "80%",
          borderRadius: 2,
          backgroundColor: "#D9D9D9",
          textAlign: "center",
          alignSelf: "center",
          marginLeft: "10%",
          fontSize: 24,
        }}
      >
        Response
      </div>

      <div style={{ width: "80%", alignContent: "center", marginLeft: "10%" }}>
        <SyntaxHighlighter
          language="json"
          style={tomorrowNight}
          showLineNumbers={true}
        >
          {JSON.stringify(response, null, 2)}
        </SyntaxHighlighter>
      </div>
    </Box>
  );
};

export default CDSDevPortal;
