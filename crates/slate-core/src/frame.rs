use std::borrow::Cow;

use unicode_segmentation::UnicodeSegmentation;
use unicode_width::UnicodeWidthStr;

use crate::{Point, Rect, Size, Style};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Cell {
    symbol: char,
    style: Style,
    continuation: bool,
}

impl Cell {
    pub const fn new(symbol: char, style: Style) -> Self {
        Self { symbol, style, continuation: false }
    }
    pub const fn continuation(style: Style) -> Self {
        Self { symbol: ' ', style, continuation: true }
    }
    pub const fn symbol(self) -> char {
        self.symbol
    }
    pub const fn style(self) -> Style {
        self.style
    }
    pub const fn is_continuation(self) -> bool {
        self.continuation
    }
}

impl Default for Cell {
    fn default() -> Self {
        Self::new(' ', Style::default())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Frame {
    size: Size,
    cells: Vec<Cell>,
    graphemes: Vec<String>,
}

impl Frame {
    pub fn new(size: Size) -> Self {
        let area = usize::from(size.width()) * usize::from(size.height());
        Self { size, cells: vec![Cell::default(); area], graphemes: vec![" ".to_owned(); area] }
    }
    pub const fn size(&self) -> Size {
        self.size
    }
    pub const fn area(&self) -> Rect {
        Rect::new(0, 0, self.size.width(), self.size.height())
    }
    pub fn clear(&mut self, style: Style) {
        self.cells.fill(Cell::new(' ', style));
        self.graphemes.fill(" ".to_owned());
    }
    pub fn cells(&self) -> &[Cell] {
        &self.cells
    }
    pub fn cells_mut(&mut self) -> &mut [Cell] {
        &mut self.cells
    }

    pub fn set(&mut self, point: Point, cell: Cell) -> bool {
        let Some(index) = self.index(point) else { return false };
        self.cells[index] = cell;
        self.graphemes[index] =
            if cell.is_continuation() { String::new() } else { cell.symbol().to_string() };
        true
    }

    pub fn get(&self, point: Point) -> Option<Cell> {
        self.index(point).map(|index| self.cells[index])
    }

    /// Returns the complete grapheme stored at a cell's leading position.
    /// Continuation cells return an empty string.
    pub fn grapheme(&self, point: Point) -> Option<Cow<'_, str>> {
        let index = self.index(point)?;
        let cell = self.cells[index];
        if cell.is_continuation() {
            return Some(Cow::Borrowed(""));
        }
        let grapheme = &self.graphemes[index];
        if grapheme.starts_with(cell.symbol()) {
            Some(Cow::Borrowed(grapheme))
        } else {
            Some(Cow::Owned(cell.symbol().to_string()))
        }
    }

    /// Writes one complete grapheme and reserves all of its terminal cells.
    pub fn set_grapheme(&mut self, point: Point, grapheme: &str, style: Style) -> bool {
        let Some(character) = grapheme.chars().next() else { return false };
        let width = UnicodeWidthStr::width(grapheme).max(1) as u16;
        if point.x().saturating_add(width) > self.size.width() {
            return false;
        }
        let Some(index) = self.index(point) else { return false };
        self.cells[index] = Cell::new(character, style);
        self.graphemes[index] = grapheme.to_owned();
        for offset in 1..width {
            let continuation = Point::new(point.x().saturating_add(offset), point.y());
            let Some(continuation_index) = self.index(continuation) else { return false };
            self.cells[continuation_index] = Cell::continuation(style);
            self.graphemes[continuation_index].clear();
        }
        if width == 1 {
            let next = Point::new(point.x().saturating_add(1), point.y());
            if self.get(next).is_some_and(Cell::is_continuation) {
                self.set(next, Cell::default());
            }
        }
        true
    }

    pub fn write_text(&mut self, origin: Point, text: &str, style: Style) {
        // Text is data, never terminal control. Keep line breaks but prevent a
        // caller-provided ESC/C1 byte from escaping into the ANSI renderer.
        let sanitized = sanitize_terminal_text(text);
        let mut x = origin.x();
        let mut y = origin.y();
        for grapheme in sanitized.graphemes(true) {
            if grapheme == "\n" {
                y = y.saturating_add(1);
                x = origin.x();
                continue;
            }
            if grapheme == "\r" {
                continue;
            }
            if grapheme.is_empty() {
                continue;
            }
            let width = UnicodeWidthStr::width(grapheme).max(1) as u16;
            if x.saturating_add(width) > self.size.width() && x != origin.x() {
                y = y.saturating_add(1);
                x = origin.x();
            }
            if x.saturating_add(width) > self.size.width() {
                break;
            }
            if y >= self.size.height() {
                break;
            }
            if width == 1
                && x.saturating_add(1) < self.size.width()
                && self.get(Point::new(x.saturating_add(1), y)).is_some_and(Cell::is_continuation)
            {
                self.set(Point::new(x.saturating_add(1), y), Cell::default());
            }
            self.set_grapheme(Point::new(x, y), grapheme, style);
            x = x.saturating_add(width);
        }
    }

    fn index(&self, point: Point) -> Option<usize> {
        if point.x() >= self.size.width() || point.y() >= self.size.height() {
            return None;
        }
        Some(usize::from(point.y()) * usize::from(self.size.width()) + usize::from(point.x()))
    }
}

fn sanitize_terminal_text(text: &str) -> String {
    let mut sanitized = String::with_capacity(text.len());
    let mut characters = text.chars().peekable();
    while let Some(character) = characters.next() {
        match character {
            '\u{1b}' => match characters.peek().copied() {
                Some('[') => {
                    characters.next();
                    consume_csi(&mut characters);
                }
                Some(']') => {
                    characters.next();
                    consume_osc(&mut characters);
                }
                _ => {}
            },
            '\u{9b}' => consume_csi(&mut characters),
            '\u{9d}' => consume_osc(&mut characters),
            '\n' => sanitized.push('\n'),
            '\t' => sanitized.push(' '),
            '\u{0}'..='\u{8}' | '\u{b}'..='\u{1f}' | '\u{7f}'..='\u{9f}' => {}
            _ => sanitized.push(character),
        }
    }
    sanitized
}

fn consume_csi<I>(characters: &mut std::iter::Peekable<I>)
where
    I: Iterator<Item = char>,
{
    for character in characters {
        if ('@'..='~').contains(&character) {
            break;
        }
    }
}

fn consume_osc<I>(characters: &mut std::iter::Peekable<I>)
where
    I: Iterator<Item = char>,
{
    while let Some(character) = characters.next() {
        if character == '\u{7}' {
            break;
        }
        if character == '\u{1b}' && characters.peek().copied() == Some('\\') {
            characters.next();
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_complete_graphemes() {
        let mut frame = Frame::new(Size::new(4, 1));
        frame.write_text(Point::new(0, 0), "a👩‍💻b", Style::default());
        assert_eq!(frame.grapheme(Point::new(1, 0)).expect("grapheme").as_ref(), "👩‍💻");
        assert!(frame.get(Point::new(2, 0)).expect("cell").is_continuation());
    }

    #[test]
    fn wraps_and_preserves_explicit_newlines() {
        let mut frame = Frame::new(Size::new(3, 3));
        frame.write_text(Point::new(0, 0), "abcd\nef", Style::default());
        assert_eq!(frame.get(Point::new(0, 0)).expect("cell").symbol(), 'a');
        assert_eq!(frame.get(Point::new(2, 0)).expect("cell").symbol(), 'c');
        assert_eq!(frame.get(Point::new(0, 1)).expect("cell").symbol(), 'd');
        assert_eq!(frame.get(Point::new(0, 2)).expect("cell").symbol(), 'e');
        assert_eq!(frame.get(Point::new(1, 2)).expect("cell").symbol(), 'f');
    }

    #[test]
    fn removes_terminal_control_bytes_from_text() {
        let mut frame = Frame::new(Size::new(8, 1));
        frame.write_text(Point::new(0, 0), "safe\x1b[31mtext", Style::default());
        let value = (0..8).filter_map(|x| frame.grapheme(Point::new(x, 0))).collect::<String>();
        assert_eq!(value, "safetext");
        assert!(!value.contains('\x1b'));
    }

    #[test]
    fn removes_osc_sequences_without_dropping_following_text() {
        let mut frame = Frame::new(Size::new(6, 1));
        frame.write_text(Point::new(0, 0), "a\x1b]0;title\x07bc", Style::default());
        let value = (0..6).filter_map(|x| frame.grapheme(Point::new(x, 0))).collect::<String>();
        assert_eq!(value, "abc");
    }
}
