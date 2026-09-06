# Benchmarks

`npm run benchmark` mede o Slate em Node.js com 10.000 iterações por padrão. O número pode ser alterado com `SLATE_BENCHMARK_ITERATIONS`. Cada linha da saída é um JSON com `engine`, `scenario`, `milliseconds` e `rendersPerSecond`:

- `slate` / `reconcile`: view, resolução da árvore, diff e layout.
- `slate` / `frame`: o mesmo ciclo mais a geração do frame ANSI completo, escrito em um stream descartado.
- `ink` / `frame`: a mesma árvore de duas colunas re-renderizada pelo Ink no mesmo tipo de stream.

Ink não é dependência do Slate. Para incluir a linha do Ink, instale-o em qualquer diretório e aponte as duas variáveis para essa instalação — os dois lados precisam usar a mesma cópia de React, senão o Ink recebe elementos de outro React:

~~~sh
SLATE_BENCHMARK_INK="file:///caminho/node_modules/ink/build/index.js" SLATE_BENCHMARK_REACT="file:///caminho/node_modules/react/index.js" npm run benchmark
~~~

Sem essas variáveis (e sem `ink` resolvível), a linha do Ink sai como `{"engine":"ink","available":false,...}` com o motivo.

Os dois cenários `frame` não são idênticos por construção: o Slate regenera o frame inteiro a cada iteração, enquanto o Ink aplica seu próprio diff de saída. Leia os números como ordem de grandeza, não como um empate exato.

## Orçamento de frame

`npm run benchmark:check` roda os cenários do Slate e compara cada um com o orçamento declarado em `budget.json`, em microssegundos por iteração. O comando sai com erro quando um cenário passa do orçamento, e o CI usa isso como gate de regressão.

Os números variam por máquina, então os orçamentos têm folga deliberada e `SLATE_BUDGET_SCALE` os multiplica para uma máquina mais lenta (o CI usa `3`). `SLATE_BUDGET_ITERATIONS` controla quantas iterações cada cenário roda.

A linha `first-frame` compara o primeiro frame frio com o primeiro frame depois de `prewarmSync`. Ela é informativa e não tem orçamento: a razão entre os dois depende demais da máquina para virar gate.
