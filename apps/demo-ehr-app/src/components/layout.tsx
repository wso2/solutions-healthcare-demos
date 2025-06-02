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

import NavBar from "./nav_bar";
import { DevPortalExpandButton } from "./cds_button";
import { Outlet } from "react-router-dom";
import { useContext } from "react";
import DevConsole from "./dev_console";
import { ExpandedContext } from "../utils/expanded_context";

export const Layout = () => {
  const { expanded } = useContext(ExpandedContext);
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          color: "white",
        }}
      >
        <NavBar />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          backgroundColor: "white",
        }}
      >
        <div
          style={{
            width: expanded ? "50vw" : "100vw",
            overflowY: "hidden",
            transition: "width 0.5s ease-in-out",
            height: "100%",
            marginTop: "30px",
          }}
        >
          <Outlet />
        </div>

        <div style={{ width: "1.5vw", marginLeft: "2vw" }}>
          <DevPortalExpandButton />
        </div>

        <div
          style={{
            backgroundColor: "black",
            marginLeft: "1vw",
          }}
        />

        <div
          style={{
            width: expanded ? "50vw" : "0vw",
            height: expanded ? "100%" : "0vh",
            overflowY: "auto",
            transition: "width 0.5s ease-in-out, opacity 0.5s ease-in-out",
            opacity: expanded ? 1 : 0,
            backgroundColor: "	#4C585B",
            paddingTop: "5px",
          }}
        >
          <DevConsole />
        </div>
      </div>
    </div>
  );
};
