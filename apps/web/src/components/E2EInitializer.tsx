"use client";

import { useEffect } from "react";
import { getOrInitKeyPair } from "@/lib/e2e";
import { api } from "@/lib/api";

/**
 * Silently ensures the current user has an E2E key pair on every page load.
 * Mounted in the main layout so keys are ready before the user ever opens Messages.
 * Renders nothing — purely a side-effect component.
 */
export function E2EInitializer({ meId }: { meId: string }) {
  useEffect(() => {
    getOrInitKeyPair(meId).then((result) => {
      if (!result) return;
      api
        .put("/api/users/me/public-key", { publicKey: result.publicKeyB64 })
        .catch(() => undefined);
    });
  }, [meId]);

  return null;
}
