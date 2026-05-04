import { useState, useEffect } from "react";
import { fetchUserProjectIds, fetchProjects } from "../lib/feedbackApi";

interface AuthContext {
  isLoggedIn: boolean;
  isAdmin: boolean;
  userId: string | null;
  email: string | null;
}

export function useProjectLoader(auth: AuthContext) {
  const [activeProjectId, setActiveProjectId] = useState("");
  const [userProjectIds, setUserProjectIds] = useState<string[]>([]);
  const [showPlanSelection, setShowPlanSelection] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  useEffect(() => {
    if (!auth.isLoggedIn) return;
    (async () => {
      try {
        const ids = auth.isAdmin
          ? (await fetchProjects()).map((p: any) => p.id)
          : await fetchUserProjectIds();
        if (ids.length > 0) {
          setUserProjectIds(ids);
          setActiveProjectId((prev) => prev || ids[0]);
          setShowPlanSelection(false);
        } else if (auth.isAdmin) {
          // New admin with no projects — prompt plan selection before first project creation.
          setShowPlanSelection(true);
        } else {
          // Regular user not yet assigned to a project — wait for admin invite.
          setShowPlanSelection(false);
        }
      } catch {}
      setProjectsLoaded(true);
    })();
  }, [auth.isLoggedIn, auth.isAdmin, auth.userId, auth.email]);

  return {
    activeProjectId,
    setActiveProjectId,
    userProjectIds,
    showPlanSelection,
    setShowPlanSelection,
    projectsLoaded,
  };
}
