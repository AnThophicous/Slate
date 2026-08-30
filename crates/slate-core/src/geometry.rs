#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub struct Point {
    x: u16,
    y: u16,
}

impl Point {
    pub const fn new(x: u16, y: u16) -> Self {
        Self { x, y }
    }
    pub const fn x(self) -> u16 {
        self.x
    }
    pub const fn y(self) -> u16 {
        self.y
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub struct Size {
    width: u16,
    height: u16,
}

impl Size {
    pub const fn new(width: u16, height: u16) -> Self {
        Self { width, height }
    }
    pub const fn width(self) -> u16 {
        self.width
    }
    pub const fn height(self) -> u16 {
        self.height
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub struct Rect {
    origin: Point,
    size: Size,
}

impl Rect {
    pub const fn new(x: u16, y: u16, width: u16, height: u16) -> Self {
        Self { origin: Point::new(x, y), size: Size::new(width, height) }
    }

    pub const fn origin(self) -> Point {
        self.origin
    }
    pub const fn size(self) -> Size {
        self.size
    }
    pub const fn x(self) -> u16 {
        self.origin.x()
    }
    pub const fn y(self) -> u16 {
        self.origin.y()
    }
    pub const fn width(self) -> u16 {
        self.size.width()
    }
    pub const fn height(self) -> u16 {
        self.size.height()
    }

    pub fn contains(self, point: Point) -> bool {
        point.x() >= self.x()
            && point.y() >= self.y()
            && point.x() < self.x().saturating_add(self.width())
            && point.y() < self.y().saturating_add(self.height())
    }
}
