"use strict";

const REGISTER_ENDPOINT = "http://20.207.122.201/evaluation-service/register";
const AUTH_ENDPOINT = "http://20.207.122.201/evaluation-service/auth";

const registrationPayload = {
  email: "vs9419@srmist.edu.in",
  name: "Vinayak Chandra Suryavanshi",
  mobileNo: "9818649021",
  githubUsername: "vinayakchandra",
  rollNo: "RA2311003010350",
  accessCode: "QkbpxH",
};

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text}`);
  }

  if (!response.ok) {
    const err = new Error(`Request failed (${response.status}) ${url}: ${text}`);
    err.status = response.status;
    err.body = json;
    throw err;
  }

  return json;
}

async function main() {
  let registrationResponse;
  try {
    registrationResponse = await postJson(REGISTER_ENDPOINT, registrationPayload);
  } catch (err) {
    if (err.status === 409) {
      registrationResponse = {
        email: "vs9419@srmist.edu.in",
        name: "vinayak chandra suryavanshi",
        rollNo: "ra2311003010350",
        accessCode: "QkbpxH",
        clientID: "7759367b-2aa1-4a6c-ae11-ae18b0bf241c",
        clientSecret: "PbKzBnbUvXHQkHFe",
      };
    } else {
      throw err;
    }
  }

  const authPayload = {
    email: registrationResponse.email,
    name: registrationResponse.name,
    rollNo: registrationResponse.rollNo,
    accessCode: registrationResponse.accessCode,
    clientID: registrationResponse.clientID,
    clientSecret: registrationResponse.clientSecret,
  };

  const authResponse = await postJson(AUTH_ENDPOINT, authPayload);

  if (!authResponse.access_token) {
    throw new Error("access_token missing in auth response");
  }

  console.log("\n ACESS TOKEN ");
  console.log(authResponse.access_token);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
