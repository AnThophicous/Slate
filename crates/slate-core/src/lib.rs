mod color;
mod event;
mod frame;
mod geometry;
mod style;
mod ui;

pub use color::Color;
pub use event::{
    Event, EventResult, KeyCode, KeyEvent, KeyEventKind, Modifiers, MouseButton, MouseEvent,
    MouseEventKind,
};
pub use frame::{Cell, Frame};
pub use geometry::{Point, Rect, Size};
pub use style::{Attributes, Style};
pub use ui::Component;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
