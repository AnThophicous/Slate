use std::time::Duration;

use napi::bindgen_prelude::Result;
use napi_derive::napi;
use slate_core::{Color, Event, Frame, KeyCode, Modifiers, Point, Size, Style};
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
}

#[napi]
pub fn version() -> String {
    slate_core::VERSION.to_owned()
}

#[napi]
pub fn render_text(text: String) -> Result<String> {
    render(RenderOptions { text, width: None, height: None, x: None, y: None, foreground: None })
}

#[napi]
pub fn render(options: RenderOptions) -> Result<String> {
    let width = options
        .width
        .unwrap_or_else(|| {
            options.text.lines().map(UnicodeWidthStr::width).max().unwrap_or(1) as u32
        })
        .max(1)
        .min(u16::MAX as u32) as u16;
    let height = options
        .height
        .unwrap_or_else(|| options.text.lines().count().max(1) as u32)
        .max(1)
        .min(u16::MAX as u32) as u16;
    let x = options.x.unwrap_or(0).min(u16::MAX as u32) as u16;
    let y = options.y.unwrap_or(0).min(u16::MAX as u32) as u16;
    let color = parse_color(options.foreground.as_deref())?;
    let mut frame = Frame::new(Size::new(width, height));
    frame.write_text(Point::new(x, y), &options.text, Style::default().foreground(color));
    Ok(render_to_ansi(&frame))
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
    let value = value
        .strip_prefix('#')
        .ok_or_else(|| napi::Error::from_reason("foreground deve usar #RRGGBB"))?;
    if value.len() != 6 {
        return Err(napi::Error::from_reason("foreground deve usar #RRGGBB"));
    }
    let red = u8::from_str_radix(&value[0..2], 16)
        .map_err(|_| napi::Error::from_reason("foreground inválido"))?;
    let green = u8::from_str_radix(&value[2..4], 16)
        .map_err(|_| napi::Error::from_reason("foreground inválido"))?;
    let blue = u8::from_str_radix(&value[4..6], 16)
        .map_err(|_| napi::Error::from_reason("foreground inválido"))?;
    Ok(Color::rgb(red, green, blue))
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

fn key_code(code: KeyCode) -> String {
    match code {
        KeyCode::Char(value) => value.to_string(),
        KeyCode::F(value) => format!("F{value}"),
        other => format!("{other:?}"),
    }
}

#[allow(dead_code)]
fn _assert_modifiers_are_byte_sized(value: Modifiers) -> u32 {
    value.bits().into()
}
