import { describe, expect, it } from "vitest";
import { patient } from "@/lib/content/seed-record";
import { getServices } from ".";

describe("simulated services (Assignment 3, H4)", () => {
  it("SERVICE_MODE=simulated is the only mode, and the default", () => {
    expect(() => getServices({})).not.toThrow();
    expect(() => getServices({ SERVICE_MODE: "simulated" })).not.toThrow();
    expect(() => getServices({ SERVICE_MODE: "live" })).toThrow(/Unsupported SERVICE_MODE/);
  });

  it("returns realistic results from the fictional seed data", async () => {
    const s = getServices({});
    const callback = await s.pharmacy.requestCallback(patient.id, "medical-question");
    expect(callback).toMatchObject({ ok: true, expectedWindow: "within 1 working day" });
    expect(callback.ok && callback.reference).toMatch(/^BC-\d{6}$/);
    expect(await s.careCircle.notifyCaregiver(patient.id, "wellbeing", true)).toEqual({ ok: true, caregiverName: "Daniel" });
    expect(await s.careCircle.notifyCaregiver(patient.id, "wellbeing", true, "trusted-helper")).toEqual({
      ok: true,
      caregiverName: "Mrs Lim",
    });
    expect((await s.pharmacy.getRecord(patient.id)).medicines.map((m) => m.identity.displayName)).toEqual(["Metformin 500 mg"]);
    expect(await s.identity.currentPatient()).toEqual({ patientId: patient.id, displayName: "Mei Ling Tan" });
  });

  it("can be switched to fail, so the failure states can be shown", async () => {
    const s = getServices({ SIMULATED_SERVICE_FAILURE: "pharmacy,care-circle" });
    expect(await s.pharmacy.requestCallback(patient.id, "help-requested")).toEqual({ ok: false });
    expect(await s.careCircle.notifyCaregiver(patient.id, "help-requested", true)).toEqual({ ok: false });
  });
});
