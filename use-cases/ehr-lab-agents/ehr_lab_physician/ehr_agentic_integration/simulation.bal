import ballerina/http;
import ballerina/jballerina.java;
import ballerina/lang.runtime;
import ballerina/log;

// The presenter's failure switches. Outages are real network failures — Toxiproxy sits between the
// integration and each EHR (and between the lab and the integration's webhook), and a switch disables
// a proxy — so the retries, reviews and fallbacks the audience sees are the production code paths.
// Nothing in the integration checks a "simulate failure" flag.

# One failure switch.
#
# + id - the switch id (an EHR id, or `lab-webhook`)
# + label - shown in the portal
# + description - what happens when it is on
# + active - true while the outage is on
# + available - false when Toxiproxy does not know the proxy
type FaultSwitch record {|
    string id;
    string label;
    string description;
    boolean active;
    boolean available;
|};

# Every failure switch and whether it is on.
#
# + return - the switches; one is unavailable when Toxiproxy cannot be reached or lacks its proxy
isolated function faultSwitches() returns FaultSwitch[] {
    FaultSwitch[] switches = [];
    foreach EhrSystemConfig ehr in ehrSystems {
        string? proxy = ehr.outageProxy;
        boolean? enabled = proxy is string ? proxyEnabled(proxy) : ();
        switches.push({
            id: ehr.id,
            label: string `${ehr.displayName} outage`,
            description: "Cuts the network to the EHR. FHIR calls fail, the workflow retries, then asks a person to retry or stop.",
            active: enabled == false,
            available: enabled is boolean
        });
    }
    boolean? webhookEnabled = proxyEnabled(labWebhookProxy);
    switches.push({
        id: "lab-webhook",
        label: "Lab webhook down",
        description: "The lab's notifications cannot reach the integration. The fallback poller picks the results up instead.",
        active: webhookEnabled == false,
        available: webhookEnabled is boolean
    });
    return switches;
}

# Turns an outage on or off.
#
# + id - the switch id
# + active - true to start the outage, false to end it
# + return - an error for an unknown switch or when Toxiproxy cannot be reached
isolated function setFault(string id, boolean active) returns error? {
    string proxy = id == "lab-webhook" ? labWebhookProxy : (check ehrSystem(id)).outageProxy ?: "";
    if proxy == "" {
        return error(string `EHR "${id}" has no outage proxy configured`);
    }
    http:Response response = check toxiproxy->post(string `/proxies/${proxy}`, {enabled: !active});
    if response.statusCode >= 300 {
        return error(string `Toxiproxy answered ${response.statusCode} for proxy "${proxy}"`);
    }
    log:printInfo(active ? "Outage started" : "Outage ended", proxy = proxy);
}

isolated function proxyEnabled(string proxy) returns boolean? {
    json|error state = toxiproxy->get(string `/proxies/${proxy}`);
    if state is error {
        return ();
    }
    json|error enabled = state.enabled;
    return enabled is boolean ? enabled : ();
}

# Stops the integration process half a second from now, so the HTTP response gets out first. Docker
# restarts the container (`restart: unless-stopped`); Temporal keeps every workflow's state, so the
# restarted worker carries on where the old one stopped.
isolated function crashSoon() {
    _ = start exitAfterDelay();
}

isolated function exitAfterDelay() {
    runtime:sleep(0.5);
    log:printWarn("Simulated crash: the integration process is exiting");
    systemExit(1);
}

isolated function systemExit(int status) = @java:Method {
    'class: "java.lang.System",
    name: "exit",
    paramTypes: ["int"]
} external;
