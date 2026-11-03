"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type MenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
};

const MenuContext = React.createContext<MenuContextValue | null>(null);

function useMenu() {
  const ctx = React.useContext(MenuContext);
  if (!ctx) throw new Error("Menu components must be used within <Menu>");
  return ctx;
}

export function Menu({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (value: boolean) => {
      if (!isControlled) setUncontrolledOpen(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange]
  );

  const triggerRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const handlePointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        contentRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, setOpen]);

  return (
    <MenuContext.Provider value={{ open, setOpen, triggerRef, contentRef }}>
      {children}
    </MenuContext.Provider>
  );
}

type TriggerChildProps = {
  ref?: React.Ref<HTMLElement>;
  onClick?: (e: React.MouseEvent) => void;
  "aria-haspopup"?: "menu";
  "aria-expanded"?: boolean;
  "data-state"?: "open" | "closed";
};

export function MenuTrigger({
  children,
}: {
  children: React.ReactElement<TriggerChildProps>;
}) {
  const { open, setOpen, triggerRef } = useMenu();
  const existingOnClick = children.props.onClick;
  const existingRef = (
    children as React.ReactElement<TriggerChildProps> & {
      ref?: React.Ref<HTMLElement>;
    }
  ).ref;

  const setRef = React.useCallback(
    (node: HTMLElement | null) => {
      triggerRef.current = node;
      if (typeof existingRef === "function") existingRef(node);
      else if (existingRef && typeof existingRef === "object") {
        (existingRef as React.MutableRefObject<HTMLElement | null>).current =
          node;
      }
    },
    [existingRef, triggerRef]
  );

  return React.cloneElement(children, {
    ref: setRef,
    onClick: (e: React.MouseEvent) => {
      existingOnClick?.(e);
      if (e.defaultPrevented) return;
      setOpen(!open);
    },
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "data-state": open ? "open" : "closed",
  });
}

type Align = "start" | "end";
type Side = "top" | "bottom";

function computePosition(
  rect: DOMRect,
  align: Align,
  side: Side,
  sideOffset: number,
  contentWidth: number,
  contentHeight: number
) {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let top =
    side === "bottom"
      ? rect.bottom + sideOffset
      : rect.top - contentHeight - sideOffset;
  let left = align === "end" ? rect.right - contentWidth : rect.left;

  // Flip vertically if no room
  if (side === "bottom" && top + contentHeight > viewportH - 8) {
    top = rect.top - contentHeight - sideOffset;
  } else if (side === "top" && top < 8) {
    top = rect.bottom + sideOffset;
  }

  // Clamp horizontally
  if (left + contentWidth > viewportW - 8) left = viewportW - contentWidth - 8;
  if (left < 8) left = 8;

  return { top, left };
}

export function MenuContent({
  children,
  align = "end",
  side = "bottom",
  sideOffset = 6,
  className,
  onClick,
}: {
  children: React.ReactNode;
  align?: Align;
  side?: Side;
  sideOffset?: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const { open, triggerRef, contentRef } = useMenu();
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(
    null
  );
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current || !contentRef.current) {
      setPos(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current;
      const content = contentRef.current;
      if (!trigger || !content) return;
      const rect = trigger.getBoundingClientRect();
      const cw = content.offsetWidth;
      const ch = content.offsetHeight;
      setPos(computePosition(rect, align, side, sideOffset, cw, ch));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, align, side, sideOffset, triggerRef, contentRef]);

  if (!open || !mounted) return null;

  const content = (
    <div
      role="menu"
      ref={contentRef}
      onClick={onClick}
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className={cn(
        "z-[1000] min-w-[12rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg",
        "animate-in fade-in-0 zoom-in-95 duration-100",
        className
      )}
    >
      {children}
    </div>
  );

  return createPortal(content, document.body);
}

export function MenuItem({
  children,
  onClick,
  variant = "default",
  disabled,
  className,
  closeOnSelect = true,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
  className?: string;
  closeOnSelect?: boolean;
}) {
  const { setOpen } = useMenu();
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (closeOnSelect) setOpen(false);
      }}
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors select-none",
        "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "destructive" &&
          "text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive [&_svg]:text-destructive",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
    >
      {children}
    </button>
  );
}

export function MenuLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-2 py-1.5 text-sm font-medium", className)}>
      {children}
    </div>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <div className={cn("-mx-1 my-1 h-px bg-border", className)} />;
}

export function MenuGroup({ children }: { children: React.ReactNode }) {
  return <div role="group">{children}</div>;
}
