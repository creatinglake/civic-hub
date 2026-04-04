import { useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

/**
 * Hook for gating participation actions behind authentication.
 *
 * Usage:
 *   const { requireAuth, showAuthModal, closeAuthModal, handleAuthComplete } = useRequireAuth();
 *
 *   function handleVote() {
 *     requireAuth(() => {
 *       // This runs after auth is complete
 *       submitVote(...);
 *     });
 *   }
 *
 * Returns showAuthModal=true when the auth modal should be displayed.
 * handleAuthComplete executes the pending action and closes the modal.
 */
export function useRequireAuth() {
  const { canParticipate } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const requireAuth = useCallback(
    (action: () => void) => {
      if (canParticipate) {
        // User is authenticated and resident — run action immediately
        action();
      } else {
        // Store the action and show auth modal
        setPendingAction(() => action);
        setShowAuthModal(true);
      }
    },
    [canParticipate]
  );

  const closeAuthModal = useCallback(() => {
    setShowAuthModal(false);
    setPendingAction(null);
  }, []);

  const handleAuthComplete = useCallback(() => {
    setShowAuthModal(false);
    // Execute the pending action
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  return { requireAuth, showAuthModal, closeAuthModal, handleAuthComplete };
}
