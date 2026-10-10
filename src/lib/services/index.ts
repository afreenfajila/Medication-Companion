import type { MedicationRecord, RecordSource } from "@/types/content";
import type { HelpReason } from "./reasons";
import { SimulatedCareCircleService, SimulatedIdentityService, SimulatedPharmacyService } from "./simulated";

// Every outside system behind an interface (CLAUDE.md § H4). The prototype only
// ships `Simulated*` implementations; a real deployment would add its own
// behind the same interfaces and select them with SERVICE_MODE.

export { HELP_REASONS, type HelpReason } from "./reasons";

export type PharmacyRecord = {
  patientId: string;
  source: RecordSource;
  medicines: MedicationRecord[];
};

export type CareContact = "family" | "trusted-helper";

export interface PharmacyService {
  getRecord(patientId: string): Promise<PharmacyRecord>;
  requestCallback(
    patientId: string,
    reason: HelpReason,
  ): Promise<{ ok: true; reference: string } | { ok: false }>;
}

export interface CareCircleService {
  notifyCaregiver(
    patientId: string,
    reason: HelpReason,
    consentGiven: true,
    contact?: CareContact,
  ): Promise<{ ok: true; caregiverName: string } | { ok: false }>;
}

export interface IdentityService {
  currentPatient(): Promise<{ patientId: string; displayName: string }>;
}

export type Services = {
  pharmacy: PharmacyService;
  careCircle: CareCircleService;
  identity: IdentityService;
};

/**
 * `SERVICE_MODE=simulated` is the only mode (and the default). Set
 * `SIMULATED_SERVICE_FAILURE=pharmacy,care-circle` to make those services fail,
 * so the failure states can be shown and tested.
 */
export function getServices(env: Record<string, string | undefined> = process.env): Services {
  const mode = env.SERVICE_MODE ?? "simulated";
  if (mode !== "simulated") throw new Error(`Unsupported SERVICE_MODE: ${mode}`);
  const failing = new Set((env.SIMULATED_SERVICE_FAILURE ?? "").split(",").map((s) => s.trim()));
  return {
    pharmacy: new SimulatedPharmacyService({ fail: failing.has("pharmacy") }),
    careCircle: new SimulatedCareCircleService({ fail: failing.has("care-circle") }),
    identity: new SimulatedIdentityService(),
  };
}
