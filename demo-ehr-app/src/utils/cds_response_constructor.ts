import { CDS_SERVICE_SAMPLE_RESPONSE } from "../constants/data";

export async function constructCDSResponse(
  hook: string,
  cdsRequest: any,
  showResponse: boolean = true
) {
  if (hook === "" || hook === undefined || !showResponse) {
    return {
      cards: [],
    };
  }

  if (hook === "cds-services") {
    return CDS_SERVICE_SAMPLE_RESPONSE;
  }

  // make an api call to localhost:8080/cds-services
  const response = await fetch("http://localhost:8080/cds-services/" + hook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cdsRequest),
  });

  const cdsResponse_from_server = await response.json();
  return cdsResponse_from_server;
}
