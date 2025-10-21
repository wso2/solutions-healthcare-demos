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

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { StrictMode } from "react";
import { AuthProvider } from "@asgardeo/auth-react";

// Type declaration for window.config
declare global {
  interface Window {
    config?: {
      mpiServiceURL: string;
      dataAggregatorURL: string;
      agentChatServiceURL: string;
      asgardeo: {
        clientId: string;
        clientSecret: string;
        baseUrl: string;
      };
      patientMatch: {
        count: number;
        onlySingleMatch: boolean;
        onlyCertainMatches: boolean;
      };
    };
  }
}

// Function to initialize the app once config is loaded
function initializeApp() {
  const config = {
    signInRedirectURL: window.location.origin,
    signOutRedirectURL: window.location.origin,
    clientID: window.config?.asgardeo?.clientId || import.meta.env.VITE_REACT_APP_ASGARDEO_CLIENT_ID,
    clientSecret: window.config?.asgardeo?.clientSecret || import.meta.env.VITE_REACT_APP_ASGARDEO_CLIENT_SECRET,
    baseUrl: window.config?.asgardeo?.baseUrl || import.meta.env.VITE_REACT_APP_ASGARDEO_BASE_URL,
    scope: ["openid", "profile", "email", "patient.read"],
    grantType: "client_credentials",
    enablePKCE: true,
    storage: "sessionStorage" as const
  };

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AuthProvider config={config}>
        <App />
      </AuthProvider>
    </StrictMode>
  );
}

// Wait for config to be loaded, or initialize immediately if already available
if (window.config) {
  initializeApp();
} else {
  // Wait for DOM content to be loaded (config.js should be loaded by then)
  document.addEventListener('DOMContentLoaded', () => {
    // Give a small delay to ensure config.js is executed
    setTimeout(() => {
      if (window.config) {
        initializeApp();
      } else {
        console.warn('Config not loaded, using environment variables as fallback');
        initializeApp();
      }
    }, 100);
  });
}
