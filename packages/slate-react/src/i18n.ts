export type SlateLocale = string;
export type SlateMessages = Readonly<Record<string, string>>;

export interface SlateI18n {
  readonly locale: () => SlateLocale;
  readonly setLocale: (locale: SlateLocale) => void;
  readonly t: (key: string, fallback?: string) => string;
  readonly add: (locale: SlateLocale, messages: SlateMessages) => void;
}

/** Small dependency-free translation registry for app and widget labels. */
export function createI18n(messages: Readonly<Record<SlateLocale, SlateMessages>>, initialLocale = "en"): SlateI18n {
  const catalog = new Map(Object.entries(messages).map(([locale, values]) => [locale, { ...values }]));
  let current = initialLocale;
  return {
    locale: () => current,
    setLocale: locale => { current = locale; },
    t: (key, fallback = key) => catalog.get(current)?.[key] ?? catalog.get("en")?.[key] ?? fallback,
    add: (locale, values) => catalog.set(locale, { ...catalog.get(locale), ...values })
  };
}
