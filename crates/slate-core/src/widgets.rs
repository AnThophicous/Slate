use crate::{Component, Event, EventResult, Frame, KeyCode, MouseEventKind, Point, Rect, Style};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextBlock {
    text: String,
    placeholder: Option<String>,
    style: Style,
}

impl TextBlock {
    pub fn new(text: impl Into<String>) -> Self {
        Self { text: text.into(), placeholder: None, style: Style::default() }
    }
    pub fn text(&self) -> &str {
        &self.text
    }
    pub fn set_text(&mut self, text: impl Into<String>) {
        self.text = text.into();
    }
    pub fn placeholder(&self) -> Option<&str> {
        self.placeholder.as_deref()
    }
    pub fn set_placeholder(&mut self, placeholder: impl Into<String>) {
        self.placeholder = Some(placeholder.into());
    }
    pub fn clear_placeholder(&mut self) {
        self.placeholder = None;
    }
    pub fn style(&self) -> Style {
        self.style
    }
    pub fn set_style(&mut self, style: Style) {
        self.style = style;
    }
    pub fn displayed_text(&self) -> &str {
        if self.text.is_empty() { self.placeholder.as_deref().unwrap_or("") } else { &self.text }
    }
}

impl Component for TextBlock {
    fn render(&self, frame: &mut Frame, area: Rect) {
        frame.write_text(Point::new(area.x(), area.y()), self.displayed_text(), self.style);
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Button {
    label: String,
    style: Style,
    active_style: Style,
    pressed: bool,
}

impl Button {
    pub fn new(label: impl Into<String>) -> Self {
        let style = Style::default();
        Self { label: label.into(), style, active_style: style, pressed: false }
    }
    pub fn label(&self) -> &str {
        &self.label
    }
    pub fn set_label(&mut self, label: impl Into<String>) {
        self.label = label.into();
    }
    pub fn style(&self) -> Style {
        self.style
    }
    pub fn set_style(&mut self, style: Style) {
        self.style = style;
    }
    pub fn active_style(&self) -> Style {
        self.active_style
    }
    pub fn set_active_style(&mut self, style: Style) {
        self.active_style = style;
    }
    pub const fn is_pressed(&self) -> bool {
        self.pressed
    }
}

impl Component for Button {
    fn render(&self, frame: &mut Frame, area: Rect) {
        let style = if self.pressed { self.active_style } else { self.style };
        frame.write_text(Point::new(area.x(), area.y()), &self.label, style);
    }

    fn handle_event(&mut self, event: &Event) -> EventResult {
        let activate = match event {
            Event::Key(key) => matches!(key.code(), KeyCode::Enter | KeyCode::Char(' ')),
            Event::Mouse(mouse) => matches!(mouse.kind(), MouseEventKind::Press(_)),
            _ => false,
        };
        if activate {
            self.pressed = !self.pressed;
            EventResult::Render
        } else {
            EventResult::Ignored
        }
    }
}
