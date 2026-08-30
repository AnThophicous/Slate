#[non_exhaustive]
#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum Color {
    #[default]
    Default,
    Black,
    Red,
    Green,
    Yellow,
    Blue,
    Magenta,
    Cyan,
    White,
    DarkGrey,
    Ansi(u8),
    Rgb {
        red: u8,
        green: u8,
        blue: u8,
    },
}

impl Color {
    pub const fn ansi(value: u8) -> Self {
        Self::Ansi(value)
    }
    pub const fn rgb(red: u8, green: u8, blue: u8) -> Self {
        Self::Rgb { red, green, blue }
    }
}
