# Slate 1.5.0

Slate 1.5 introduz o modelo de composição por blocos, mantendo a API básica da
1.0.0 disponível. O modelo recomendado passa a ser uma árvore de containers:

```text
SlateApp
└── Container
    ├── Block
    ├── Block
    └── Container
        └── Block
```

Cada container possui uma área, filhos e uma política de eventos. O evento é
entregue primeiro ao elemento mais específico sob o cursor; se ele não consumir
o evento, a propagação sobe pela árvore até o container raiz.

## Estabilidade visual

O renderer mantém um frame anterior, calcula somente células alteradas e pode
limitar a frequência de saída. Frames idênticos não geram escrita no terminal.
Isso evita duplicação acidental, spam de render e grande parte do stuttering.

## Compatibilidade de terminal

O núcleo usa UTF-8 e largura de célula Unicode. A entrada oficial usa crossterm,
com teclado, mouse, resize e paste em Linux, Windows e macOS. Cores customizadas
aceitam exclusivamente hex, nos formatos `#RGB` e `#RRGGBB`.

Para projetos TypeScript, `@slate-terminal/react` oferece JSX automático,
stores compatíveis com hooks, reconciliação por `key` ou `id` e engines de
layout portável ou Yoga injetado.

## Efeitos

`Glow` é o primeiro efeito opcional. Ele trabalha sobre uma região ou bloco e
modifica a aparência do frame no instante atual; não altera a árvore nem o
contrato de eventos.
