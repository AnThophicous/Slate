use slate_core::{Attributes, Color, Frame, Point, Style};
use std::io::{self, Write};
use unicode_width::UnicodeWidthChar;

pub trait Renderer {
    fn render(&mut self, frame: &Frame) -> io::Result<()>;
    fn finish(&mut self) -> io::Result<()>;
}

pub struct AnsiRenderer<W> {
    writer: W,
    clear_before_render: bool,
}

impl<W: Write> AnsiRenderer<W> {
    pub fn new(writer: W) -> Self {
        Self { writer, clear_before_render: true }
    }
    pub fn clear_before_render(mut self, value: bool) -> Self {
        self.clear_before_render = value;
        self
    }
    pub fn into_inner(self) -> W {
        self.writer
    }
}

impl<W: Write> Renderer for AnsiRenderer<W> {
    fn render(&mut self, frame: &Frame) -> io::Result<()> {
        if self.clear_before_render {
            write!(self.writer, "\x1b[2J")?;
        }
        write!(self.writer, "\x1b[H\x1b[?25l")?;
        let mut previous_style = None;
        for y in 0..frame.size().height() {
            write!(self.writer, "\x1b[{};1H", y + 1)?;
            let mut x = 0;
            while x < frame.size().width() {
                let cell = frame.get(Point::new(x, y)).expect("frame coordinates are valid");
                if previous_style != Some(cell.style()) {
                    write!(self.writer, "{}", style_to_ansi(cell.style()))?;
                    previous_style = Some(cell.style());
                }
                write!(self.writer, "{}", cell.symbol())?;
                x = x.saturating_add(
                    UnicodeWidthChar::width(cell.symbol()).unwrap_or(1).max(1) as u16
                );
            }
        }
        write!(self.writer, "\x1b[0m")?;
        self.writer.flush()
    }

    fn finish(&mut self) -> io::Result<()> {
        write!(self.writer, "\x1b[0m\x1b[?25h")?;
        self.writer.flush()
    }
}

pub fn render_to_ansi(frame: &Frame) -> String {
    let mut renderer = AnsiRenderer::new(Vec::new());
    renderer.render(frame).expect("Vec cannot fail");
    String::from_utf8(renderer.into_inner()).expect("ANSI output is UTF-8")
}

pub fn style_to_ansi(style: Style) -> String {
    let mut codes = vec!["0".to_owned()];
    let attrs = style.attributes();
    for (flag, code) in [
        (Attributes::BOLD, "1"),
        (Attributes::DIM, "2"),
        (Attributes::ITALIC, "3"),
        (Attributes::UNDERLINED, "4"),
        (Attributes::REVERSED, "7"),
        (Attributes::HIDDEN, "8"),
        (Attributes::CROSSED_OUT, "9"),
    ] {
        if attrs.contains(flag) {
            codes.push(code.to_owned());
        }
    }
    codes.push(color_code(style.foreground_color(), false));
    codes.push(color_code(style.background_color(), true));
    format!("\x1b[{}m", codes.join(";"))
}

fn color_code(color: Color, background: bool) -> String {
    let offset = if background { 10 } else { 0 };
    match color {
        Color::Default => {
            if background {
                "49".into()
            } else {
                "39".into()
            }
        }
        Color::Black => (30 + offset).to_string(),
        Color::Red => (31 + offset).to_string(),
        Color::Green => (32 + offset).to_string(),
        Color::Yellow => (33 + offset).to_string(),
        Color::Blue => (34 + offset).to_string(),
        Color::Magenta => (35 + offset).to_string(),
        Color::Cyan => (36 + offset).to_string(),
        Color::White => (37 + offset).to_string(),
        Color::DarkGrey => (90 + if background { 10 } else { 0 }).to_string(),
        Color::Ansi(value) => format!("{};5;{}", if background { 48 } else { 38 }, value),
        Color::Rgb { red, green, blue } => {
            format!("{};2;{};{};{}", if background { 48 } else { 38 }, red, green, blue)
        }
        _ => {
            if background {
                "49".into()
            } else {
                "39".into()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use slate_core::{Size, Style};

    #[test]
    fn renders_plain_text_as_ansi() {
        let mut frame = Frame::new(Size::new(5, 1));
        frame.write_text(Point::new(0, 0), "Slate", Style::default());
        let output = render_to_ansi(&frame);
        assert!(output.contains('S'));
        assert!(output.contains('e'));
    }
}
