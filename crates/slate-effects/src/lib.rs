use std::time::Duration;

use slate_core::{Cell, Color, Frame, Point, Rect};

pub trait Effect {
    fn apply_at(&self, frame: &mut Frame, elapsed: Duration);
}

pub struct EffectStack {
    effects: Vec<Box<dyn Effect>>,
}

impl EffectStack {
    pub fn new() -> Self {
        Self { effects: Vec::new() }
    }
    pub fn push(&mut self, effect: impl Effect + 'static) {
        self.effects.push(Box::new(effect));
    }
    pub fn len(&self) -> usize {
        self.effects.len()
    }
    pub fn is_empty(&self) -> bool {
        self.effects.is_empty()
    }
    pub fn render(&self, base: &Frame, elapsed: Duration) -> Frame {
        let mut frame = base.clone();
        self.apply_at(&mut frame, elapsed);
        frame
    }
    pub fn apply_at(&self, frame: &mut Frame, elapsed: Duration) {
        for effect in &self.effects {
            effect.apply_at(frame, elapsed);
        }
    }
}

impl Default for EffectStack {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Glow {
    color: Color,
    radius: u16,
    intensity: u8,
    period: Duration,
    bounds: Option<Rect>,
}

impl Glow {
    pub fn from_hex(value: &str) -> Result<Self, slate_core::HexColorError> {
        Ok(Self {
            color: Color::from_hex(value)?,
            radius: 1,
            intensity: 96,
            period: Duration::from_millis(700),
            bounds: None,
        })
    }
    pub const fn radius(mut self, radius: u16) -> Self {
        self.radius = radius;
        self
    }
    pub const fn intensity(mut self, intensity: u8) -> Self {
        self.intensity = intensity;
        self
    }
    pub const fn bounds(mut self, bounds: Rect) -> Self {
        self.bounds = Some(bounds);
        self
    }
    pub const fn color(self) -> Color {
        self.color
    }
    pub const fn period(self) -> Duration {
        self.period
    }
    pub fn period_duration(mut self, period: Duration) -> Self {
        self.period = period.max(Duration::from_millis(1));
        self
    }
    pub fn apply(&self, frame: &mut Frame) {
        self.apply_at(frame, Duration::ZERO);
    }
    fn amount(&self, point: Point, elapsed: Duration) -> u8 {
        let period = self.period.as_secs_f32().max(0.001);
        let phase = (elapsed.as_secs_f32() / period) * std::f32::consts::TAU;
        let wave =
            (((point.x() as f32 * 0.42 + point.y() as f32 * 0.18) - phase).sin() + 1.0) * 0.5;
        (f32::from(self.intensity) * (0.28 + wave * 0.72)).round() as u8
    }
}

impl Effect for Glow {
    fn apply_at(&self, frame: &mut Frame, elapsed: Duration) {
        let original = frame.clone();
        if !original.cells().iter().any(|cell| cell.symbol() != ' ') {
            return;
        }
        let area = self.bounds.unwrap_or(frame.area());
        let end_y = area.y().saturating_add(area.height()).min(frame.size().height());
        let end_x = area.x().saturating_add(area.width()).min(frame.size().width());
        for y in area.y()..end_y {
            for x in area.x()..end_x {
                let point = Point::new(x, y);
                let source = original.get(point).expect("point is in frame");
                if source.symbol() != ' ' {
                    let style = source.style().foreground(mix(
                        source.style().foreground_color(),
                        self.color,
                        self.amount(point, elapsed),
                    ));
                    frame.set(point, Cell::new(source.symbol(), style));
                    continue;
                }
                let radius = self.radius.min(frame.size().width().max(frame.size().height()));
                let start_x = x.saturating_sub(radius);
                let end_x = x.saturating_add(radius.saturating_add(1)).min(frame.size().width());
                let start_y = y.saturating_sub(radius);
                let end_y = y.saturating_add(radius.saturating_add(1)).min(frame.size().height());
                let mut distance = radius.saturating_add(1);
                for candidate_y in start_y..end_y {
                    for candidate_x in start_x..end_x {
                        if original
                            .get(Point::new(candidate_x, candidate_y))
                            .is_some_and(|cell| cell.symbol() != ' ')
                        {
                            distance =
                                distance.min(x.abs_diff(candidate_x).max(y.abs_diff(candidate_y)));
                        }
                    }
                }
                if distance <= radius {
                    let falloff = ((radius.saturating_add(1).saturating_sub(distance) as u32
                        * u32::from(self.amount(point, elapsed)))
                        / u32::from(radius.saturating_add(1)))
                    .min(255) as u8;
                    let style = source.style().background(mix(
                        source.style().background_color(),
                        self.color,
                        falloff,
                    ));
                    frame.set(point, Cell::new(' ', style));
                }
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ColorShift {
    from: Color,
    to: Color,
    period: Duration,
    bounds: Option<Rect>,
}

impl ColorShift {
    pub fn from_hex(from: &str, to: &str) -> Result<Self, slate_core::HexColorError> {
        Ok(Self {
            from: Color::from_hex(from)?,
            to: Color::from_hex(to)?,
            period: Duration::from_millis(900),
            bounds: None,
        })
    }
    pub const fn period(self) -> Duration {
        self.period
    }
    pub const fn bounds(mut self, bounds: Rect) -> Self {
        self.bounds = Some(bounds);
        self
    }
    pub fn period_duration(mut self, period: Duration) -> Self {
        self.period = period.max(Duration::from_millis(1));
        self
    }
    pub fn apply(&self, frame: &mut Frame) {
        self.apply_at(frame, Duration::ZERO);
    }
}

impl Effect for ColorShift {
    fn apply_at(&self, frame: &mut Frame, elapsed: Duration) {
        let period = self.period.as_secs_f32().max(0.001);
        let phase = (elapsed.as_secs_f32() / period).fract();
        let amount = (phase * std::f32::consts::TAU).sin() * 0.5 + 0.5;
        let area = self.bounds.unwrap_or(frame.area());
        let end_y = area.y().saturating_add(area.height()).min(frame.size().height());
        let end_x = area.x().saturating_add(area.width()).min(frame.size().width());
        for y in area.y()..end_y {
            for x in area.x()..end_x {
                let point = Point::new(x, y);
                if let Some(cell) = frame.get(point).filter(|cell| cell.symbol() != ' ') {
                    frame.set(
                        point,
                        Cell::new(
                            cell.symbol(),
                            cell.style().foreground(interpolate(self.from, self.to, amount)),
                        ),
                    );
                }
            }
        }
    }
}

fn mix(base: Color, overlay: Color, amount: u8) -> Color {
    let (base_red, base_green, base_blue) = base.rgb_components().unwrap_or((255, 255, 255));
    let Some((over_red, over_green, over_blue)) = overlay.rgb_components() else { return base };
    interpolate(
        Color::rgb(base_red, base_green, base_blue),
        Color::rgb(over_red, over_green, over_blue),
        f32::from(amount) / 255.0,
    )
}

fn interpolate(from: Color, to: Color, amount: f32) -> Color {
    let Some((from_red, from_green, from_blue)) = from.rgb_components() else { return to };
    let Some((to_red, to_green, to_blue)) = to.rgb_components() else { return from };
    let amount = amount.clamp(0.0, 1.0);
    Color::rgb(
        (f32::from(from_red) + (f32::from(to_red) - f32::from(from_red)) * amount).round() as u8,
        (f32::from(from_green) + (f32::from(to_green) - f32::from(from_green)) * amount).round()
            as u8,
        (f32::from(from_blue) + (f32::from(to_blue) - f32::from(from_blue)) * amount).round() as u8,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use slate_core::{Size, Style};

    #[test]
    fn parses_short_and_long_hex_colors() {
        assert_eq!(Color::from_hex("#abc").unwrap(), Color::rgb(170, 187, 204));
        assert_eq!(Glow::from_hex("#12aBc0").unwrap().color(), Color::rgb(18, 171, 192));
        assert!(Glow::from_hex("bad").is_err());
    }

    #[test]
    fn glow_is_temporal_and_changes_glyph_color() {
        let mut first = Frame::new(Size::new(3, 1));
        let mut second = first.clone();
        first.write_text(
            Point::new(1, 0),
            "X",
            Style::default().foreground(Color::rgb(10, 10, 10)),
        );
        second.write_text(
            Point::new(1, 0),
            "X",
            Style::default().foreground(Color::rgb(10, 10, 10)),
        );
        let effect = Glow::from_hex("ff0000").unwrap();
        effect.apply_at(&mut first, Duration::ZERO);
        effect.apply_at(&mut second, Duration::from_millis(350));
        assert_ne!(first.get(Point::new(1, 0)), second.get(Point::new(1, 0)));
    }

    #[test]
    fn color_shift_changes_foreground() {
        let mut frame = Frame::new(Size::new(1, 1));
        frame.write_text(Point::new(0, 0), "X", Style::default());
        ColorShift::from_hex("#000000", "#ffffff").unwrap().apply(&mut frame);
        assert_ne!(frame.get(Point::new(0, 0)).unwrap().style().foreground_color(), Color::Default);
    }
}
