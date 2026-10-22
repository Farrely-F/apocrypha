import { z } from "zod";

// Zod otherwise probes for eval support with `new Function("")`, which a strict Content Security Policy
// reports as a violation on every page load. Without the probe it parses the same way, a little slower.
z.config({ jitless: true });

export { z };
