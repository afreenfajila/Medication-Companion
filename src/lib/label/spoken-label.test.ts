import { describe, expect, it } from "vitest";
import {
  extractSpokenMedicineNameOnly,
  extractSpokenStrength,
  parseSpokenLabel,
} from "./spoken-label";

describe("parseSpokenLabel", () => {
  it("pulls the name and strength out of a natural sentence", () => {
    expect(parseSpokenLabel("It's Metformin, 500 milligrams")).toEqual({
      medicineName: "Metformin",
      strength: "500 mg",
    });
  });

  it("understands the plain abbreviation too", () => {
    expect(parseSpokenLabel("Metformin 500 mg")).toEqual({
      medicineName: "Metformin",
      strength: "500 mg",
    });
  });

  it("strips other common lead-ins", () => {
    expect(parseSpokenLabel("my medicine is called Metformin, 500 milligrams")).toEqual({
      medicineName: "Metformin",
      strength: "500 mg",
    });
    expect(parseSpokenLabel("this is Metformin 500 milligrams")).toEqual({
      medicineName: "Metformin",
      strength: "500 mg",
    });
  });

  it("normalises micrograms, millilitres and grams", () => {
    expect(parseSpokenLabel("Levothyroxine 100 micrograms")?.strength).toBe("100 mcg");
    expect(parseSpokenLabel("Cough syrup 5 millilitres")?.strength).toBe("5 ml");
    expect(parseSpokenLabel("Paracetamol 1 gram")?.strength).toBe("1 g");
  });

  it("returns null when no strength can be found — never guesses one", () => {
    expect(parseSpokenLabel("It's Metformin")).toBeNull();
    expect(parseSpokenLabel("what is this for")).toBeNull();
  });

  it("returns null when nothing is left after stripping filler words", () => {
    expect(parseSpokenLabel("it's 500 milligrams")).toBeNull();
  });
});

describe("extractSpokenStrength", () => {
  it("finds a strength answer on its own", () => {
    expect(extractSpokenStrength("500 milligrams")).toBe("500 mg");
    expect(extractSpokenStrength("it's 500 mg")).toBe("500 mg");
  });

  it("returns null with no usable unit", () => {
    expect(extractSpokenStrength("five hundred")).toBeNull();
    expect(extractSpokenStrength("not sure")).toBeNull();
  });
});

describe("extractSpokenMedicineNameOnly", () => {
  it("extracts a bare name with filler stripped", () => {
    expect(extractSpokenMedicineNameOnly("It's Metformin")).toBe("Metformin");
    expect(extractSpokenMedicineNameOnly("Metformin")).toBe("Metformin");
  });

  it("declines anything that already carries a strength", () => {
    expect(extractSpokenMedicineNameOnly("Metformin 500 mg")).toBeNull();
  });

  it("declines questions, so they fall through to the normal 'unclear' handling", () => {
    expect(extractSpokenMedicineNameOnly("what is this for")).toBeNull();
    expect(extractSpokenMedicineNameOnly("how do I take it")).toBeNull();
  });

  it("declines long sentences that are unlikely to be just a name", () => {
    expect(
      extractSpokenMedicineNameOnly("I have been taking this medicine every morning for a while now"),
    ).toBeNull();
  });
});
