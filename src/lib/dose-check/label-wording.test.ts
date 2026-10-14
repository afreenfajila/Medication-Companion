import { describe, expect, it } from "vitest";
import { cleanLabelWording, isVerbatimSubset } from "./label-wording";

describe("label wording as people say it: filler, hedges, repeats and corrections dropped, nothing added", () => {
  it.each([
    ["It says… two? I think two.", "two", true],
    ["It says two. I think two.", "two", true],
    ["Take 1 tablet twice daily with meals", "Take 1 tablet twice daily with meals", false],
    ["Take 1 tablet twice daily with meals.", "Take 1 tablet twice daily with meals", false],
    ["um, it says take 1 tablet, uh, twice daily with meals", "take 1 tablet, twice daily with meals", false],
    ["two... no, one tablet", "one tablet", false],
    ["Take 2 tablets, no, sorry, 1 tablet twice a day", "1 tablet twice a day", false],
    ["No, it's one tablet twice a day", "one tablet twice a day", false],
    ["The label says: take half a tablet at night", "take half a tablet at night", false],
    ["maybe two tablets twice a day?", "two tablets twice a day", true],
    ["Take 0.5 tablet daily", "Take 0.5 tablet daily", false],
    ["上面写着每天两次，每次一片", "每天两次，每次一片", false],
    ["嗯，我觉得是两片？两片。", "两片", true],
  ])("%s → %s", (said, wording, unsure) => {
    expect(cleanLabelWording(said)).toEqual({ wording, unsure });
  });

  it("nothing usable is kept as said, never emptied", () => {
    expect(cleanLabelWording("??").wording).toBe("??");
  });

  it("label wording that merely contains or starts with 'no' is never cut", () => {
    expect(cleanLabelWording("Take no more than 2 tablets a day").wording).toBe("Take no more than 2 tablets a day");
    expect(cleanLabelWording("no more than four tablets in 24 hours").wording).toBe("no more than four tablets in 24 hours");
    expect(cleanLabelWording("No alcohol. Take one tablet daily").wording).toBe("No alcohol. Take one tablet daily");
  });

  it.each([
    ["Take 2 tablets twice daily, it says, with meals", "Take 2 tablets twice daily, with meals"],
    ["one tablet two times a day, with food, yeah", "one tablet two times a day, with food"],
    ["uh it's two... two tablets I guess", "two tablets"],
    ["it says take one twice a day but my doctor said two", "take one twice a day"],
    ["嗯…好像是一片？一片", "一片"],
    ["Okay so it says one tablet twice a day with food and do not crush", "one tablet twice a day with food and do not crush"],
  ])("asides and restarts: %s → %s", (said, wording) => {
    expect(cleanLabelWording(said).wording).toBe(wording);
  });

  it("only ever removes her words: the result is always a verbatim subset of what she said", () => {
    for (const said of ["It says… two? I think two.", "two... no, one tablet", "um, so, it reads take 1 tablet", "嗯，我觉得是两片？两片。", "it says"]) {
      expect(isVerbatimSubset(cleanLabelWording(said).wording, said), said).toBe(true);
    }
  });
});

describe("isVerbatimSubset: nothing added, changed or reordered", () => {
  it("rejects a unit, number or word she didn't say", () => {
    expect(isVerbatimSubset("two tablets", "It says two")).toBe(false); // "tablets" added
    expect(isVerbatimSubset("2 tablets", "two tablets")).toBe(false); // "two" changed to "2"
    expect(isVerbatimSubset("twice daily take 1", "take 1 twice daily")).toBe(false); // reordered
    expect(isVerbatimSubset("", "anything")).toBe(false);
  });
  it("accepts her own words in order", () => {
    expect(isVerbatimSubset("one tablet twice daily", "two… no, one tablet, twice daily")).toBe(true);
    expect(isVerbatimSubset("每次一片", "上面写着每次一片")).toBe(true);
  });
});
