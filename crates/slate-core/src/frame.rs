use unicode_width::UnicodeWidthChar;

use crate::{Point, Rect, Size, Style};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Cell {
    symbol: char,
    style: Style,
}

impl Cell {
    pub const fn new(symbol: char, style: Style) -> Self {
        Self { symbol, style }
    }
    pub const fn symbol(self) -> char {
        self.symbol
    }
    pub const fn style(self) -> Style {
        self.style
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
}

impl Frame {
    pub fn new(size: Size) -> Self {
        Self {
            size,
            cells: vec![Cell::default(); usize::from(size.width()) * usize::from(size.height())],
        }
    }
    pub const fn size(&self) -> Size {
        self.size
    }
    pub const fn area(&self) -> Rect {
        Rect::new(0, 0, self.size.width(), self.size.height())
    }
    pub fn clear(&mut self, style: Style) {
        self.cells.fill(Cell::new(' ', style));
    }
    pub fn cells(&self) -> &[Cell] {
        &self.cells
    }
    pub fn cells_mut(&mut self) -> &mut [Cell] {
        &mut self.cells
    }

    pub fn set(&mut self, point: Point, cell: Cell) -> bool {
        self.index(point).map(|index| self.cells[index] = cell).is_some()
    }

    pub fn get(&self, point: Point) -> Option<Cell> {
        self.index(point).map(|index| self.cells[index])
    }

    pub fn write_text(&mut self, origin: Point, text: &str, style: Style) {
        let mut x = origin.x();
        let mut y = origin.y();
        for character in text.chars() {
            if character == '\n' {
                y = y.saturating_add(1);
                x = origin.x();
                continue;
            }
            if character == '\r' {
                continue;
            }
            let width = UnicodeWidthChar::width(character).unwrap_or(1).max(1) as u16;
            if x.saturating_add(width) > self.size.width() {
                break;
            }
            if y >= self.size.height() {
                break;
            }
            self.set(Point::new(x, y), Cell::new(character, style));
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
