export declare function disableBracketedPaste(): void

export declare function disableFocusChange(): void

export declare function disableMouseCapture(): void

export declare function disableRawMode(): void

export interface EffectOptions {
  text: string
  color: string
  to?: string
  width?: number
  height?: number
  x?: number
  y?: number
  radius?: number
  intensity?: number
  elapsedMs?: number
}

export declare function enableBracketedPaste(): void

export declare function enableFocusChange(): void

export declare function enableMouseCapture(): void

export declare function enableRawMode(): void

export interface NativeEvent {
  kind: string
  code?: string
  text?: string
  modifiers: number
  x?: number
  y?: number
  width?: number
  height?: number
  action?: string
  button?: string
  deltaX?: number
  deltaY?: number
}

export declare function pollEvent(timeoutMs?: number | undefined | null): NativeEvent | null

export declare function render(options: RenderOptions): string

export declare function renderColorShift(options: EffectOptions): string

export declare function renderGlow(options: EffectOptions): string

export interface RenderOptions {
  text: string
  width?: number
  height?: number
  x?: number
  y?: number
  foreground?: string
  background?: string
}

export declare function renderText(text: string): string

export declare function version(): string
