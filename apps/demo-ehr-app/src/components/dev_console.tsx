// Copyright (c) 2024-2025, WSO2 LLC. (http://www.wso2.com).
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
  const requestUrl = useSelector((state: any) => state.cdsRequest.requestUrl);
  const requestMethod = useSelector(
    (state: any) => state.cdsRequest.requestMethod
  );
  const response = useSelector((state: any) => state.cdsResponse.cards);

  const cdsRequest = requestState;

  return (
    <Box>
      <Box
        fontSize={25}
        fontWeight={400}
        textAlign={"center"}
        color={"white"}
        fontFamily={"monospace"}
      >
        Developer Console
      </Box>
      {hook && (
        <div
          style={{
            height: "3vh",
            width: "80%",
            borderRadius: 50,
            backgroundColor: "#D9D9D9",
            textAlign: "center",
            alignSelf: "center",
            marginTop: 15,
            marginLeft: "10%",
            fontSize: 18,
            fontFamily: "monospace",
          }}
        >
          Hook: <b>{hook}</b>
        </div>
      )}

      {requestUrl && (
        <div
          style={{
            // height: "10vh",
            width: "80%",
            borderRadius: 10,
            backgroundColor: "#D9D9D9",
            textAlign: "center",
            alignSelf: "center",
            marginTop: 10,
            marginLeft: "10%",
            padding: "8px",
            paddingTop: "5px",
            paddingBottom: "5px",
            fontSize: 16,
            fontFamily: "monospace",
          }}
        >
          {requestMethod && <b>[{requestMethod}]:</b>} {requestUrl} <br />
        </div>
      )}

      <div
        style={{
          height: "3vh",
          width: "80%",
          borderRadius: 2,
          backgroundColor: "#D9D9D9",
          textAlign: "center",
          alignSelf: "center",
          marginTop: 20,
          marginLeft: "10%",
          fontSize: 16,
          fontFamily: "monospace",
          fontWeight: 500,
        }}
      >
        Request Body
      </div>

      <div
        style={{
          width: "80%",
          alignContent: "center",
          marginLeft: "10%",
          maxHeight: "50vh",
          overflow: "auto",
          marginBottom: "15px",
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
          height: "3vh",

          width: "80%",
          borderRadius: 2,
          backgroundColor: "#D9D9D9",
          textAlign: "center",
          alignSelf: "center",
          marginLeft: "10%",
          fontSize: 16,
          fontFamily: "monospace",
          fontWeight: 500,
        }}
      >
        Response Body
      </div>

      <div
        style={{
          width: "80%",
          alignContent: "center",
          marginLeft: "10%",
          maxHeight: "50vh",
          overflow: "auto",
          marginBottom: "15px",
        }}
      >
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
