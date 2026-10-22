import { describe, expect, it } from "vitest";
import { describeDevice, formatWhen } from "./device";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME_LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EDGE_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
const FIREFOX_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0";

describe("describeDevice", () => {
  it("names the browser and the system", () => {
    expect(describeDevice(IPHONE)).toBe("Safari on iPhone");
    expect(describeDevice(CHROME_LINUX)).toBe("Chrome on Linux");
    expect(describeDevice(EDGE_WIN)).toBe("Edge on Windows");
    expect(describeDevice(FIREFOX_MAC)).toBe("Firefox on Mac");
  });
  it("never shows an unknown agent as-is", () => {
    expect(describeDevice("<script>curl/8</script>")).toBe("Unknown device");
    expect(describeDevice(null)).toBe("Unknown device");
  });
});

describe("formatWhen", () => {
  it("prints the same text everywhere", () => {
    expect(formatWhen(Date.UTC(2026, 9, 21, 14, 3))).toBe("21 Oct 2026, 14:03 UTC");
    expect(formatWhen("nope")).toBe("unknown");
  });
});
