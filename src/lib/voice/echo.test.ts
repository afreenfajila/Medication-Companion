import { describe, expect, it } from "vitest";
import { ECHO_WINDOW_MS, isLikelySelfEcho } from "./echo";

const GREETING = "Hello, Mei Ling. What would you like help with?";

describe("isLikelySelfEcho", () => {
  it("catches the companion's own greeting coming back as a user turn", () => {
    // The reported bug: "Mei Ling says: hello", with nobody having spoken.
    expect(isLikelySelfEcho("hello", GREETING, 200)).toBe(true);
    expect(isLikelySelfEcho("what would you like help with", GREETING, 400)).toBe(true);
  });

  it("ignores anything outside the echo window", () => {
    expect(isLikelySelfEcho("hello", GREETING, ECHO_WINDOW_MS + 1)).toBe(false);
  });

  it("does not fire on a real answer phrased in the person's own words", () => {
    expect(isLikelySelfEcho("I want to show you my medicine", GREETING, 100)).toBe(false);
    expect(isLikelySelfEcho("what is this tablet for", GREETING, 100)).toBe(false);
  });

  it("matches whole words only", () => {
    expect(isLikelySelfEcho("yes", "Is this the medicine you are holding?", 100)).toBe(false);
    expect(isLikelySelfEcho("old", "Is this the medicine you are holding?", 100)).toBe(false);
  });

  it("is inert with nothing spoken yet", () => {
    expect(isLikelySelfEcho("hello", null, 0)).toBe(false);
    expect(isLikelySelfEcho("", GREETING, 0)).toBe(false);
  });

  it("punctuation and smart quotes don't defeat it", () => {
    expect(isLikelySelfEcho("Hello!", "Hello, Mei Ling.", 100)).toBe(true);
    expect(isLikelySelfEcho("i didn't catch that", "I didn’t catch that.", 100)).toBe(true);
  });
});
