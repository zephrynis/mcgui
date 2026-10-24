'use client';

import { createContext, useContext, useId, useMemo, type ComponentPropsWithRef, type CSSProperties, type ReactNode } from 'react';
import { assetUrl, measureText, parseManifest, spriteSlices, plainText, textRuns, textColor, type AssetManifest, type SpriteRole, type TextContent } from '@mcgui/core';

type Theme = { assets: AssetManifest; baseUrl: string; scale: number };
const MinecraftContext = createContext<Theme | null>(null);
export type MinecraftProviderProps = Theme & { children: ReactNode };
export function MinecraftProvider({ assets, baseUrl, scale = 2, children }: Omit<MinecraftProviderProps, 'scale'> & { scale?: number }) {
  const manifest = useMemo(() => parseManifest(assets), [assets]);
  if (!Number.isInteger(scale) || scale < 1 || scale > 8) throw new Error('GUI scale must be an integer from 1 to 8.');
  const context = useMemo(() => ({ assets: manifest, baseUrl, scale }), [manifest, baseUrl, scale]);
  return <MinecraftContext.Provider value={context}>{children}</MinecraftContext.Provider>;
}
export function useMinecraft(): Theme {
  const context = useContext(MinecraftContext);
  if (!context) throw new Error('MCGUI components must be inside MinecraftProvider.');
  return context;
}

export interface SpriteProps { name: SpriteRole; width: number; height: number; className?: string; style?: CSSProperties }
export function Sprite({ name, width, height, className = '', style }: SpriteProps) {
  const { assets, baseUrl, scale } = useMinecraft();
  const sprite = assets.sprites[name];
  if (!sprite) throw new Error(`Missing ${name} assets. Re-run mcgui-assets extract with the current CLI.`);
  const slices = useMemo(() => spriteSlices(sprite, width, height), [sprite, width, height]);
  const drawing = useMemo(() => slices.map((slice, index) => <svg key={index} x={slice.x} y={slice.y} width={slice.width} height={slice.height}
      viewBox={`${slice.sx} ${slice.sy} ${slice.sw} ${slice.sh}`} preserveAspectRatio="none" overflow="hidden">
      <image href={assetUrl(baseUrl, sprite.file)} width={sprite.pixelWidth} height={sprite.pixelHeight} />
    </svg>), [slices, sprite, baseUrl]);
  return <svg aria-hidden="true" focusable="false" className={`mcgui-sprite ${className}`} width={width * scale} height={height * scale}
    viewBox={`0 0 ${width} ${height}`} style={style}>
    {drawing}
  </svg>;
}

export interface MinecraftTextProps { children: TextContent; shadow?: boolean; className?: string; style?: CSSProperties }
export function MinecraftText({ children, shadow = true, className = '', style }: MinecraftTextProps) {
  const { assets, baseUrl, scale } = useMinecraft();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { font } = assets;
  const text = plainText(children);
  const width = measureText(font, children) + (textRuns(children).some(run=>run.italic) ? 2 : 0), lines = text.split('\n');
  const height = lines.length * font.lineHeight;
  // Glyph SVGs are costly to rebuild and reconcile. Position/style changes and
  // unrelated inventory updates can reuse the exact same drawing.
  const drawing = useMemo(() => {
    const colors = [...new Set(textRuns(children).map(run => textColor(run.color)))];
    let x = 0, row = 0, index = 0;
    const glyphs = textRuns(children).flatMap(run => {
      const color = colors.indexOf(textColor(run.color));
      return [...run.text].flatMap(char => {
        if (char === '\n') { x = 0; row++; return []; }
        const glyph = font.glyphs[char] ?? font.glyphs['?']!;
        const currentX = x; x += glyph.advance + Number(!!run.bold);
        const decorations = <>{run.underlined ? <rect x={currentX} y={row*font.lineHeight+font.baseline+1} width={x-currentX} height={1} fill="white"/> : null}
          {run.strikethrough ? <rect x={currentX} y={row*font.lineHeight+font.baseline-3} width={x-currentX} height={1} fill="white"/> : null}</>;
        if (!glyph.image) return run.underlined || run.strikethrough ? [{color,key:index++,image:decorations}] : [];
        const image = glyph.image;
        if (!run.bold && !run.italic && !run.underlined && !run.strikethrough) return [{color,key:index++,image:<svg x={currentX} y={row*font.lineHeight+font.baseline-image.ascent}
          width={image.renderWidth} height={image.renderHeight} viewBox={`${image.x} ${image.y} ${image.width} ${image.height}`} overflow="hidden" preserveAspectRatio="none">
          <image href={assetUrl(baseUrl,image.file)} width={image.pixelWidth} height={image.pixelHeight}/>
        </svg>}];
        const shape = <svg x={0} y={0}
          width={image.renderWidth} height={image.renderHeight} viewBox={`${image.x} ${image.y} ${image.width} ${image.height}`} overflow="hidden" preserveAspectRatio="none">
          <image href={assetUrl(baseUrl, image.file)} width={image.pixelWidth} height={image.pixelHeight} />
        </svg>;
        return [{ color, key: index++, image: <>{decorations}<g transform={`translate(${currentX} ${row*font.lineHeight+font.baseline-image.ascent})`}>
          <g transform={run.italic ? 'matrix(1 0 -0.25 1 1 0)' : undefined}>{shape}{run.bold ? <g transform="translate(1 0)">{shape}</g> : null}</g>
        </g></> }];
      });
    });
    return <svg aria-hidden="true" focusable="false" width={(width + (shadow ? 1 : 0)) * scale} height={height * scale}
      viewBox={`0 0 ${width + (shadow ? 1 : 0)} ${height}`} overflow="visible">
      <defs>
        {colors.flatMap((color, colorIndex) => [false, true].map(dark => <filter key={`${colorIndex}-${dark}`} id={`${id}-${colorIndex}-${dark ? 'shadow' : 'text'}`} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feFlood floodColor={color} result="color" />
          <feBlend in="SourceGraphic" in2="color" mode="multiply" />
          <feComposite in2="SourceGraphic" operator="in" />
          {dark ? <feComponentTransfer><feFuncR type="linear" slope="0.25" /><feFuncG type="linear" slope="0.25" /><feFuncB type="linear" slope="0.25" /></feComponentTransfer> : null}
        </filter>))}
      </defs>
      {shadow ? <g transform="translate(1 1)">{glyphs.map(glyph => <g key={glyph.key} filter={`url(#${id}-${glyph.color}-shadow)`}>{glyph.image}</g>)}</g> : null}
      {glyphs.map(glyph => <g key={glyph.key} filter={`url(#${id}-${glyph.color}-text)`}>{glyph.image}</g>)}
    </svg>;
  }, [children, font, baseUrl, scale, width, height, id, shadow]);
  return <span className={`mcgui-text ${className}`} style={{ width: (width + (shadow ? 1 : 0)) * scale, height: height * scale, ...style }}>
    <span className="mcgui-sr-only">{text}</span>
    {drawing}
  </span>;
}

export interface ButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  children: string; width?: number; height?: number;
}
export function Button({ children, width = 200, height = 20, className = '', style, type = 'button', disabled, ...props }: ButtonProps) {
  const { scale, assets } = useMinecraft();
  if (!Number.isInteger(width) || width < 8 || width > 2048 || !Number.isInteger(height) || height < 12 || height > 512) throw new Error('Button dimensions must be integer GUI units (width 8–2048, height 12–512).');
  return <button {...props} type={type} disabled={disabled} className={`mcgui-button ${className}`}
    style={{ width: width * scale, height: height * scale, ...style }}>
    <Sprite name="button.normal" width={width} height={height} className="mcgui-button-normal" />
    <Sprite name="button.highlighted" width={width} height={height} className="mcgui-button-highlighted" />
    <Sprite name="button.disabled" width={width} height={height} className="mcgui-button-disabled" />
    <span className="mcgui-button-label" style={{ top: Math.floor((height - assets.font.lineHeight) / 2) * scale }}>
      <MinecraftText style={{ transform: `translateX(${Math.floor((width - measureText(assets.font, children)) / 2) * scale}px)` }}>{children}</MinecraftText>
    </span>
  </button>;
}

export { parseManifest } from '@mcgui/core';
export type { AssetManifest, SpriteRole } from '@mcgui/core';
