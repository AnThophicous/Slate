# Contribuindo

Mudanças devem ser pequenas, testadas e documentadas. Preserve a API pública e
consulte [API_POLICY.md](API_POLICY.md) antes de alterar tipos exportados.

Antes de abrir um pull request:

```powershell
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets --all-features -- -D warnings
npm install
npm run typecheck
npm test
```
