import { toast } from "sonner";

/**
 * Wrap an action with undo toast.
 * @param action - async function to execute
 * @param undo - async function to revert
 * @param options - { successMsg, errorMsg, undoLabel }
 */
export async function withUndo({ action, undo, successMsg = "Done", errorMsg = "Error", undoLabel = "Undo" }) {
  let undone = false;

  const tid = toast.loading(successMsg);

  try {
    await action();
    if (undone) return;
    toast.dismiss(tid);
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
  } catch {
    if (!undone) {
      toast.dismiss(tid);
      toast.error(errorMsg);
    }
  }
}
