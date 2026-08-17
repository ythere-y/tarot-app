import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("tarot artwork", () => {
  it("ships the complete local 78-card deck and card back", () => {
    const assetDirectory = resolve(process.cwd(), "tarot_img");
    const images = readdirSync(assetDirectory).filter((file) =>
      file.endsWith(".jpg"),
    );

    expect(images).toHaveLength(79);
    expect(images).toContain("cover.jpg");
  });
});
