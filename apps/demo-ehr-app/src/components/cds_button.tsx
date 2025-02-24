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

import { useContext } from "react";
import { Box, Button } from "@mui/material";
import { ExpandedContext } from "../utils/expanded_context";

export const DevPortalExpandButton = () => {
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
        Developer Console
      </Button>
    </Box>
  );
};
