import { Button, Container, type SlateChild } from "../src/index.js";

type PanelProps = { title: string; children?: SlateChild };

function Panel(props: PanelProps): SlateChild {
  return <Container id="panel"><Button>{props.title}</Button>{props.children}</Container>;
}

export const view: SlateChild = <Panel title="Slate"><Button id="nested">Abrir</Button></Panel>;
