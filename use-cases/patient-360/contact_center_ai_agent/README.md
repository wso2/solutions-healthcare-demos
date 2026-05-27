# Call Center Assistant Agent with WSO2 AI Gateway

This project implements a healthcare-focused Call Center Assistant Agent using Anthropic Claude, routed through the WSO2 AI Gateway in WSO2 API Manager.

The agent is designed to help support staff quickly access and summarize patient-related information such as patient details, allergies, medications, and clinical context during live call center interactions.

---

## Configuration

Configure the following values in `Config.toml` before running the project:

| Configuration          | Description                                                           |
| ---------------------- | --------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`    | API key used for authenticating the model request                     |
| `AGENT_AI_GATEWAY_URL` | WSO2 AI Gateway endpoint URL Or leave empty for default               |

---

### TLS / Truststore Configuration (Optional - Only if you are connecting to the AI Gateway)

The current implementation uses a client truststore when connecting to the AI Gateway.

```ballerina
anthropic:ConnectionConfig connectionConfig = {
    secureSocket: {
        cert: {
            path: "</path/to/client-truststore.jks",>",
            password: "<truststore-password>"
        }
    }
};
```

For local development, this can point to the APIM truststore.

---

## Running the Project

Run the AI Agent using the following command:

```bash
bal run
```
