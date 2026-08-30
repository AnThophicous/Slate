use bitflags::bitflags;

bitflags! {
    #[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
    pub struct Modifiers: u8 {
        const SHIFT = 1 << 0;
        const CONTROL = 1 << 1;
        const ALT = 1 << 2;
        const SUPER = 1 << 3;
    }
}

#[non_exhaustive]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Event {
    Key(KeyEvent),
    Mouse(MouseEvent),
    Resize(crate::Size),
    Paste(String),
    FocusGained,
    FocusLost,
}

#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KeyCode {
    Char(char),
    Enter,
    Escape,
    Backspace,
    Tab,
    Left,
    Right,
    Up,
    Down,
    Home,
    End,
    PageUp,
    PageDown,
    Insert,
    Delete,
    F(u8),
}

#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KeyEventKind {
    Press,
    Repeat,
    Release,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct KeyEvent {
    code: KeyCode,
    modifiers: Modifiers,
    kind: KeyEventKind,
}

impl KeyEvent {
    pub const fn new(code: KeyCode, modifiers: Modifiers) -> Self {
        Self { code, modifiers, kind: KeyEventKind::Press }
    }
    pub const fn with_kind(mut self, kind: KeyEventKind) -> Self {
        self.kind = kind;
        self
    }
    pub const fn code(self) -> KeyCode {
        self.code
    }
    pub const fn modifiers(self) -> Modifiers {
        self.modifiers
    }
    pub const fn kind(self) -> KeyEventKind {
        self.kind
    }
}

#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
    Other(u16),
}

#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MouseEventKind {
    Press(MouseButton),
    Release(MouseButton),
    Drag(MouseButton),
    Move,
    ScrollUp,
    ScrollDown,
    ScrollLeft,
    ScrollRight,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MouseEvent {
    position: crate::Point,
    kind: MouseEventKind,
    modifiers: Modifiers,
}

impl MouseEvent {
    pub const fn new(position: crate::Point, kind: MouseEventKind, modifiers: Modifiers) -> Self {
        Self { position, kind, modifiers }
    }
    pub const fn position(self) -> crate::Point {
        self.position
    }
    pub const fn kind(self) -> MouseEventKind {
        self.kind
    }
    pub const fn modifiers(self) -> Modifiers {
        self.modifiers
    }
}

#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EventResult {
    Ignored,
    Consumed,
    Render,
    Exit,
}
