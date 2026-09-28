import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// The screen-reader announcer repeats what is already on screen; text queries
// target the visible transcript. The announcer itself is asserted by selector.
configure({ defaultIgnore: "script, style, [data-announcer]" });

afterEach(() => {
  cleanup();
});
