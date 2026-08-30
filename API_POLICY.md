# Política de API 2.x

Slate 2.0.0 é uma linha LTS. Compatibilidade é um requisito de projeto e vale para os pacotes npm e crates públicos.

1. APIs públicas não são removidas, renomeadas ou alteradas semanticamente dentro da mesma major.
2. Novos recursos entram de forma aditiva e preservam os valores padrão anteriores.
3. Eventos, IDs, componentes, sinais e métodos do app mantêm contratos explícitos e tipados.
4. Uma API obsoleta permanece disponível com aviso, documentação de migração e pelo menos uma janela de release antes de remoção em uma major.
5. Cada release passa por formatação, testes Rust, clippy sem warnings, documentação Rust, build TypeScript, typecheck, testes Node, exemplos e verificação de pacotes.
6. Dependências internas podem evoluir quando não alterarem o comportamento observável do contrato público.
7. Mudanças de major exigem changelog, guia de migração e atualização dos exemplos oficiais.

O runtime mantém renderização controlada: sinais são agrupados, frames repetidos são ignorados pelo renderer e o layout é recalculado apenas quando necessário. A política não promete que um handler externo nunca possa escrever diretamente no stdout; a API oficial sempre fornece um ciclo único para evitar essa classe de erro.
