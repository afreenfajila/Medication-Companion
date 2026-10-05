import type { HelpFlow } from "@/lib/session/state-machine";
import { careContacts } from "./seed-record";
import type { CopyKey } from "./translations";

/**
 * What the companion says at each stage of a help flow (CLAUDE.md § H4). Names
 * and numbers come from the fictional care-circle data; the reference and the
 * person told come from the service's reply — never typed into copy.
 */
export function helpLine(t: (key: CopyKey) => string, flow: HelpFlow): string {
  switch (flow.stage) {
    case "confirm":
      if (flow.kind === "pharmacist-callback") return t("callbackConfirm");
      if (flow.kind === "trusted-helper") return t("helperConsent").replace("{name}", careContacts.trustedHelper.name);
      return t("familyConsent");
    case "sending":
      return t("helpSending");
    case "sent":
      return flow.kind === "pharmacist-callback"
        ? t("callbackSent").replace("{reference}", flow.reference ?? "")
        : t("familySent").replace("{caregiverName}", flow.contactName ?? "");
    case "failed":
      return t("serviceTrouble");
    case "info": {
      const place = flow.kind === "clinic" ? careContacts.clinic : careContacts.pharmacy;
      return t(flow.kind === "clinic" ? "clinicNumber" : "pharmacyNumber")
        .replace("{name}", place.name)
        .replace("{phone}", place.phone);
    }
  }
}
