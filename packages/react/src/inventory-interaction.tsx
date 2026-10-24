'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { canDistributeTo, clickInventory, collectInventory, swapInventory, copyCreativeToSlot, pickCreativeItem, distributeInventory, quickMoveInventory, validateInventory, type InventoryButton, type InventoryRules, type InventoryState, type ItemStack } from '@mcgui/core';
import { MinecraftText, useMinecraft } from './primitives.js';
import type { SlotData, SlotProps } from './inventory.js';

export interface InventoryItem extends SlotData, ItemStack { count: number }
export type InventorySlotBindings = Pick<SlotProps, 'onPointerDown' | 'onPointerEnter' | 'onPointerLeave' | 'onClick' | 'onDoubleClick' | 'onContextMenu' | 'onKeyDown' | 'onFocus' | 'tooltipDisabled' | 'aria-keyshortcuts'> & {
  'data-mcgui-inventory': string;
  'data-mcgui-cell': number;
};
export interface UseInventoryOptions<T extends InventoryItem> extends InventoryRules<T> {
  /** Read once. Keep all slots in a stable, flat array, including hidden rows. */
  initialSlots: readonly (T | null)[];
  quickMoveTargets?: (index: number) => readonly number[];
  hotbarSlots?: readonly number[];
  offhandSlot?: number;
  collectTargets?: (index: number) => readonly number[];
}
export type CreativeSlotBindings = Pick<SlotProps, 'onPointerDown' | 'onClick' | 'onAuxClick' | 'onContextMenu' | 'onKeyDown' | 'onFocus' | 'tooltipDisabled' | 'aria-keyshortcuts'>;
type Anchor = { x: number; y: number };
type Gesture = { pointerId: number; button: InventoryButton; skipRelease: boolean; targets: number[]; moved: boolean; startX: number; startY: number };

/** Optional inventory behavior for Slot, ChestScreen and FurnaceScreen. */
export function useInventory<T extends InventoryItem>(options: UseInventoryOptions<T>) {
  const id = useId();
  const [state, setState] = useState<InventoryState<T>>(() => validateInventory({ slots: [...options.initialSlots], carried: null }));
  const [preview, setPreview] = useState<{ targets: number[]; button: InventoryButton } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const hovered = useRef<number | null>(null);
  const anchor = useRef<Anchor>({ x: 0, y: 0 });
  const live = useRef({ state, options });
  useEffect(() => { live.current = { state, options }; }, [state, options]);
  function rules(current: InventoryState<T>, configuration: UseInventoryOptions<T>): InventoryRules<T> {
    return {
      canTake: (index, item) => !current.slots[index]?.disabled && configuration.canTake?.(index, item) !== false,
      canPlace: (index, item) => !current.slots[index]?.disabled && configuration.canPlace?.(index, item) !== false,
      maxCount: configuration.maxCount,
    };
  }
  function canReplace(index: number, current: T | null | undefined, next: T | null, configuration: UseInventoryOptions<T>) {
    if (current?.disabled || (current && configuration.canTake?.(index, current) === false)) return false;
    if (!next) return true;
    if (configuration.canPlace?.(index, next) === false) return false;
    const maximum = configuration.maxCount?.(index, next) ?? next.maxStackSize ?? 64;
    if (!Number.isInteger(maximum) || maximum < 0 || maximum > 999) throw new Error('Slot capacity must be an integer from 0 to 999.');
    return next.count <= maximum;
  }
  function act(index: number, button: InventoryButton, shift: boolean, targets?: readonly number[] | 'discard') {
    const configuration = live.current.options;
    setState(previous => {
      if (shift && targets === 'discard') {
        const item = previous.slots[index];
        if (!item || rules(previous, configuration).canTake?.(index, item) === false) return previous;
        const slots = [...previous.slots]; slots[index] = null;
        return { slots, carried: previous.carried };
      }
      return shift
        ? quickMoveInventory(previous, index, targets === 'discard' ? [] : targets ?? configuration.quickMoveTargets?.(index) ?? [], rules(previous, configuration))
        : clickInventory(previous, index, button, rules(previous, configuration));
    });
  }
  useEffect(() => {
    function targetAt(event: PointerEvent) {
      const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('[data-mcgui-cell]');
      return element?.dataset.mcguiInventory === id && !element.disabled ? Number(element.dataset.mcguiCell) : null;
    }
    function cancel() { gesture.current = null; setPreview(null); }
    function move(event: PointerEvent) {
      const drag = gesture.current;
      if (!drag || drag.skipRelease || event.pointerId !== drag.pointerId) return;
      if (!(event.buttons & (drag.button === 'left' ? 1 : 2))) { cancel(); return; }
      anchor.current = { x: event.clientX, y: event.clientY };
      if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) < 3) return;
      drag.moved = true;
      const index = targetAt(event), { state: current, options: configuration } = live.current;
      if (index !== null && current.carried && !drag.targets.includes(index) && drag.targets.length < current.carried.count && canDistributeTo(current, index, rules(current, configuration))) {
        drag.targets.push(index); setPreview({ targets: [...drag.targets], button: drag.button });
      }
    }
    function release(event: PointerEvent) {
      const drag = gesture.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (event.button !== (drag.button === 'left' ? 0 : 2)) { cancel(); return; }
      if (!drag.skipRelease) {
        const index = targetAt(event), configuration = live.current.options;
        if (drag.moved && drag.targets.length > 1) {
          setState(previous => distributeInventory(previous, drag.targets, drag.button, rules(previous, configuration)));
        } else if (index !== null) act(index, drag.button, event.shiftKey);
      }
      cancel();
    }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') cancel();
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || hovered.current === null || target?.closest('input,textarea,select,[contenteditable="true"]') || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const configuration = live.current.options, index = hovered.current;
      const destination = /^[1-9]$/.test(event.key) ? configuration.hotbarSlots?.[Number(event.key)-1] : event.key.toLowerCase()==='f' ? configuration.offhandSlot : undefined;
      if(destination !== undefined) {event.preventDefault();cancel();setState(previous=>swapInventory(previous,index,destination,rules(previous,configuration)));}
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    return () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', cancel); document.removeEventListener('keydown', key); window.removeEventListener('blur', cancel);
    };
  }, [id]);
  const rendered = preview && preview.targets.length > 1 ? distributeInventory(state, preview.targets, preview.button, rules(state, options)) : state;
  function getSlotProps(index: number, overrides?: { quickMoveTargets?: readonly number[] | 'discard'; collectTargets?: readonly number[] }): InventorySlotBindings {
    return {
      'data-mcgui-inventory': id, 'data-mcgui-cell': index,
      'aria-keyshortcuts': 'Enter Space Shift+Enter Shift+Space Shift+F10 1 2 3 4 5 6 7 8 9 F',
      tooltipDisabled: state.carried !== null,
      onPointerEnter: () => { hovered.current=index; },
      onPointerLeave: () => { if(hovered.current===index) hovered.current=null; },
      onPointerDown: event => {
        if (event.pointerType === 'touch' || ![0, 2].includes(event.button)) return;
        // Native mouse focus clears keyboard focus visibility. Cancelling the
        // pointer default and focusing manually can leave :focus-visible stuck.
        anchor.current = { x: event.clientX, y: event.clientY };
        if (gesture.current) { gesture.current = null; setPreview(null); return; }
        const button = event.button === 2 ? 'right' : 'left';
        const skipRelease = !state.carried || event.shiftKey;
        gesture.current = { pointerId: event.pointerId, button, skipRelease, targets: [], moved: false, startX: event.clientX, startY: event.clientY };
        if (skipRelease) act(index, button, event.shiftKey, overrides?.quickMoveTargets);
        else if (canDistributeTo(state, index, rules(state, options))) gesture.current.targets.push(index);
      },
      onClick: event => {
        // Mouse interactions are handled on press/release. Native clicks keep
        // touch, Enter, Space and assistive-technology activation available.
        if (event.detail === 0 || (event.nativeEvent as PointerEvent).pointerType === 'touch') {
          const rect = event.currentTarget.getBoundingClientRect();
          anchor.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          act(index, 'left', event.shiftKey, overrides?.quickMoveTargets);
        }
      },
      onContextMenu: event => event.preventDefault(),
      onDoubleClick: event => {
        if (event.button !== 0 || event.shiftKey) return;
        gesture.current = null; setPreview(null);
        setState(previous => {
          const configuration = live.current.options, restrictions = rules(previous, configuration);
          // The second ordinary click may already have placed the stack back.
          const picked = previous.carried ? previous : clickInventory(previous, index, 'left', restrictions);
          return collectInventory(picked, overrides?.collectTargets ?? configuration.collectTargets?.(index) ?? picked.slots.map((_, index) => index), restrictions);
        });
      },
      onKeyDown: event => {
        if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
          const configuration = live.current.options;
          const target = /^[1-9]$/.test(event.key) ? configuration.hotbarSlots?.[Number(event.key) - 1] : event.key.toLowerCase() === 'f' ? configuration.offhandSlot : undefined;
          if (target !== undefined) {
            event.preventDefault(); gesture.current = null; setPreview(null);
            setState(previous => swapInventory(previous, hovered.current ?? index, target, rules(previous, configuration))); return;
          }
        }
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault(); act(index, 'right', false);
        } else if (event.shiftKey && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault(); act(index, 'left', true, overrides?.quickMoveTargets);
        }
      },
      onFocus: event => {
        if (event.currentTarget.hasAttribute('data-mcgui-pointer-focus')) return;
        const rect = event.currentTarget.getBoundingClientRect();
        anchor.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        document.dispatchEvent(new Event('mcgui-inventory-anchor'));
      },
    };
  }
  function getCreativeSlotProps(item: T | null, hotbarSlots: readonly number[] = []): CreativeSlotBindings {
    function pick(button: 'left' | 'right' | 'middle', shift: boolean) {
      gesture.current = null; setPreview(null);
      if (!item?.disabled) setState(previous => pickCreativeItem(previous, item, button, shift));
    }
    function anchorAt(element: HTMLElement) {
      const rect = element.getBoundingClientRect();
      anchor.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      document.dispatchEvent(new Event('mcgui-inventory-anchor'));
    }
    return {
      tooltipDisabled: state.carried !== null,
      'aria-keyshortcuts': 'Enter Space Shift+Enter Shift+Space Shift+F10 1 2 3 4 5 6 7 8 9',
      onPointerDown: event => {
        if (event.pointerType === 'touch' || ![0, 1, 2].includes(event.button)) return;
        if (event.button === 1) event.preventDefault();
        anchor.current = { x: event.clientX, y: event.clientY };
        pick(event.button === 1 ? 'middle' : event.button === 2 ? 'right' : 'left', event.shiftKey);
      },
      onClick: event => {
        if (event.detail === 0 || (event.nativeEvent as PointerEvent).pointerType === 'touch') {
          anchorAt(event.currentTarget); pick('left', event.shiftKey);
        }
      },
      onAuxClick: event => event.preventDefault(),
      onContextMenu: event => event.preventDefault(),
      onFocus: event => { if (!event.currentTarget.hasAttribute('data-mcgui-pointer-focus')) anchorAt(event.currentTarget); },
      onKeyDown: event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); pick('right', false); }
        else if (event.shiftKey && ['Enter', ' '].includes(event.key)) { event.preventDefault(); pick('left', true); }
        else if ((/^[1-9]$/.test(event.key) || event.key.toLowerCase()==='f') && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
          const index = event.key.toLowerCase()==='f' ? live.current.options.offhandSlot : hotbarSlots[Number(event.key) - 1];
          if (index !== undefined && item && !item.disabled) {
            event.preventDefault();
            setState(previous => {
              const configuration = live.current.options;
              const full = { ...item, count: item.maxStackSize ?? 64 };
              if (!canReplace(index, previous.slots[index], full, configuration)) return previous;
              return copyCreativeToSlot(previous, item, index);
            });
          }
        }
      },
    };
  }
  return {
    state, slots: rendered.slots, carried: rendered.carried, getSlotProps, getCreativeSlotProps,
    cursor: <InventoryCursor item={rendered.carried} anchor={anchor} />,
    /** Creative delete slot. Pass inventory indices for Shift-click clearing. */
    discard(indices: readonly number[] = []) {
      gesture.current = null; setPreview(null);
      setState(previous => {
        const slots = [...previous.slots];
        for (const index of indices) {
          if (!Number.isInteger(index) || index < 0 || index >= slots.length) throw new Error('Discard index is out of range.');
          if (!slots[index]?.disabled && (!slots[index] || live.current.options.canTake?.(index, slots[index]!) !== false)) slots[index] = null;
        }
        return { slots, carried: null };
      });
    },
    /** Restore app-owned saved hotbars without resetting the carried stack. */
    replaceSlots(indices: readonly number[], replacement: readonly (T | null)[]) {
      if (indices.length !== replacement.length || new Set(indices).size !== indices.length) throw new Error('Replacement slots need matching, unique indices.');
      validateInventory({ slots: replacement, carried: null });
      gesture.current = null; setPreview(null);
      setState(previous => {
        const slots = [...previous.slots];
        indices.forEach((index, offset) => {
          if (!Number.isInteger(index) || index < 0 || index >= slots.length) throw new Error('Replacement index is out of range.');
          const next = replacement[offset]!, current = slots[index];
          if (!canReplace(index, current, next, live.current.options)) return;
          slots[index] = next;
        });
        return { slots, carried: previous.carried };
      });
    },
    reset(slots: readonly (T | null)[] = options.initialSlots) {
      gesture.current = null; setPreview(null); setState(validateInventory({ slots: [...slots], carried: null }));
    },
  };
}

function InventoryCursor({ item, anchor }: { item: InventoryItem | null; anchor: RefObject<Anchor> }) {
  const { scale } = useMinecraft();
  const element = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!item || !mounted) return;
    function position(event?: PointerEvent) {
      if (event) anchor.current = { x: event.clientX, y: event.clientY };
      if (element.current) element.current.style.transform = `translate(${Math.floor(anchor.current.x - 8 * scale)}px, ${Math.floor(anchor.current.y - 8 * scale)}px)`;
    }
    function reposition() { position(); }
    position(); document.addEventListener('pointermove', position); document.addEventListener('mcgui-inventory-anchor', reposition);
    return () => { document.removeEventListener('pointermove', position); document.removeEventListener('mcgui-inventory-anchor', reposition); };
  }, [Boolean(item), mounted, scale, anchor]);
  return item && mounted ? createPortal(<div ref={element} className="mcgui-carried-stack" aria-hidden="true" data-count={item.count}
    style={{ width: 16 * scale, height: 16 * scale, transform: `translate(${Math.floor(anchor.current.x - 8 * scale)}px, ${Math.floor(anchor.current.y - 8 * scale)}px)` }}>
    <span className="mcgui-carried-icon">{item.content}</span>
    {item.count > 1 ? <MinecraftText className="mcgui-carried-count" style={{ top: 9 * scale, right: -2 * scale }}>{String(item.count)}</MinecraftText> : null}
  </div>, document.body) : null;
}

export type { InventoryState, InventoryRules, ItemStack, InventoryButton } from '@mcgui/core';
