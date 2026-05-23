import { describe, expect, it } from "vitest";
import { parseServiceAccount } from "../src/firestoreStore.js";

describe("Firestore service account config", () => {
  it("fills missing project_id from FIREBASE_PROJECT_ID", () => {
    const serviceAccount = parseServiceAccount(
      JSON.stringify({
        client_email: "firebase-adminsdk@example.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"
      }),
      "hindrax"
    );

    expect(serviceAccount.project_id).toBe("hindrax");
    expect(serviceAccount.private_key).toContain("\nabc\n");
  });

  it("accepts camelCase service account fields copied from env dashboards", () => {
    const serviceAccount = parseServiceAccount(
      JSON.stringify({
        projectId: "hindrax",
        clientEmail: "firebase-adminsdk@example.iam.gserviceaccount.com",
        privateKey: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"
      })
    );

    expect(serviceAccount.project_id).toBe("hindrax");
    expect(serviceAccount.client_email).toBe("firebase-adminsdk@example.iam.gserviceaccount.com");
    expect(serviceAccount.private_key).toContain("\nabc\n");
  });

  it("accepts base64 encoded service account json", () => {
    const encoded = Buffer.from(
      JSON.stringify({
        project_id: "hindrax",
        client_email: "firebase-adminsdk@example.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"
      }),
      "utf8"
    ).toString("base64");

    const serviceAccount = parseServiceAccount(encoded);

    expect(serviceAccount.project_id).toBe("hindrax");
    expect(serviceAccount.private_key).toContain("\nabc\n");
  });
});
