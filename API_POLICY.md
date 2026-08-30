# Política de API 1.x

Slate 1.5.0 é uma linha LTS. Compatibilidade é um requisito de projeto, não uma
promessa feita apenas no momento do release.

1. APIs públicas não são removidas, renomeadas ou alteradas semanticamente em 1.x.
2. Novos recursos são aditivos e preservam os valores padrão anteriores.
3. Tipos que podem receber casos futuros são `#[non_exhaustive]`.
4. Uma API obsoleta permanece disponível com `#[deprecated]`, documentação de
   migração e pelo menos uma janela de release antes de remoção em uma major.
5. Cada release passa por `cargo test`, `cargo clippy -D warnings`, documentação,
   typecheck TypeScript e testes de integração.
6. Mudanças de dependências internas não podem vazar comportamento incompatível
   para a API pública.

Quebrar a regra exige uma nova linha major e um documento de migração aprovado.
