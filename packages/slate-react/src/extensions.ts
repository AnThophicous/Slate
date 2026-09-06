/**
 * Extension point for third-party widgets and libraries.
 *
 * A React library that wants to live in a Slate terminal needs three things:
 * a node type the layout can measure, a way to draw it, and a way to receive
 * events. This module registers all three under the same identity, event and
 * lifecycle contract the built-in widgets use, so an extension is a peer of
 * the core widgets rather than a special case wired into the renderer.
 */

import { defineClass, type SlateClassDefinition } from "./classes.js";
import { createElement } from "./vnode.js";
import { sanitizeTerminalText } from "./text.js";
import type { ComponentTreeNode, EventResult, NodeProps, SlateEvent, SlateProps, SlateVNode } from "./types.js";

export interface ExtensionWidgetDefinition {
  /** Node type. Must not collide with a built-in type. */
  readonly type: string;
  readonly defaultProps?: Readonly<Record<string, unknown>>;
  /**
   * Lines the widget prints. Layout measures the same lines the renderer
   * draws, so this function decides both the size and the picture.
   */
  readonly text?: (node: ComponentTreeNode, frameIndex: number) => readonly string[];
  /** Default behavior, consulted after node handlers and controllers. */
  readonly handleEvent?: (node: ComponentTreeNode, event: SlateEvent) => EventResult | void;
}

export interface ExtensionContext {
  readonly name: string;
  readonly registerWidget: (definition: ExtensionWidgetDefinition) => () => void;
  readonly registerClass: (definition: SlateClassDefinition) => void;
}

export interface SlateExtension {
  readonly name: string;
  readonly version?: string;
  readonly widgets?: readonly ExtensionWidgetDefinition[];
  readonly classes?: readonly SlateClassDefinition[];
  /** Optional setup, returning its own teardown. Runs once per registration. */
  readonly setup?: (context: ExtensionContext) => void | (() => void);
}

export interface ExtensionRegistration {
  readonly name: string;
  readonly version: string;
  readonly widgets: readonly string[];
  /** Removes everything this registration added. Idempotent. */
  readonly dispose: () => void;
}

export interface ExtensionSummary {
  readonly name: string;
  readonly version: string;
  readonly widgets: readonly string[];
}

/** Node types owned by Slate. An extension may not redefine them. */
export const BUILT_IN_WIDGET_TYPES: readonly string[] = [
  "container", "block", "button", "text", "input", "select", "checkbox", "tabs",
  "table", "spinner", "progress", "modal", "scrollView", "list", "form",
  "glow", "colorShift", "image", "video", "media"
];

const widgets = new Map<string, ExtensionWidgetDefinition>();
const extensions = new Map<string, ExtensionRegistration>();

export function registerWidget(definition: ExtensionWidgetDefinition): () => void {
  const type = definition.type;
  if (typeof type !== "string" || type.length === 0) throw new TypeError("O widget precisa de um type não vazio.");
  if (BUILT_IN_WIDGET_TYPES.includes(type)) throw new TypeError(`O type "${type}" pertence ao Slate e não pode ser redefinido.`);
  const previous = widgets.get(type);
  widgets.set(type, definition);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (widgets.get(type) !== definition) return;
    if (previous) widgets.set(type, previous);
    else widgets.delete(type);
  };
}

export function getWidget(type: string): ExtensionWidgetDefinition | undefined {
  return widgets.get(type);
}

export function listWidgets(): readonly string[] {
  return [...widgets.keys()];
}

export function registerExtension(extension: SlateExtension): ExtensionRegistration {
  if (!extension || typeof extension.name !== "string" || extension.name.length === 0) {
    throw new TypeError("A extensão precisa de um name não vazio.");
  }
  const disposers: (() => void)[] = [];
  const context: ExtensionContext = {
    name: extension.name,
    registerWidget: definition => {
      const dispose = registerWidget(definition);
      disposers.push(dispose);
      return dispose;
    },
    registerClass: definition => {
      defineClass(definition);
    }
  };
  for (const widget of extension.widgets ?? []) context.registerWidget(widget);
  for (const definition of extension.classes ?? []) context.registerClass(definition);
  const teardown = extension.setup?.(context);
  if (typeof teardown === "function") disposers.push(teardown);

  let disposed = false;
  const registration: ExtensionRegistration = {
    name: extension.name,
    version: extension.version ?? "0.0.0",
    widgets: (extension.widgets ?? []).map(widget => widget.type),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      // Reverse order, so a setup that built on a widget is undone first.
      for (const dispose of disposers.reverse()) dispose();
      if (extensions.get(extension.name) === registration) extensions.delete(extension.name);
    }
  };
  extensions.get(extension.name)?.dispose();
  extensions.set(extension.name, registration);
  return registration;
}

export function listExtensions(): readonly ExtensionSummary[] {
  return [...extensions.values()].map(entry => ({ name: entry.name, version: entry.version, widgets: entry.widgets }));
}

/** Removes every registered extension and widget. Intended for tests. */
export function clearExtensions(): void {
  for (const registration of [...extensions.values()]) registration.dispose();
  extensions.clear();
  widgets.clear();
}

/** Creates a component factory for a registered type. */
export function createWidget(definition: ExtensionWidgetDefinition): (props?: NodeProps) => SlateVNode {
  return (props: NodeProps = {}) => createElement<SlateProps>(definition.type, { ...definition.defaultProps, ...props } as SlateProps);
}

/** Lines for a third-party node type, or undefined when the type is not ours. */
export function extensionWidgetText(node: ComponentTreeNode, frameIndex: number): readonly string[] | undefined {
  const definition = widgets.get(node.type);
  if (!definition?.text) return undefined;
  const lines = definition.text(node, frameIndex);
  if (!Array.isArray(lines)) return undefined;
  // An extension is untrusted input for the renderer: a raw escape sequence in
  // its output would let it paint outside its own rectangle.
  return lines.map(line => sanitizeTerminalText(String(line)));
}

export function extensionWidgetEvent(node: ComponentTreeNode, event: SlateEvent): EventResult | undefined {
  const definition = widgets.get(node.type);
  if (!definition?.handleEvent) return undefined;
  const result = definition.handleEvent(node, event);
  return result === "ignored" || result === "consumed" || result === "render" || result === "exit" ? result : undefined;
}

export interface ConformanceCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface ConformanceReport {
  readonly extension: string;
  readonly passed: boolean;
  readonly checks: readonly ConformanceCheck[];
}

/**
 * Verifies that an extension honors the contract before it is published.
 *
 * The suite registers the extension in isolation, exercises every widget and
 * removes it again, so a failure here is a real incompatibility rather than a
 * style preference.
 */
export function runExtensionConformance(extension: SlateExtension): ConformanceReport {
  const checks: ConformanceCheck[] = [];
  const check = (name: string, passed: boolean, detail: string): void => {
    checks.push({ name, passed, detail });
  };
  const name = typeof extension?.name === "string" ? extension.name : "";
  check("name", name.length > 0, name.length > 0 ? name : "A extensão precisa de um name não vazio.");
  if (name.length === 0) return { extension: name, passed: false, checks };

  const declared = extension.widgets ?? [];
  const collisions = declared.filter(widget => BUILT_IN_WIDGET_TYPES.includes(widget.type));
  check("types-livres", collisions.length === 0, collisions.length === 0 ? "Nenhum type colide com o núcleo." : `Types reservados: ${collisions.map(widget => widget.type).join(", ")}`);

  let registration: ExtensionRegistration | undefined;
  try {
    registration = registerExtension(extension);
    check("registro", true, `${registration.widgets.length} widget(s) registrado(s).`);
  } catch (error) {
    check("registro", false, String(error instanceof Error ? error.message : error));
    return { extension: name, passed: false, checks };
  }

  try {
    for (const widget of declared) {
      const node = probeNode(widget);
      if (!widget.text) {
        check(`${widget.type}:texto`, true, "Sem text(): o widget é medido como vazio.");
        continue;
      }
      let first: readonly string[];
      let second: readonly string[];
      try {
        first = widget.text(node, 0);
        second = widget.text(node, 0);
      } catch (error) {
        check(`${widget.type}:texto`, false, `text() lançou: ${String(error instanceof Error ? error.message : error)}`);
        continue;
      }
      const strings = Array.isArray(first) && first.every(line => typeof line === "string");
      check(`${widget.type}:texto`, strings, strings ? `${first.length} linha(s).` : "text() deve devolver um array de strings.");
      if (!strings) continue;
      const deterministic = JSON.stringify(first) === JSON.stringify(second);
      check(`${widget.type}:determinismo`, deterministic, deterministic ? "Mesma entrada, mesma saída." : "text() devolveu saídas diferentes para a mesma entrada.");
      const clean = first.every(line => line === sanitizeTerminalText(line));
      check(`${widget.type}:sem-ansi`, clean, clean ? "Sem sequências de controle." : "text() emitiu sequências de controle; o renderer as remove.");
      const resolvable = getWidget(widget.type) !== undefined;
      check(`${widget.type}:resolvível`, resolvable, resolvable ? "Registrado no runtime." : "O type não ficou disponível após o registro.");
    }
  } finally {
    registration.dispose();
  }

  const cleaned = declared.every(widget => getWidget(widget.type) === undefined);
  check("dispose", cleaned, cleaned ? "dispose() removeu todos os types." : "dispose() deixou types registrados.");
  return { extension: name, passed: checks.every(entry => entry.passed), checks };
}

function probeNode(widget: ExtensionWidgetDefinition): ComponentTreeNode {
  return {
    uid: `${widget.type}:conformance`,
    id: `${widget.type}:conformance`,
    key: null,
    type: widget.type,
    props: { ...widget.defaultProps },
    children: []
  };
}
