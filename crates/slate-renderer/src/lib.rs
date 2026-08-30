use slate_core::{Attributes, Color, Frame, Point, Style};
use std::io::{self, Write};
use std::time::{Duration, Instant};
use unicode_width::UnicodeWidthChar;

pub trait Renderer {
    fn render(&mut self, frame: &Frame) -> io::Result<()>;
    fn finish(&mut self) -> io::Result<()>;
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RenderStats {
    rendered_frames: u64,
    duplicate_frames: u64,
    throttled_frames: u64,
}

impl RenderStats {
    pub const fn rendered_frames(self) -> u64 {
        self.rendered_frames
    }
    pub const fn duplicate_frames(self) -> u64 {
        self.duplicate_frames
    }
    pub const fn throttled_frames(self) -> u64 {
        self.throttled_frames
    }
    pub const fn skipped_frames(self) -> u64 {
        self.duplicate_frames + self.throttled_frames
    }
}

pub struct AnsiRenderer<W> {
    writer: W,
    clear_before_render: bool,
    last_frame: Option<Frame>,
    throttle: Option<Duration>,
    last_render: Option<Instant>,
    stats: RenderStats,
}

impl<W: Write> AnsiRenderer<W> {
    pub fn new(writer: W) -> Self {
        Self {
            writer,
            clear_before_render: true,
            last_frame: None,
            throttle: None,
            last_render: None,
            stats: RenderStats::default(),
        }
    }
    pub fn clear_before_render(mut self, value: bool) -> Self {
        self.clear_before_render = value;
        self
    }
    pub fn into_inner(self) -> W {
        self.writer
    }
    pub fn throttle(mut self, interval: Duration) -> Self {
        self.throttle = (interval > Duration::ZERO).then_some(interval);
        self
    }
    pub fn max_fps(self, fps: u32) -> Self {
        if fps == 0 {
            self.throttle(Duration::ZERO)
        } else {
            self.throttle(Duration::from_secs_f64(1.0 / f64::from(fps)))
        }
    }
    pub fn stats(&self) -> RenderStats {
        self.stats
    }
    pub fn rendered_frames(&self) -> u64 {
        self.stats.rendered_frames()
    }
    pub fn skipped_frames(&self) -> u64 {
        self.stats.skipped_frames()
    }
    pub fn duplicate_frames(&self) -> u64 {
        self.stats.duplicate_frames()
    }
    pub fn throttled_frames(&self) -> u64 {
        self.stats.throttled_frames()
    }
    pub fn render_at(&mut self, frame: &Frame, now: Instant) -> io::Result<()> {
        if self.last_frame.as_ref() == Some(frame) {
            self.stats.duplicate_frames += 1;
            return Ok(());
        }
        if self.throttle.is_some_and(|interval| {
            self.last_render
                .and_then(|last| now.checked_duration_since(last))
                .is_some_and(|elapsed| elapsed < interval)
        }) {
            self.stats.throttled_frames += 1;
            return Ok(());
        }
        let full = self.last_frame.as_ref().is_none_or(|previous| previous.size() != frame.size());
        if full {
            self.render_full(frame)?;
        } else {
            self.render_delta(frame)?;
        }
        self.writer.flush()?;
        self.last_frame = Some(frame.clone());
        self.last_render = Some(now);
        self.stats.rendered_frames += 1;
        Ok(())
    }
    fn render_full(&mut self, frame: &Frame) -> io::Result<()> {
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
                if cell.is_continuation() {
                    x += 1;
                    continue;
                }
                write_style_if_changed(&mut self.writer, &mut previous_style, cell.style())?;
                write!(self.writer, "{}", cell.symbol())?;
                x = x.saturating_add(cell_width(cell.symbol()));
            }
        }
        write!(self.writer, "\x1b[0m")
    }
    fn render_delta(&mut self, frame: &Frame) -> io::Result<()> {
        let previous = self.last_frame.as_ref().expect("delta render requires a previous frame");
        for y in 0..frame.size().height() {
            for x in 0..frame.size().width() {
                let point = Point::new(x, y);
                let current = frame.get(point).expect("frame coordinates are valid");
                let old = previous.get(point).expect("frame coordinates are valid");
                if current == old || current.is_continuation() {
                    continue;
                }
                write!(
                    self.writer,
                    "\x1b[{};{}H{}{}",
                    y + 1,
                    x + 1,
                    style_to_ansi(current.style()),
                    current.symbol()
                )?;
            }
        }
        write!(self.writer, "\x1b[0m")
    }
}

impl<W: Write> Renderer for AnsiRenderer<W> {
    fn render(&mut self, frame: &Frame) -> io::Result<()> {
        self.render_at(frame, Instant::now())
    }
    fn finish(&mut self) -> io::Result<()> {
        write!(self.writer, "\x1b[0m\x1b[?25h")?;
        self.writer.flush()
    }
}

fn write_style_if_changed<W: Write>(
    writer: &mut W,
    previous: &mut Option<Style>,
    style: Style,
) -> io::Result<()> {
    if *previous != Some(style) {
        write!(writer, "{}", style_to_ansi(style))?;
        *previous = Some(style);
    }
    Ok(())
}

fn cell_width(symbol: char) -> u16 {
    UnicodeWidthChar::width(symbol).unwrap_or(1).max(1) as u16
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
    fn renders_utf8_as_ansi() {
        let mut frame = Frame::new(Size::new(8, 1));
        frame.write_text(Point::new(0, 0), "Olá", Style::default());
        let output = render_to_ansi(&frame);
        assert!(output.contains("Olá"));
    }

    #[test]
    fn skips_duplicate_frames() {
        let frame = Frame::new(Size::new(1, 1));
        let mut renderer = AnsiRenderer::new(Vec::new());
        renderer.render(&frame).unwrap();
        renderer.render(&frame).unwrap();
        assert_eq!(renderer.rendered_frames(), 1);
        assert_eq!(renderer.duplicate_frames(), 1);
    }

    #[test]
    fn emits_delta_for_changed_frame() {
        let mut first = Frame::new(Size::new(1, 1));
        let mut second = first.clone();
        first.write_text(Point::new(0, 0), "A", Style::default());
        second.write_text(Point::new(0, 0), "B", Style::default());
        let mut renderer = AnsiRenderer::new(Vec::new()).throttle(Duration::ZERO);
        renderer.render(&first).unwrap();
        let before = renderer.rendered_frames();
        renderer.render(&second).unwrap();
        assert_eq!(renderer.rendered_frames(), before + 1);
    }

    #[test]
    fn throttles_without_sleeping() {
        let mut first = Frame::new(Size::new(1, 1));
        let mut second = first.clone();
        first.write_text(Point::new(0, 0), "A", Style::default());
        second.write_text(Point::new(0, 0), "B", Style::default());
        let now = Instant::now();
        let mut renderer = AnsiRenderer::new(Vec::new()).throttle(Duration::from_secs(1));
        renderer.render_at(&first, now).unwrap();
        renderer.render_at(&second, now + Duration::from_millis(1)).unwrap();
        assert_eq!(renderer.rendered_frames(), 1);
        assert_eq!(renderer.throttled_frames(), 1);
    }
}
