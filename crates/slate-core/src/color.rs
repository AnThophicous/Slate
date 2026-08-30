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
    pub fn from_hex(value: &str) -> Result<Self, HexColorError> {
        let (has_prefix, value) = match value.strip_prefix('#') {
            Some(value) => (true, value),
            None => (false, value),
        };
        if !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(HexColorError);
        }
        let value = match value.len() {
            3 if has_prefix => {
                value.chars().flat_map(|character| [character, character]).collect::<String>()
            }
            6 => value.to_owned(),
            _ => return Err(HexColorError),
        };
        let red = u8::from_str_radix(&value[0..2], 16).map_err(|_| HexColorError)?;
        let green = u8::from_str_radix(&value[2..4], 16).map_err(|_| HexColorError)?;
        let blue = u8::from_str_radix(&value[4..6], 16).map_err(|_| HexColorError)?;
        Ok(Self::rgb(red, green, blue))
    }
    pub const fn rgb_components(self) -> Option<(u8, u8, u8)> {
        match self {
            Self::Rgb { red, green, blue } => Some((red, green, blue)),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct HexColorError;
