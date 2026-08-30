mod color;
mod event;
mod frame;
mod geometry;
mod layout;
mod style;
mod tree;
mod ui;
mod widgets;

pub use color::{Color, HexColorError};
pub use event::{
    Event, EventResult, KeyCode, KeyEvent, KeyEventKind, Modifiers, MouseButton, MouseEvent,
    MouseEventKind,
};
pub use frame::{Cell, Frame};
pub use geometry::{Point, Rect, Size};
pub use layout::{
    AlignItems, Dimension, FlexDirection, FlexStyle, FlexWrap, JustifyContent, LayoutEngine,
    LayoutNode, Overflow,
};
pub use style::{Attributes, Style};
pub use tree::{Container, Element, ElementEditor, ElementId};
pub use ui::Component;
pub use widgets::{Button, Checkbox, Input, Select, TextBlock};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
