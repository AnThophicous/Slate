use crate::{Component, Event, EventResult, Frame, Point, Rect};
use std::collections::HashSet;

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ElementId(u64);

impl ElementId {
    pub const fn new(value: u64) -> Self {
        Self(value)
    }
    pub const fn value(self) -> u64 {
        self.0
    }
}

pub struct Element {
    id: ElementId,
    bounds: Rect,
    component: Box<dyn Component>,
    children: Vec<Element>,
    focusable: bool,
    visible: bool,
}

pub struct ElementEditor<'a> {
    element: &'a mut Element,
}

impl<'a> ElementEditor<'a> {
    pub fn id(&self) -> ElementId {
        self.element.id()
    }
    pub fn bounds(&self) -> Rect {
        self.element.bounds()
    }
    pub fn set_bounds(&mut self, bounds: Rect) {
        self.element.set_bounds(bounds);
    }
    pub fn set_focusable(&mut self, value: bool) {
        self.element.set_focusable(value);
    }
    pub fn set_visible(&mut self, value: bool) {
        self.element.set_visible(value);
    }
    pub fn replace_component(&mut self, component: impl Component + 'static) {
        self.element.replace_component(component);
    }
    pub fn push(&mut self, child: Element) {
        self.element.push(child);
    }
    pub fn children(&self) -> &[Element] {
        self.element.children()
    }
}

impl Element {
    pub fn new(id: ElementId, bounds: Rect, component: impl Component + 'static) -> Self {
        Self {
            id,
            bounds,
            component: Box::new(component),
            children: Vec::new(),
            focusable: false,
            visible: true,
        }
    }

    pub const fn id(&self) -> ElementId {
        self.id
    }
    pub const fn bounds(&self) -> Rect {
        self.bounds
    }
    pub fn set_bounds(&mut self, bounds: Rect) {
        self.bounds = bounds;
    }
    pub fn set_focusable(&mut self, value: bool) {
        self.focusable = value;
    }
    pub const fn is_focusable(&self) -> bool {
        self.focusable
    }
    pub fn focusable(mut self, value: bool) -> Self {
        self.focusable = value;
        self
    }
    pub const fn is_visible(&self) -> bool {
        self.visible
    }
    pub fn set_visible(&mut self, value: bool) {
        self.visible = value;
    }
    pub fn replace_component(&mut self, component: impl Component + 'static) {
        self.component = Box::new(component);
    }
    pub fn component(&self) -> &dyn Component {
        self.component.as_ref()
    }
    pub fn component_mut(&mut self) -> &mut dyn Component {
        self.component.as_mut()
    }
    pub fn add(&mut self, child: Element) -> &mut Self {
        self.children.push(child);
        self
    }
    pub fn push(&mut self, child: Element) {
        self.children.push(child);
    }
    pub fn try_push(&mut self, child: Element) -> bool {
        let mut ids = HashSet::new();
        if !collect_ids(&child, &mut ids) || ids.iter().any(|id| self.find(*id).is_some()) {
            return false;
        }
        self.push(child);
        true
    }
    pub fn remove(&mut self, id: ElementId) -> Option<Element> {
        if let Some(index) = self.children.iter().position(|child| child.id == id) {
            return Some(self.children.remove(index));
        }
        self.children.iter_mut().find_map(|child| child.remove(id))
    }
    pub fn children(&self) -> &[Element] {
        &self.children
    }
    pub fn children_mut(&mut self) -> &mut [Element] {
        &mut self.children
    }
    pub fn find(&self, id: ElementId) -> Option<&Element> {
        if self.id == id {
            return Some(self);
        }
        self.children.iter().find_map(|child| child.find(id))
    }
    pub fn find_mut(&mut self, id: ElementId) -> Option<&mut Element> {
        if self.id == id {
            return Some(self);
        }
        self.children.iter_mut().find_map(|child| child.find_mut(id))
    }
    fn render_tree(&self, frame: &mut Frame) {
        if !self.visible {
            return;
        }
        self.component.render(frame, self.bounds);
        for child in &self.children {
            child.render_tree(frame);
        }
    }
    fn hit_path(&self, point: Point, path: &mut Vec<ElementId>) -> bool {
        if !self.visible || !self.bounds.contains(point) {
            return false;
        }
        for child in self.children.iter().rev() {
            if child.hit_path(point, path) {
                path.push(self.id);
                return true;
            }
        }
        path.push(self.id);
        true
    }

    fn path_to(&self, id: ElementId, path: &mut Vec<ElementId>) -> bool {
        if self.id == id {
            path.push(self.id);
            return true;
        }
        for child in &self.children {
            if child.path_to(id, path) {
                path.push(self.id);
                return true;
            }
        }
        false
    }
}

pub struct Container {
    root: Element,
    focused: Option<ElementId>,
}

impl Container {
    pub fn new(root: Element) -> Self {
        Self { root, focused: None }
    }
    pub fn root(&self) -> &Element {
        &self.root
    }
    pub fn root_mut(&mut self) -> &mut Element {
        &mut self.root
    }
    pub fn find(&self, id: ElementId) -> Option<&Element> {
        self.root.find(id)
    }
    pub fn find_mut(&mut self, id: ElementId) -> Option<&mut Element> {
        self.root.find_mut(id)
    }
    pub fn remove(&mut self, id: ElementId) -> Option<Element> {
        if self.root.id() == id {
            return None;
        }
        let removed = self.root.remove(id);
        if self.focused.is_some_and(|focused| self.find(focused).is_none()) {
            self.focused = None;
        }
        removed
    }
    pub fn replace_component(
        &mut self,
        id: ElementId,
        component: impl Component + 'static,
    ) -> bool {
        let Some(element) = self.find_mut(id) else { return false };
        element.replace_component(component);
        true
    }
    pub fn append(&mut self, parent: ElementId, child: Element) -> bool {
        let mut child_ids = HashSet::new();
        if !collect_ids(&child, &mut child_ids) {
            return false;
        }
        let mut existing_ids = HashSet::new();
        if !collect_ids(&self.root, &mut existing_ids)
            || child_ids.iter().any(|id| existing_ids.contains(id))
        {
            return false;
        }
        let Some(element) = self.find_mut(parent) else { return false };
        element.push(child);
        true
    }
    pub fn edit(&mut self, id: ElementId, edit: impl FnOnce(&mut ElementEditor<'_>)) -> bool {
        let Some(element) = self.find_mut(id) else { return false };
        let mut editor = ElementEditor { element };
        edit(&mut editor);
        true
    }
    pub fn render(&self, frame: &mut Frame) {
        self.root.render_tree(frame);
    }
    pub fn focus(&mut self, id: ElementId) -> bool {
        if self.root.find(id).is_some_and(Element::is_focusable) {
            self.focused = Some(id);
            true
        } else {
            false
        }
    }
    pub const fn focused(&self) -> Option<ElementId> {
        self.focused
    }
    pub fn dispatch(&mut self, event: &Event) -> EventResult {
        let mut path = Vec::new();
        if let Event::Mouse(mouse) = event {
            if !self.root.hit_path(mouse.position(), &mut path) {
                return EventResult::Ignored;
            }
        } else if let Some(id) = self.focused {
            if !self.root.path_to(id, &mut path) {
                self.focused = None;
                path.push(self.root.id());
            }
        } else {
            path.push(self.root.id());
        }
        for id in path {
            if let Some(element) = self.root.find_mut(id) {
                let result = element.component.handle_event(event);
                if result != EventResult::Ignored {
                    return result;
                }
            }
        }
        EventResult::Ignored
    }

    pub fn ids_are_unique(&self) -> bool {
        let mut ids = HashSet::new();
        collect_ids(&self.root, &mut ids)
    }
}

fn collect_ids(element: &Element, ids: &mut HashSet<ElementId>) -> bool {
    if !ids.insert(element.id()) {
        return false;
    }
    for child in element.children() {
        if !collect_ids(child, ids) {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Color, KeyCode, KeyEvent, Modifiers, MouseButton, MouseEvent, MouseEventKind, Size, Style,
    };
    use std::cell::Cell;
    use std::rc::Rc;

    struct Probe(Rc<Cell<u8>>, EventResult);
    impl Component for Probe {
        fn render(&self, _frame: &mut Frame, _area: Rect) {}
        fn handle_event(&mut self, _event: &Event) -> EventResult {
            self.0.set(self.0.get() + 1);
            self.1
        }
    }

    #[test]
    fn routes_mouse_to_topmost_child_and_bubbles() {
        let parent_hits = Rc::new(Cell::new(0));
        let child_hits = Rc::new(Cell::new(0));
        let mut root = Element::new(
            ElementId::new(1),
            Rect::new(0, 0, 10, 4),
            Probe(parent_hits.clone(), EventResult::Ignored),
        );
        root.push(Element::new(
            ElementId::new(2),
            Rect::new(0, 0, 5, 4),
            Probe(child_hits.clone(), EventResult::Consumed),
        ));
        let mut tree = Container::new(root);
        let event = Event::Mouse(MouseEvent::new(
            Point::new(2, 2),
            MouseEventKind::Press(MouseButton::Left),
            Modifiers::empty(),
        ));
        assert_eq!(tree.dispatch(&event), EventResult::Consumed);
        assert_eq!(child_hits.get(), 1);
        assert_eq!(parent_hits.get(), 0);
    }

    #[test]
    fn routes_keyboard_to_focus() {
        let hits = Rc::new(Cell::new(0));
        let mut root = Element::new(
            ElementId::new(1),
            Rect::new(0, 0, 10, 4),
            Probe(Rc::new(Cell::new(0)), EventResult::Ignored),
        );
        root.push(
            Element::new(
                ElementId::new(2),
                Rect::new(0, 0, 5, 4),
                Probe(hits.clone(), EventResult::Consumed),
            )
            .focusable(true),
        );
        let mut tree = Container::new(root);
        assert!(tree.focus(ElementId::new(2)));
        let event = Event::Key(KeyEvent::new(KeyCode::Enter, Modifiers::empty()));
        assert_eq!(tree.dispatch(&event), EventResult::Consumed);
        assert_eq!(hits.get(), 1);
    }

    #[test]
    fn renders_the_complete_tree() {
        let mut frame = Frame::new(Size::new(4, 1));
        let root = Element::new(ElementId::new(1), Rect::new(0, 0, 4, 1), Text);
        let tree = Container::new(root);
        tree.render(&mut frame);
        assert_eq!(frame.get(Point::new(0, 0)).expect("cell").symbol(), 'S');
    }

    #[test]
    fn edits_and_removes_elements_by_id() {
        let mut tree = Container::new(Element::new(ElementId::new(1), Rect::new(0, 0, 8, 1), Text));
        assert!(tree.append(
            ElementId::new(1),
            Element::new(ElementId::new(2), Rect::new(0, 0, 8, 1), Text)
        ));
        assert!(tree.edit(ElementId::new(2), |element| {
            element.set_visible(false);
        }));
        assert!(!tree.find(ElementId::new(2)).is_some_and(Element::is_visible));
        assert!(tree.ids_are_unique());
        assert!(tree.remove(ElementId::new(2)).is_some());
        assert!(tree.find(ElementId::new(2)).is_none());
    }

    #[test]
    fn rejects_duplicate_ids_in_a_subtree() {
        let mut tree = Container::new(Element::new(ElementId::new(1), Rect::new(0, 0, 8, 2), Text));
        let mut child = Element::new(ElementId::new(2), Rect::new(0, 0, 8, 1), Text);
        child.push(Element::new(ElementId::new(2), Rect::new(0, 1, 8, 1), Text));
        assert!(!tree.append(ElementId::new(1), child));
        let mut valid = Element::new(ElementId::new(3), Rect::new(0, 0, 8, 1), Text);
        valid.push(Element::new(ElementId::new(4), Rect::new(0, 1, 8, 1), Text));
        assert!(tree.append(ElementId::new(1), valid));
        assert!(tree.ids_are_unique());
    }

    struct Text;
    impl Component for Text {
        fn render(&self, frame: &mut Frame, _area: Rect) {
            frame.write_text(Point::new(0, 0), "S", Style::new().foreground(Color::Cyan));
        }
    }
}
