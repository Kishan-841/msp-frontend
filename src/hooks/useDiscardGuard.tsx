"use client";

import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Stops a long form from being lost to Esc / an outside click / the X.
 *
 *   const guard = useDiscardGuard(isDirty, onClose);
 *   <Dialog open={open} onOpenChange={(v) => !v && guard.requestClose()}> … </Dialog>
 *   {guard.dialog}
 *
 * Closes straight away when nothing was changed; otherwise asks first.
 */
export function useDiscardGuard(dirty: boolean, close: () => void) {
  const [asking, setAsking] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) setAsking(true);
    else close();
  }, [dirty, close]);

  const dialog = (
    <AlertDialog open={asking} onOpenChange={(v) => !v && setAsking(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
          <AlertDialogDescription>What you entered in this form hasn&apos;t been saved and will be lost.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setAsking(false);
              close();
            }}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestClose, dialog };
}
