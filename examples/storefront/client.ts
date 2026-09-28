/**
 * One shared SDK client for the whole storefront.
 * Copy `src/lib/api/sdk.ts`, `src/lib/api-v1/contract.ts` and `src/lib/config.ts`
 * into your storefront first, then adjust these import paths.
 */
import { createHabaneClient } from "@/lib/api/sdk";
import { API_BASE_URL } from "@/lib/config";

export const api = createHabaneClient({ baseUrl: API_BASE_URL });

export type { HabaneClient } from "@/lib/api/sdk";
export { HabaneApiError } from "@/lib/api/sdk";
