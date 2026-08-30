use crate::{
    Component, Event, EventResult, Frame, KeyCode, KeyEventKind, MouseEventKind, Point, Rect, Style,
};

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
            Event::Key(key) => {
                matches!(key.kind(), KeyEventKind::Press | KeyEventKind::Repeat)
                    && matches!(key.code(), KeyCode::Enter | KeyCode::Char(' '))
            }
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Input {
    value: String,
    placeholder: Option<String>,
    cursor: usize,
    style: Style,
}

impl Input {
    pub fn new(value: impl Into<String>) -> Self {
        let value = value.into();
        let cursor = value.chars().count();
        Self { value, placeholder: None, cursor, style: Style::default() }
    }
    pub fn value(&self) -> &str {
        &self.value
    }
    pub fn set_value(&mut self, value: impl Into<String>) {
        self.value = value.into();
        self.cursor = self.cursor.min(self.value.chars().count());
    }
    pub fn set_placeholder(&mut self, value: impl Into<String>) {
        self.placeholder = Some(value.into());
    }
    pub fn placeholder(&self) -> Option<&str> {
        self.placeholder.as_deref()
    }
    pub fn cursor(&self) -> usize {
        self.cursor
    }
    pub fn set_style(&mut self, style: Style) {
        self.style = style;
    }
}

impl Component for Input {
    fn render(&self, frame: &mut Frame, area: Rect) {
        let text = if self.value.is_empty() {
            self.placeholder.as_deref().unwrap_or("")
        } else {
            &self.value
        };
        frame.write_text(area.origin(), text, self.style);
    }

    fn handle_event(&mut self, event: &Event) -> EventResult {
        match event {
            Event::Paste(text) | Event::Ime(text) => {
                self.insert(text);
                EventResult::Render
            }
            Event::Key(key) if matches!(key.kind(), KeyEventKind::Press | KeyEventKind::Repeat) => {
                match key.code() {
                    KeyCode::Char(value) => {
                        self.insert_char(value);
                        EventResult::Render
                    }
                    KeyCode::Backspace => {
                        if self.cursor == 0 {
                            return EventResult::Consumed;
                        }
                        let mut chars: Vec<char> = self.value.chars().collect();
                        chars.remove(self.cursor - 1);
                        self.cursor -= 1;
                        self.value = chars.into_iter().collect();
                        EventResult::Render
                    }
                    KeyCode::Delete => {
                        let mut chars: Vec<char> = self.value.chars().collect();
                        if self.cursor >= chars.len() {
                            return EventResult::Consumed;
                        }
                        chars.remove(self.cursor);
                        self.value = chars.into_iter().collect();
                        EventResult::Render
                    }
                    KeyCode::Left => {
                        self.cursor = self.cursor.saturating_sub(1);
                        EventResult::Render
                    }
                    KeyCode::Right => {
                        self.cursor = (self.cursor + 1).min(self.value.chars().count());
                        EventResult::Render
                    }
                    KeyCode::Home => {
                        self.cursor = 0;
                        EventResult::Render
                    }
                    KeyCode::End => {
                        self.cursor = self.value.chars().count();
                        EventResult::Render
                    }
                    _ => EventResult::Ignored,
                }
            }
            _ => EventResult::Ignored,
        }
    }
}

impl Input {
    fn insert(&mut self, text: &str) {
        for character in text.chars() {
            self.insert_char(character);
        }
    }

    fn insert_char(&mut self, character: char) {
        let mut chars: Vec<char> = self.value.chars().collect();
        chars.insert(self.cursor, character);
        self.cursor += 1;
        self.value = chars.into_iter().collect();
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Select {
    options: Vec<String>,
    selected: usize,
    style: Style,
}

impl Select {
    pub fn new(options: impl IntoIterator<Item = impl Into<String>>) -> Self {
        Self {
            options: options.into_iter().map(Into::into).collect(),
            selected: 0,
            style: Style::default(),
        }
    }
    pub fn options(&self) -> &[String] {
        &self.options
    }
    pub fn selected(&self) -> usize {
        self.selected
    }
    pub fn set_selected(&mut self, index: usize) {
        self.selected = index.min(self.options.len().saturating_sub(1));
    }
    pub fn set_style(&mut self, style: Style) {
        self.style = style;
    }
}

impl Component for Select {
    fn render(&self, frame: &mut Frame, area: Rect) {
        if let Some(option) = self.options.get(self.selected) {
            frame.write_text(area.origin(), option, self.style);
        }
    }

    fn handle_event(&mut self, event: &Event) -> EventResult {
        let Event::Key(key) = event else { return EventResult::Ignored };
        if !matches!(key.kind(), KeyEventKind::Press | KeyEventKind::Repeat) {
            return EventResult::Ignored;
        }
        let next = match key.code() {
            KeyCode::Up | KeyCode::Left => self.selected.checked_sub(1),
            KeyCode::Down | KeyCode::Right => {
                (self.selected + 1 < self.options.len()).then_some(self.selected + 1)
            }
            _ => None,
        };
        let Some(next) = next else { return EventResult::Consumed };
        self.selected = next;
        EventResult::Render
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Checkbox {
    checked: bool,
    label: String,
    style: Style,
}

impl Checkbox {
    pub fn new(label: impl Into<String>) -> Self {
        Self { checked: false, label: label.into(), style: Style::default() }
    }
    pub const fn checked(&self) -> bool {
        self.checked
    }
    pub fn set_checked(&mut self, value: bool) {
        self.checked = value;
    }
    pub fn label(&self) -> &str {
        &self.label
    }
    pub fn set_style(&mut self, style: Style) {
        self.style = style;
    }
}

impl Component for Checkbox {
    fn render(&self, frame: &mut Frame, area: Rect) {
        let value = if self.checked { "[x] " } else { "[ ] " };
        frame.write_text(area.origin(), &format!("{value}{}", self.label), self.style);
    }

    fn handle_event(&mut self, event: &Event) -> EventResult {
        let activate = match event {
            Event::Key(key) => {
                matches!(key.kind(), KeyEventKind::Press | KeyEventKind::Repeat)
                    && matches!(key.code(), KeyCode::Enter | KeyCode::Char(' '))
            }
            Event::Mouse(mouse) => matches!(mouse.kind(), MouseEventKind::Press(_)),
            _ => false,
        };
        if !activate {
            return EventResult::Ignored;
        }
        self.checked = !self.checked;
        EventResult::Render
    }
}
