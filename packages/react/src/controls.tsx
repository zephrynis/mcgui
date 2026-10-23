'use client';

import { useMemo, type ComponentPropsWithRef, type CSSProperties } from 'react';
import { JAVA_26_2, measureText, normalizeSliderValue, progressGeometry, type ProgressVariant } from '@mcgui/core';
import { MinecraftText, Sprite, useMinecraft } from './primitives.js';

export interface CheckboxProps extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'children' | 'size' | 'checked' | 'defaultChecked'> {
  children: string;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}
/** Controlled native checkbox; the ref and form attributes belong to the input. */
export function Checkbox({ children, checked, onCheckedChange, onChange, disabled, className = '', style, ...props }: CheckboxProps) {
  const { scale, assets } = useMinecraft();
  const { size, gap } = JAVA_26_2.checkbox;
  if (children.includes('\n')) throw new Error('Checkbox labels must be a single line.');
  return <label className={`mcui-checkbox ${className}`} data-disabled={disabled || undefined}
    style={{ minHeight: size * scale, gap: gap * scale, ...style }}>
    <input {...props} type="checkbox" checked={checked} disabled={disabled} className="mcui-control-input"
      onChange={event => { onChange?.(event); onCheckedChange?.(event.currentTarget.checked); }} />
    <span className="mcui-checkbox-box" style={{ width: size * scale, height: size * scale }}>
      <Sprite name={checked ? 'checkbox.selected' : 'checkbox.normal'} width={size} height={size} className="mcui-control-normal" />
      <Sprite name={checked ? 'checkbox.selectedHighlighted' : 'checkbox.highlighted'} width={size} height={size} className="mcui-control-highlighted" />
    </span>
    <MinecraftText style={{ marginTop: (Math.floor(size / 2) - Math.floor(assets.font.lineHeight / 2)) * scale }}>{children}</MinecraftText>
  </label>;
}

export interface SliderProps extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'children' | 'size' | 'width' | 'height' | 'value' | 'defaultValue' | 'min' | 'max' | 'step'> {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  width?: number;
  /** Visible label, e.g. "Music: 50%". The accessible name stays stable. */
  valueLabel?: string;
  onValueChange?: (value: number) => void;
}
export function Slider({ label, value, min = 0, max = 100, step = 1, width = 150, valueLabel,
  onValueChange, onChange, disabled, className = '', style, ...props }: SliderProps) {
  const { assets, scale } = useMinecraft();
  const { height, handleWidth } = JAVA_26_2.slider;
  // Dragging changes only the handle position and label, not the sprite trees.
  const track = useMemo(() => <>
    <Sprite name="slider.normal" width={width} height={height} className="mcui-control-normal" />
    <Sprite name="slider.highlighted" width={width} height={height} className="mcui-control-highlighted" />
  </>, [width, height]);
  const handle = useMemo(() => <>
    <Sprite name="slider.handle" width={handleWidth} height={height} className="mcui-control-normal" />
    <Sprite name="slider.handleHighlighted" width={handleWidth} height={height} className="mcui-control-highlighted" />
  </>, [handleWidth, height]);
  const current = normalizeSliderValue(value, min, max, step);
  valueLabel ??= `${label}: ${current}`;
  if (!Number.isInteger(width) || width < 16 || width > 2048) throw new Error('Slider width must be integer GUI units from 16 to 2048.');
  if (valueLabel.includes('\n')) throw new Error('Slider labels must be a single line.');
  const left = Math.floor((current - min) / (max - min) * (width - handleWidth)) * scale;
  return <span className={`mcui-slider ${className}`} data-disabled={disabled || undefined}
    style={{ width: width * scale, height: height * scale, '--mcui-handle-width': `${handleWidth * scale}px`, ...style } as CSSProperties}>
    <input {...props} type="range" aria-label={label} aria-valuetext={props['aria-valuetext'] ?? valueLabel}
      min={min} max={max} step={step} value={current} disabled={disabled} className="mcui-control-input"
      onChange={event => { onChange?.(event); onValueChange?.(event.currentTarget.valueAsNumber); }} />
    {track}
    <span className="mcui-slider-handle" style={{ left: 0, transform: `translateX(${left}px)` }}>{handle}</span>
    <span aria-hidden="true" className="mcui-button-label" style={{ top: Math.floor((height - assets.font.lineHeight) / 2) * scale }}>
      <MinecraftText style={{ transform: `translateX(${Math.floor((width - measureText(assets.font, valueLabel)) / 2) * scale}px)` }}>{valueLabel}</MinecraftText>
    </span>
    <span className="mcui-native-label" aria-hidden="true">{valueLabel}</span>
  </span>;
}

export interface ProgressBarProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  label: string;
  /** Normalized progress from 0 to 1. Zero hides the fill. */
  value: number;
  variant?: ProgressVariant;
}
export function ProgressBar({ label, value, variant = 'experience', className = '', style, ...props }: ProgressBarProps) {
  const { scale } = useMinecraft();
  const geometry = progressGeometry(variant, value);
  const { width, height, filled, vertical, sprite, background } = geometry;
  return <div {...props} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={value}
    className={`mcui-progress ${className}`} data-variant={variant} style={{ width: width * scale, height: height * scale, ...style }}>
    {background ? <Sprite name={background} width={width} height={height} /> : null}
    <span className="mcui-progress-fill" style={{ left: 0, bottom: 0, width: (vertical ? width : filled) * scale, height: (vertical ? filled : height) * scale }}>
      <Sprite name={sprite} width={width} height={height} style={{ position: 'absolute', left: 0, bottom: 0 }} />
    </span>
  </div>;
}

export type { ProgressVariant } from '@mcgui/core';
