import type { EffectSpec, FlexStyle, NodeProps } from "./types.js";

export interface SlateClassDefinition {
  readonly name: string;
  readonly style?: FlexStyle;
  readonly foreground?: string;
  readonly background?: string;
  readonly effect?: EffectSpec;
  readonly props?: Readonly<Record<string, unknown>>;
}

const registry = new Map<string, SlateClassDefinition>();
export function defineClass(definition: SlateClassDefinition): string { registry.set(definition.name, definition); return definition.name; }
export function getClass(name: string): SlateClassDefinition | undefined { return registry.get(name); }
export function defineClasses(definitions: readonly SlateClassDefinition[]): void { for (const definition of definitions) defineClass(definition); }
export function classNames(...names: readonly (string | false | null | undefined)[]): string { return names.filter((name): name is string => Boolean(name)).join(" "); }
export function classes(...names: readonly (string | false | null | undefined)[]): string { return classNames(...names); }
export function resolveClasses(props: NodeProps): NodeProps {
  const source = [props.className, props.class].filter((value): value is string => typeof value === "string").join(" ");
  const names = source.split(/\s+/).filter(Boolean);
  const definitions = names.map(getClass).filter((definition): definition is SlateClassDefinition => definition !== undefined);
  return definitions.reduce((result, definition) => ({
    ...result,
    ...definition.props,
    style: { ...(result.style && typeof result.style === "object" ? result.style : {}), ...definition.style },
    foreground: result.foreground ?? definition.foreground,
    background: result.background ?? definition.background,
    effect: result.effect ?? definition.effect
  }), props);
}
