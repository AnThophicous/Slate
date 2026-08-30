use std::{io, time::Duration};

use crossterm::{
    event::{
        self, DisableBracketedPaste, DisableFocusChange, DisableMouseCapture, EnableBracketedPaste,
        EnableFocusChange, EnableMouseCapture,
    },
    execute,
    terminal::{disable_raw_mode, enable_raw_mode},
};
use slate_core::{
    Event, KeyCode, KeyEvent, KeyEventKind, Modifiers, MouseButton, MouseEvent, MouseEventKind,
    Point, Size,
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum InputError {
    #[error("erro de entrada do terminal: {0}")]
    Io(#[from] io::Error),
}

pub trait EventSource {
    fn poll(&mut self, timeout: Duration) -> Result<bool, InputError>;
    fn read(&mut self) -> Result<Event, InputError>;
}

#[derive(Debug, Default)]
pub struct CrosstermInput;

impl CrosstermInput {
    pub fn new() -> Self {
        Self
    }
    pub fn enable_raw_mode(&self) -> Result<(), InputError> {
        enable_raw_mode().map_err(InputError::from)
    }
    pub fn disable_raw_mode(&self) -> Result<(), InputError> {
        disable_raw_mode().map_err(InputError::from)
    }
    pub fn enable_mouse_capture(&self) -> Result<(), InputError> {
        execute!(io::stdout(), EnableMouseCapture).map_err(InputError::from)
    }
    pub fn disable_mouse_capture(&self) -> Result<(), InputError> {
        execute!(io::stdout(), DisableMouseCapture).map_err(InputError::from)
    }
    pub fn enable_bracketed_paste(&self) -> Result<(), InputError> {
        execute!(io::stdout(), EnableBracketedPaste).map_err(InputError::from)
    }
    pub fn disable_bracketed_paste(&self) -> Result<(), InputError> {
        execute!(io::stdout(), DisableBracketedPaste).map_err(InputError::from)
    }
    pub fn enable_focus_change(&self) -> Result<(), InputError> {
        execute!(io::stdout(), EnableFocusChange).map_err(InputError::from)
    }
    pub fn disable_focus_change(&self) -> Result<(), InputError> {
        execute!(io::stdout(), DisableFocusChange).map_err(InputError::from)
    }
}

impl EventSource for CrosstermInput {
    fn poll(&mut self, timeout: Duration) -> Result<bool, InputError> {
        Ok(event::poll(timeout)?)
    }
    fn read(&mut self) -> Result<Event, InputError> {
        Ok(convert(event::read()?))
    }
}

fn convert(value: event::Event) -> Event {
    match value {
        event::Event::Key(key) => Event::Key(
            KeyEvent::new(convert_key_code(key.code), modifiers(key.modifiers)).with_kind(
                match key.kind {
                    event::KeyEventKind::Press => KeyEventKind::Press,
                    event::KeyEventKind::Repeat => KeyEventKind::Repeat,
                    event::KeyEventKind::Release => KeyEventKind::Release,
                },
            ),
        ),
        event::Event::Mouse(mouse) => Event::Mouse(
            MouseEvent::new(
                Point::new(mouse.column, mouse.row),
                convert_mouse_kind(mouse.kind),
                modifiers(mouse.modifiers),
            )
            .with_delta(mouse_delta(mouse.kind).0, mouse_delta(mouse.kind).1),
        ),
        event::Event::Resize(width, height) => Event::Resize(Size::new(width, height)),
        event::Event::Paste(text) => Event::Paste(text),
        event::Event::FocusGained => Event::FocusGained,
        event::Event::FocusLost => Event::FocusLost,
    }
}

fn modifiers(value: event::KeyModifiers) -> Modifiers {
    let mut result = Modifiers::empty();
    if value.contains(event::KeyModifiers::SHIFT) {
        result |= Modifiers::SHIFT;
    }
    if value.contains(event::KeyModifiers::CONTROL) {
        result |= Modifiers::CONTROL;
    }
    if value.contains(event::KeyModifiers::ALT) {
        result |= Modifiers::ALT;
    }
    if value.contains(event::KeyModifiers::SUPER) {
        result |= Modifiers::SUPER;
    }
    result
}

fn convert_key_code(value: event::KeyCode) -> KeyCode {
    match value {
        event::KeyCode::Char(value) => KeyCode::Char(value),
        event::KeyCode::Enter => KeyCode::Enter,
        event::KeyCode::Esc => KeyCode::Escape,
        event::KeyCode::Backspace => KeyCode::Backspace,
        event::KeyCode::Tab => KeyCode::Tab,
        event::KeyCode::Left => KeyCode::Left,
        event::KeyCode::Right => KeyCode::Right,
        event::KeyCode::Up => KeyCode::Up,
        event::KeyCode::Down => KeyCode::Down,
        event::KeyCode::Home => KeyCode::Home,
        event::KeyCode::End => KeyCode::End,
        event::KeyCode::PageUp => KeyCode::PageUp,
        event::KeyCode::PageDown => KeyCode::PageDown,
        event::KeyCode::Insert => KeyCode::Insert,
        event::KeyCode::Delete => KeyCode::Delete,
        event::KeyCode::F(value) => KeyCode::F(value),
        _ => KeyCode::Unknown,
    }
}

fn convert_mouse_kind(value: event::MouseEventKind) -> MouseEventKind {
    match value {
        event::MouseEventKind::Down(button) => MouseEventKind::Press(convert_button(button)),
        event::MouseEventKind::Up(button) => MouseEventKind::Release(convert_button(button)),
        event::MouseEventKind::Drag(button) => MouseEventKind::Drag(convert_button(button)),
        event::MouseEventKind::Moved => MouseEventKind::Move,
        event::MouseEventKind::ScrollUp => MouseEventKind::ScrollUp,
        event::MouseEventKind::ScrollDown => MouseEventKind::ScrollDown,
        event::MouseEventKind::ScrollLeft => MouseEventKind::ScrollLeft,
        event::MouseEventKind::ScrollRight => MouseEventKind::ScrollRight,
    }
}

fn convert_button(value: event::MouseButton) -> MouseButton {
    match value {
        event::MouseButton::Left => MouseButton::Left,
        event::MouseButton::Right => MouseButton::Right,
        event::MouseButton::Middle => MouseButton::Middle,
    }
}

fn mouse_delta(value: event::MouseEventKind) -> (i16, i16) {
    match value {
        event::MouseEventKind::ScrollUp => (0, 1),
        event::MouseEventKind::ScrollDown => (0, -1),
        event::MouseEventKind::ScrollLeft => (-1, 0),
        event::MouseEventKind::ScrollRight => (1, 0),
        _ => (0, 0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_mouse_coordinates_and_modifiers() {
        let event = convert(event::Event::Mouse(event::MouseEvent {
            kind: event::MouseEventKind::Down(event::MouseButton::Left),
            column: 42,
            row: 7,
            modifiers: event::KeyModifiers::SHIFT,
        }));
        assert!(
            matches!(event, Event::Mouse(mouse) if mouse.position() == Point::new(42, 7) && mouse.modifiers().contains(Modifiers::SHIFT))
        );
    }
}
