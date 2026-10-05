import { careContacts, metforminRecord, patient, recordSource } from "@/lib/content/seed-record";
import type { CareCircleService, CareContact, HelpReason, IdentityService, PharmacyRecord, PharmacyService } from ".";

// Simulated services: realistic results from the fictional seed data, and a
// `fail` switch so every failure state can be shown. Nothing leaves the server.

type Options = { fail?: boolean };

/** e.g. "BC-482913". Random so two requests never share a reference. */
function reference(): string {
  return `BC-${String(Math.floor(100000 + Math.random() * 900000))}`;
}

export class SimulatedPharmacyService implements PharmacyService {
  constructor(private readonly opts: Options = {}) {}

  async getRecord(patientId: string): Promise<PharmacyRecord> {
    if (patientId !== patient.id) throw new Error("Unknown patient");
    return { patientId, source: recordSource, medicines: [metforminRecord] };
  }

  async requestCallback(patientId: string, reason: HelpReason) {
    void reason;
    if (this.opts.fail || patientId !== patient.id) return { ok: false as const };
    return { ok: true as const, reference: reference(), expectedWindow: "within 1 working day" };
  }
}

export class SimulatedCareCircleService implements CareCircleService {
  constructor(private readonly opts: Options = {}) {}

  async notifyCaregiver(patientId: string, reason: HelpReason, consentGiven: true, contact: CareContact = "family") {
    void reason;
    if (this.opts.fail || patientId !== patient.id || consentGiven !== true) return { ok: false as const };
    const who = contact === "trusted-helper" ? careContacts.trustedHelper : careContacts.family;
    return { ok: true as const, caregiverName: who.name };
  }
}

export class SimulatedIdentityService implements IdentityService {
  async currentPatient() {
    return { patientId: patient.id, displayName: patient.displayName };
  }
}
