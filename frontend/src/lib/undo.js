import { toast } from "sonner";

/**
 * Wrap an action with undo toast.
 * @param action - async function to execute
 * @param undo - async function to revert
 * @param onError - called with the error when action fails, for state rollback
 * @param options - { successMsg, errorMsg, undoLabel }
 */
export async function withUndo({ action, undo, onError, successMsg = "Done", errorMsg = "Error", undoLabel = "Undo" }) {
  let undone = false;

  try {
    await action();
    if (undone) return;
    toast(successMsg, {
      action: {
        label: undoLabel,
        onClick: () => {
          undone = true;
          undo().catch(() => toast.error(errorMsg));
        },
      },
      duration: 6000,
    });
  } catch (err) {
    if (!undone) {
      if (onError) onError(err);
      toast.error(errorMsg);
    }
  }
}
