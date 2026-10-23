'use client';

import { cloneElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { measureText, plainText, placeTooltip, wrapText, type TextContent } from '@mcgui/core';
import { MinecraftText, Sprite, useMinecraft } from './primitives.js';

// A shared activation store keeps tooltips mutually exclusive without making
// pointer motion re-render the provider or unrelated inventory slots.
let activeTooltip: string | null = null;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
const triggers = new WeakMap<Element, (x: number, y: number) => void>();
/** Internal: recycled cells can move beneath a stationary pointer without pointerenter. */
export function refreshTooltipAt(root: Element, x: number, y: number) {
  if (activeTooltip === null) return;
  const target = document.elementFromPoint(x, y)?.closest('.mcui-tooltip-trigger');
  const activate = target && root.contains(target) ? triggers.get(target) : undefined;
  if (activate) activate(x, y);
  else if (activeTooltip !== null) { activeTooltip = null; for (const listener of listeners) listener(); }
}

export interface TooltipProps {
  children: ReactElement<{ 'aria-describedby'?: string }>;
  content: TextContent;
  /** Maximum text width, in logical GUI pixels. */
  maxWidth?: number;
  disabled?: boolean;
}

export function Tooltip({ children, content, maxWidth = 240, disabled = false }: TooltipProps) {
  const { assets, scale } = useMinecraft();
  const id = useId();
  const trigger = useRef<HTMLSpanElement>(null), panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activity = useRef({ trigger: false, panel: false });
  const open = useSyncExternalStore(subscribe, () => activeTooltip === id, () => false);
  function setOpen(value: boolean) {
    if (!value && activeTooltip !== id) return;
    const next = value ? id : null;
    if (next === activeTooltip) return;
    activeTooltip = next; for (const listener of listeners) listener();
  }
  const [point, setPoint] = useState({ x: 0, y: 0, left: 0, top: 0 });
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  if (!Number.isInteger(maxWidth) || maxWidth < 1 || maxWidth > 4096) throw new Error('Tooltip maxWidth must be an integer from 1 to 4096.');
  const visible = open && !disabled && plainText(content).length > 0;
  function cancelClose() { clearTimeout(closeTimer.current); }
  function anchor(x: number, y: number) {
    const rect = trigger.current!.getBoundingClientRect();
    setPoint({ x, y, left: rect.left, top: rect.top });
  }
  function closeSoon() {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      const focusWithin = trigger.current?.contains(document.activeElement) || panel.current?.contains(document.activeElement);
      if (!activity.current.trigger && !activity.current.panel && !focusWithin) setOpen(false);
    }, 100);
  }
  function focus() {
    cancelClose();
    const rect = trigger.current!.getBoundingClientRect();
    anchor(rect.right, rect.top); setOpen(true);
  }
  function blur(next: EventTarget | null) {
    if (next instanceof Node && (trigger.current?.contains(next) || panel.current?.contains(next))) return;
    closeSoon();
  }
  useLayoutEffect(() => {
    const element = trigger.current!;
    triggers.set(element, (x, y) => { activity.current.trigger = true; cancelClose(); anchor(x, y); setOpen(true); });
    return () => { triggers.delete(element); };
  }, []);
  useEffect(() => () => { clearTimeout(closeTimer.current); setOpen(false); }, [id]);
  useEffect(() => {
    if (!visible) return;
    function resize() { setViewport({ width: window.innerWidth, height: window.innerHeight }); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false); }
    function scroll(event: Event) {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) { setOpen(false); return; }
      setPoint(previous => ({ x: previous.x + rect.left - previous.left, y: previous.y + rect.top - previous.top, left: rect.left, top: rect.top }));
    }
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('keydown', escape);
    document.addEventListener('scroll', scroll, true);
    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('scroll', scroll, true);
    };
  }, [visible]);
  const textWidthLimit = Math.max(1, Math.min(maxWidth, viewport ? Math.floor((viewport.width - 8) / scale) - 25 : maxWidth));
  // Most inventory tooltips stay closed; defer wrapping until one is visible.
  const lines = useMemo(() => visible ? wrapText(assets.font, content, textWidthLimit) : [], [visible, assets.font, content, textWidthLimit]);
  const textWidth = Math.max(1, ...lines.map(line => measureText(assets.font, line) + (line.some(run=>run.italic) ? 2 : 0))) + 1;
  const textHeight = lines.length * assets.font.lineHeight + (lines.length > 1 ? 2 : 0);
  const width = Math.max(1, Math.min(textWidth + 24, viewport ? Math.floor((viewport.width - 8) / scale) : textWidth + 24));
  const height = Math.max(1, Math.min(textHeight + 24, viewport ? Math.floor((viewport.height - 8) / scale) : textHeight + 24));
  const position = viewport ? placeTooltip(point, { width: width * scale, height: height * scale }, viewport, 12 * scale) : { x: 0, y: 0 };
  const description = [children.props['aria-describedby'], visible ? id : undefined].filter(Boolean).join(' ') || undefined;
  return <><span ref={trigger} className="mcui-tooltip-trigger"
    onPointerEnter={event => {
      if (event.pointerType === 'touch') return;
      activity.current.trigger = true; cancelClose(); anchor(event.clientX, event.clientY); setOpen(true);
    }}
    onPointerMove={event => { if (open && event.pointerType !== 'touch') anchor(event.clientX, event.clientY); }}
    onPointerLeave={() => { activity.current.trigger = false; closeSoon(); }}
    onFocusCapture={focus} onBlurCapture={event => blur(event.relatedTarget)}>
    {cloneElement(children, { 'aria-describedby': description })}
    </span>
    {visible && viewport ? createPortal(<div id={id} role="tooltip" ref={panel} className="mcui-tooltip"
      style={{ left: position.x, top: position.y, width: width * scale, height: height * scale }}
      onPointerEnter={() => { activity.current.panel = true; cancelClose(); }}
      onPointerLeave={() => { activity.current.panel = false; closeSoon(); }}
      onFocusCapture={cancelClose} onBlurCapture={event => blur(event.relatedTarget)}>
      <Sprite name="tooltip.background" width={width} height={height} />
      <Sprite name="tooltip.frame" width={width} height={height} />
      <div className="mcui-tooltip-content" tabIndex={textHeight + 24 > height ? 0 : undefined} style={{ inset: 12 * scale, overflow: 'auto' }}>
        {lines.map((line, index) => <div key={index} style={{ height: (assets.font.lineHeight + (index === 0 && lines.length > 1 ? 2 : 0)) * scale }}>
          <MinecraftText>{line}</MinecraftText>
        </div>)}
      </div>
    </div>, document.body) : null}
  </>;
}
