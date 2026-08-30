use bitflags::bitflags;

bitflags! {
    #[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
    pub struct Attributes: u16 {
        const BOLD = 1 << 0;
        const DIM = 1 << 1;
        const ITALIC = 1 << 2;
        const UNDERLINED = 1 << 3;
        const REVERSED = 1 << 4;
        const HIDDEN = 1 << 5;
        const CROSSED_OUT = 1 << 6;
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct Style {
    foreground: crate::Color,
    background: crate::Color,
    attributes: Attributes,
}

impl Style {
    pub const fn new() -> Self {
        Self {
            foreground: crate::Color::Default,
            background: crate::Color::Default,
            attributes: Attributes::empty(),
        }
    }

    pub const fn foreground(self, color: crate::Color) -> Self {
        Self { foreground: color, ..self }
    }
    pub const fn background(self, color: crate::Color) -> Self {
        Self { background: color, ..self }
    }
    pub const fn with_attributes(self, attributes: Attributes) -> Self {
        Self { attributes, ..self }
    }
    pub const fn foreground_color(self) -> crate::Color {
        self.foreground
    }
    pub const fn background_color(self) -> crate::Color {
        self.background
    }
    pub const fn attributes(self) -> Attributes {
        self.attributes
    }
}

impl Default for Style {
    fn default() -> Self {
        Self::new()
    }
}
