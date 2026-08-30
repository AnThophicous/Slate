# Migração de Ink para Slate

## Equivalências

| Ink | Slate |
|---|---|
| `render(<App />)` | `createApp(root).run()` |
| componente React | `Component` ou `Block` |
| `Box` | `Container` |
| `Text` | `Block::text` |
| `useInput` | `on_event` / `EventSource` |
| `useApp().exit()` | `EventResult::Exit` |
| `useStdin` | `poll_event` |

## Estratégia recomendada

1. Mantenha a lógica de estado existente.
2. Converta cada grupo visual em um `Container`.
3. Converta cada texto em um `Block`.
4. Mova callbacks de `useInput` para handlers de eventos do bloco.
5. Substitua renders manuais por um único ciclo do app.

Slate aceita eventos de teclado e mouse no mesmo contrato, então a lógica pode
ser compartilhada sem acoplar componentes a um dispositivo.
