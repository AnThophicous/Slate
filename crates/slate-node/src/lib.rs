use std::time::Duration;

use napi::bindgen_prelude::Result;
use napi_derive::napi;
use slate_core::{Color, Event, Frame, KeyCode, Point, Size, Style};
use slate_effects::{ColorShift, Effect, Glow};
use slate_input::{CrosstermInput, EventSource};
use slate_renderer::render_to_ansi;
use unicode_width::UnicodeWidthStr;

#[napi(object)]
pub struct RenderOptions {
    pub text: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub x: Option<u32>,
    pub y: Option<u32>,
    pub foreground: Option<String>,
    pub background: Option<String>,
}

#[napi(object)]
pub struct EffectOptions {
    pub text: String,
    pub color: String,
    pub to: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub x: Option<u32>,
    pub y: Option<u32>,
    pub radius: Option<u32>,
    pub intensity: Option<u32>,
    pub elapsed_ms: Option<u32>,
}

#[napi(object)]
pub struct NativeEvent {
    pub kind: String,
    pub code: Option<String>,
    pub text: Option<String>,
    pub modifiers: u32,
    pub x: Option<u32>,
    pub y: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub action: Option<String>,
    pub button: Option<String>,
    pub delta_x: Option<i32>,
    pub delta_y: Option<i32>,
}

#[napi]
pub fn version() -> String {
    slate_core::VERSION.to_owned()
}

#[napi]
pub fn render_text(text: String) -> Result<String> {
    render(RenderOptions {
        text,
        width: None,
        height: None,
        x: None,
        y: None,
        foreground: None,
        background: None,
    })
}

#[napi]
pub fn render(options: RenderOptions) -> Result<String> {
    let x = options.x.unwrap_or(0).min(u16::MAX as u32) as u16;
    let y = options.y.unwrap_or(0).min(u16::MAX as u32) as u16;
    let width = options
        .width
        .unwrap_or_else(|| {
            x as u32 + options.text.lines().map(UnicodeWidthStr::width).max().unwrap_or(1) as u32
        })
        .max(1)
        .min(u16::MAX as u32) as u16;
    let height = options
        .height
        .unwrap_or_else(|| y as u32 + options.text.lines().count().max(1) as u32)
        .max(1)
        .min(u16::MAX as u32) as u16;
    let foreground = parse_color(options.foreground.as_deref())?;
    let background = parse_color(options.background.as_deref())?;
    let mut frame = Frame::new(Size::new(width, height));
    frame.write_text(
        Point::new(x, y),
        &options.text,
        Style::default().foreground(foreground).background(background),
    );
    Ok(render_to_ansi(&frame))
}

#[napi]
pub fn render_glow(options: EffectOptions) -> Result<String> {
    let mut frame = effect_frame(&options)?;
    let mut glow = Glow::from_hex(&options.color)
        .map_err(|_| napi::Error::from_reason("cor do Glow inválida"))?;
    if let Some(radius) = options.radius {
        glow = glow.radius(radius.min(u16::MAX as u32) as u16);
    }
    if let Some(intensity) = options.intensity {
        glow = glow.intensity(intensity.min(u8::MAX as u32) as u8);
    }
    glow.apply_at(&mut frame, Duration::from_millis(options.elapsed_ms.unwrap_or(0).into()));
    Ok(render_to_ansi(&frame))
}

#[napi]
pub fn render_color_shift(options: EffectOptions) -> Result<String> {
    let Some(to) = options.to.as_deref() else {
        return Err(napi::Error::from_reason("ColorShift exige a cor to"));
    };
    let mut frame = effect_frame(&options)?;
    let shift = ColorShift::from_hex(&options.color, to)
        .map_err(|_| napi::Error::from_reason("cor do ColorShift inválida"))?;
    shift.apply_at(&mut frame, Duration::from_millis(options.elapsed_ms.unwrap_or(0).into()));
    Ok(render_to_ansi(&frame))
}

fn effect_frame(options: &EffectOptions) -> Result<Frame> {
    let x = options.x.unwrap_or(0).min(u16::MAX as u32) as u16;
    let y = options.y.unwrap_or(0).min(u16::MAX as u32) as u16;
    let width = options
        .width
        .unwrap_or_else(|| {
            x as u32
                + options.text.lines().map(unicode_width::UnicodeWidthStr::width).max().unwrap_or(1)
                    as u32
        })
        .max(1)
        .min(u16::MAX as u32) as u16;
    let height = options
        .height
        .unwrap_or_else(|| y as u32 + options.text.lines().count().max(1) as u32)
        .max(1)
        .min(u16::MAX as u32) as u16;
    let x = options.x.unwrap_or(0).min(u16::MAX as u32) as u16;
    let y = options.y.unwrap_or(0).min(u16::MAX as u32) as u16;
    let mut frame = Frame::new(Size::new(width, height));
    frame.write_text(Point::new(x, y), &options.text, Style::default());
    Ok(frame)
}

#[napi]
pub fn enable_mouse_capture() -> Result<()> {
    CrosstermInput::new()
        .enable_mouse_capture()
        .map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn disable_mouse_capture() -> Result<()> {
    CrosstermInput::new()
        .disable_mouse_capture()
        .map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn enable_bracketed_paste() -> Result<()> {
    CrosstermInput::new()
        .enable_bracketed_paste()
        .map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn disable_bracketed_paste() -> Result<()> {
    CrosstermInput::new()
        .disable_bracketed_paste()
        .map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn enable_focus_change() -> Result<()> {
    CrosstermInput::new()
        .enable_focus_change()
        .map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn disable_focus_change() -> Result<()> {
    CrosstermInput::new()
        .disable_focus_change()
        .map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn enable_raw_mode() -> Result<()> {
    CrosstermInput::new()
        .enable_raw_mode()
        .map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn disable_raw_mode() -> Result<()> {
    CrosstermInput::new()
        .disable_raw_mode()
        .map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn poll_event(timeout_ms: Option<u32>) -> Result<Option<NativeEvent>> {
    let mut input = CrosstermInput::new();
    let ready = input
        .poll(Duration::from_millis(timeout_ms.unwrap_or(16) as u64))
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    if !ready {
        return Ok(None);
    }
    let event = input.read().map_err(|error| napi::Error::from_reason(error.to_string()))?;
    Ok(Some(NativeEvent::from(event)))
}

fn parse_color(value: Option<&str>) -> Result<Color> {
    let Some(value) = value else { return Ok(Color::Default) };
    if value == "default" {
        return Ok(Color::Default);
    }
    Color::from_hex(value)
        .map_err(|_| napi::Error::from_reason("foreground deve usar #RGB ou #RRGGBB"))
}

impl From<Event> for NativeEvent {
    fn from(event: Event) -> Self {
        let mut result = Self {
            kind: String::new(),
            code: None,
            text: None,
            modifiers: 0,
            x: None,
            y: None,
            width: None,
            height: None,
            action: None,
            button: None,
            delta_x: None,
            delta_y: None,
        };
        match event {
            Event::Key(key) => {
                result.kind = "key".into();
                result.code = Some(key_code(key.code()));
                result.modifiers = key.modifiers().bits().into();
            }
            Event::Mouse(mouse) => {
                result.kind = "mouse".into();
                result.code = Some(format!("{:?}", mouse.kind()));
                result.x = Some(mouse.position().x().into());
                result.y = Some(mouse.position().y().into());
                result.modifiers = mouse.modifiers().bits().into();
                result.action = Some(mouse_action(mouse.kind()).into());
                result.button = mouse_button(mouse.kind()).map(String::from);
                if matches!(
                    mouse.kind(),
                    slate_core::MouseEventKind::ScrollUp
                        | slate_core::MouseEventKind::ScrollDown
                        | slate_core::MouseEventKind::ScrollLeft
                        | slate_core::MouseEventKind::ScrollRight
                ) {
                    result.delta_x = Some(mouse.delta_x().into());
                    result.delta_y = Some(mouse.delta_y().into());
                }
            }
            Event::Resize(size) => {
                result.kind = "resize".into();
                result.width = Some(size.width().into());
                result.height = Some(size.height().into());
            }
            Event::Paste(text) => {
                result.kind = "paste".into();
                result.text = Some(text);
            }
            Event::FocusGained => result.kind = "focusGained".into(),
            Event::FocusLost => result.kind = "focusLost".into(),
            _ => result.kind = "unknown".into(),
        }
        result
    }
}

fn mouse_action(kind: slate_core::MouseEventKind) -> &'static str {
    match kind {
        slate_core::MouseEventKind::Press(_) => "press",
        slate_core::MouseEventKind::Release(_) => "release",
        slate_core::MouseEventKind::Drag(_) => "drag",
        slate_core::MouseEventKind::Move => "move",
        _ => "scroll",
    }
}

fn mouse_button(kind: slate_core::MouseEventKind) -> Option<&'static str> {
    match kind {
        slate_core::MouseEventKind::Press(button)
        | slate_core::MouseEventKind::Release(button)
        | slate_core::MouseEventKind::Drag(button) => Some(match button {
            slate_core::MouseButton::Left => "left",
            slate_core::MouseButton::Right => "right",
            slate_core::MouseButton::Middle => "middle",
            slate_core::MouseButton::Other(_) => "other",
            _ => "other",
        }),
        _ => None,
    }
}

fn key_code(code: KeyCode) -> String {
    match code {
        KeyCode::Char(value) => value.to_string(),
        KeyCode::F(value) => format!("F{value}"),
        other => format!("{other:?}"),
    }
}
