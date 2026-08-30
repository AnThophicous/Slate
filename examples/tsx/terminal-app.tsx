import { Button, Container, Input, Text, signal } from "@slate-terminal/react";
import { render } from "@slate-terminal/react";

const name = signal("");

export const view = (
  <Container id="app" direction="column" gap={1} padding={1} width="100%" height="100%">
    <Text id="title">Slate Mosaic</Text>
    <Input id="name" value={name} placeholder="Digite seu nome" onChange={value => name.set(value)} />
    <Button id="save" onPress={() => { process.stdout.write(`Olá, ${name.peek()}\n`); }}>Salvar</Button>
  </Container>
);

export function start() {
  return render(view, { viewport: { width: 80, height: 24 } });
}
