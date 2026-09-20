import test from "node:test";
import assert from "node:assert/strict";
import {
  Button,
  Text,
  createSlateApp,
  createTerminalController
} from "../dist/index.js";

test("controller.close fecha app, input e SIGINT uma única vez", () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 8, height: 1 } });
  let appCloseCalls = 0;
  const observedApp = {
    ...app,
    close: () => {
      appCloseCalls += 1;
      return app.close();
    }
  };
  let sourceCloseCalls = 0;
  const source = {
    poll: () => null,
    close: () => { sourceCloseCalls += 1; }
  };
  const beforeSignals = process.listenerCount("SIGINT");
  const controller = createTerminalController(observedApp, source, { write: () => {} }, { intervalMs: 1_000 });

  controller.start();
  assert.equal(process.listenerCount("SIGINT"), beforeSignals + 1);
  controller.close();
  controller.close();
  controller.stop();

  assert.equal(controller.running(), false);
  assert.equal(appCloseCalls, 1);
  assert.equal(sourceCloseCalls, 1);
  assert.equal(process.listenerCount("SIGINT"), beforeSignals);
  assert.equal(app.getTree(), null);
});

test("app.close não duplica o encerramento quando um listener reentra", () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 8, height: 1 } });
  let closeNotifications = 0;
  app.subscribeClose(() => {
    closeNotifications += 1;
    if (closeNotifications === 1) app.close();
  });

  assert.doesNotThrow(() => app.close());
  app.close();

  assert.equal(closeNotifications, 1);
  assert.equal(app.getTree(), null);
});

test("mount, flush e unmount mantêm o ciclo síncrono e remontável", () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), {
    autoMount: false,
    viewport: { width: 8, height: 1 }
  });

  assert.equal(app.getTree(), null);
  app.mount();
  assert.notEqual(app.getTree(), null);
  app.flush();
  app.unmount();
  assert.equal(app.getTree(), null);
  app.flush();
  assert.notEqual(app.getTree(), null);
  app.close();
  assert.equal(app.getTree(), null);
});

test("stop pausa sem liberar a fonte e start não duplica o listener de sinal", () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 8, height: 1 } });
  let sourceCloseCalls = 0;
  const source = {
    poll: () => null,
    close: () => { sourceCloseCalls += 1; }
  };
  const beforeSignals = process.listenerCount("SIGINT");
  const controller = createTerminalController(app, source, { write: () => {} }, { intervalMs: 1_000, animationFps: 0 });

  controller.start();
  controller.stop();
  assert.equal(controller.running(), false);
  assert.notEqual(app.getTree(), null);
  assert.equal(sourceCloseCalls, 0);
  assert.equal(process.listenerCount("SIGINT"), beforeSignals);

  controller.start();
  assert.equal(process.listenerCount("SIGINT"), beforeSignals + 1);
  controller.close();
  assert.equal(sourceCloseCalls, 1);
  assert.equal(process.listenerCount("SIGINT"), beforeSignals);
});

test("controller usa poll injetado no modo headless e fecha após o evento", () => {
  let presses = 0;
  const app = createSlateApp(() => Button({ id: "submit", onPress: () => { presses += 1; } }), {
    autoMount: false,
    viewport: { width: 12, height: 1 }
  });
  const events = [{ kind: "key", code: "Enter" }];
  const writes = [];
  let sourceCloseCalls = 0;
  const controller = createTerminalController(app, {
    poll: () => events.shift() ?? null,
    close: () => { sourceCloseCalls += 1; }
  }, { write: value => { writes.push(value); } }, { intervalMs: 1_000, animationFps: 0 });

  controller.start();

  assert.equal(presses, 1);
  assert.notEqual(app.getTree(), null);
  assert.equal(writes.length, 1);
  controller.close();

  assert.equal(sourceCloseCalls, 1);
  assert.equal(app.getTree(), null);
});

test("falha de polling chega ao controller e não deixa o router ativo", () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 8, height: 1 } });
  const failure = new Error("poll quebrado");
  const errors = [];
  let sourceCloseCalls = 0;
  const controller = createTerminalController(app, {
    poll: () => { throw failure; },
    close: () => { sourceCloseCalls += 1; }
  }, { write: () => {} }, { onError: error => { errors.push(error); } });

  controller.start();

  assert.equal(controller.running(), false);
  assert.equal(controller.error(), failure);
  assert.deepEqual(errors, [failure]);
  assert.equal(sourceCloseCalls, 1);
  assert.equal(app.getTree(), null);
});

test("falha assíncrona de write fecha o controller e preserva o erro", async () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 8, height: 1 } });
  const failure = new Error("write quebrado");
  const errors = [];
  let sourceCloseCalls = 0;
  const controller = createTerminalController(app, {
    poll: () => null,
    close: () => { sourceCloseCalls += 1; }
  }, {
    write: () => new Promise((resolve, reject) => {
      setTimeout(() => reject(failure), 0);
    })
  }, { intervalMs: 1_000, onError: error => { errors.push(error); } });

  controller.start();
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(controller.running(), false);
  assert.equal(controller.error(), failure);
  assert.deepEqual(errors, [failure]);
  assert.equal(sourceCloseCalls, 1);
  assert.equal(app.getTree(), null);
});

test("falha de render durante o primeiro evento desmonta o app headless", () => {
  const failure = new Error("render quebrado");
  const app = createSlateApp(() => { throw failure; }, {
    autoMount: false,
    viewport: { width: 8, height: 1 }
  });
  const errors = [];
  let sourceCloseCalls = 0;
  const controller = createTerminalController(app, {
    poll: () => ({ kind: "key", code: "Enter" }),
    close: () => { sourceCloseCalls += 1; }
  }, { write: () => {} }, { onError: error => { errors.push(error); } });

  controller.start();

  assert.equal(controller.running(), false);
  assert.equal(controller.error(), failure);
  assert.deepEqual(errors, [failure]);
  assert.equal(sourceCloseCalls, 1);
  assert.equal(app.getTree(), null);
});

test("falha de flush síncrono chega ao controller antes de ser relançada", () => {
  let broken = false;
  const failure = new Error("flush quebrado");
  const app = createSlateApp(() => {
    if (broken) throw failure;
    return Text({ id: "text", text: "Slate" });
  }, { viewport: { width: 8, height: 1 } });
  const errors = [];
  let sourceCloseCalls = 0;
  const controller = createTerminalController(app, {
    poll: () => null,
    close: () => { sourceCloseCalls += 1; }
  }, { write: () => {} }, { intervalMs: 1_000, onError: error => { errors.push(error); } });

  controller.start();
  broken = true;
  assert.throws(() => app.flush(), failure);

  assert.equal(controller.running(), false);
  assert.equal(controller.error(), failure);
  assert.deepEqual(errors, [failure]);
  assert.equal(sourceCloseCalls, 1);
  assert.equal(app.getTree(), null);
});
