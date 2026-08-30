use crate::{Event, EventResult, Frame, Rect};

pub trait Component {
    fn render(&self, frame: &mut Frame, area: Rect);

    fn handle_event(&mut self, _event: &Event) -> EventResult {
        EventResult::Ignored
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Color, Point, Size, Style};

    struct Label;
    impl Component for Label {
        fn render(&self, frame: &mut Frame, _area: Rect) {
            frame.write_text(Point::new(0, 0), "Slate", Style::new().foreground(Color::Cyan));
        }
    }

    #[test]
    fn component_can_render_without_terminal_dependency() {
        let mut frame = Frame::new(Size::new(8, 1));
        let area = frame.area();
        Label.render(&mut frame, area);
        assert_eq!(frame.get(Point::new(0, 0)).expect("cell").symbol(), 'S');
    }
}
