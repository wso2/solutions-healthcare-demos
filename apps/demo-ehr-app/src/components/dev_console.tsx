// Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { Box } from "@mui/material";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrowNight } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { useSelector } from "react-redux";
import "../assets/styles/code_theme.css";

const DevConsole = () => {
  const hook = useSelector((state: any) => state.cdsRequest.hook);
  const requestState = useSelector((state: any) => state.cdsRequest.request);
  const response = useSelector((state: any) => state.cdsResponse.cards);

  // Newly added
  const cdsRequest = requestState;

  return (
    <Box>
      <Box fontSize={36} fontWeight={200} textAlign={"center"}>
        Developer Console
      </Box>
      {hook && (
        <div
          style={{
            height: "5vh",
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
          {hook}
        </div>
      )}

      <div
        style={{
          height: "5vh",
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
          height: cdsRequest ? "100%" : "100vh",
          overflow: "auto",
          marginBottom: "3%",
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
          height: "5vh",
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

export default DevConsole;
