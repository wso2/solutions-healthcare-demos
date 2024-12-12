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

import { Button } from "@mui/material";
import { SCREEN_HEIGHT } from "../constants/page";
import { Box, Flex } from "@chakra-ui/react";
import { SECONDARY_COLOR } from "../constants/color";

export default function NavBar() {
  return (
    <Box bg={SECONDARY_COLOR} height={100} marginBottom={SCREEN_HEIGHT * 0.04}>
      <Flex alignItems={"center"} justifyContent={"space-between"}>
        <Button href="/dashboard">
          <Box borderRadius="50%" overflow="hidden">
            <img src="/demo_logo.png" alt="Demo Logo" height={80} width={80} />
          </Box>
        </Button>
        <Button href="/dashboard/profile">
          <Box borderRadius="50%" overflow="hidden">
            <img src="/profile.png" alt="Demo Logo" height={80} width={80} />
          </Box>
        </Button>
      </Flex>
    </Box>
  );
}
