import { useMemo } from "react";
import {
  supabaseAdapter,
  consoleAdapter,
  httpAdapter,
} from "akk-feedback/adapters";
import type { FeedbackConfigState } from "./useFeedbackConfig";

export function useFeedbackAdapter(
  rawConfig: FeedbackConfigState,
  accessToken: string | null,
) {
  return useMemo(() => {
    const supabaseUrl =
      rawConfig.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey =
      rawConfig.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;
    const apiUrl = (
      import.meta.env.VITE_API_URL || "http://localhost:3000"
    ).replace(/\/$/, "");
    const wsEndpoint =
      apiUrl.replace(/^http/, "ws") + "/api/notifications/ws";
    const token = accessToken ?? undefined;
    // Dynamic getter so rotated tokens propagate without rebuilding the adapter.
    const getToken = () => accessToken ?? undefined;

    switch (rawConfig.adapterId) {
      case "supabase":
        if (supabaseUrl && supabaseKey) {
          return supabaseAdapter({ supabaseUrl, supabaseKey, accessToken: token });
        }
        return httpAdapter({ endpoint: `${apiUrl}/api/feedback`, wsEndpoint, getToken });
      case "console":
        return consoleAdapter();
      case "local":
      default:
        if (supabaseUrl && supabaseKey) {
          return supabaseAdapter({ supabaseUrl, supabaseKey, accessToken: token });
        }
        return httpAdapter({ endpoint: `${apiUrl}/api/feedback`, wsEndpoint, getToken });
    }
  }, [rawConfig.adapterId, rawConfig.supabaseUrl, rawConfig.supabaseKey, accessToken]);
}
