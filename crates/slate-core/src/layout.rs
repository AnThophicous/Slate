use crate::{Element, ElementId, Rect, Size};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Dimension {
    Points(u16),
    Percent(u16),
    Auto,
}

impl Dimension {
    pub const fn points(value: u16) -> Self {
        Self::Points(value)
    }

    pub const fn percent(value: u16) -> Self {
        Self::Percent(value)
    }

    pub const fn auto() -> Self {
        Self::Auto
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FlexDirection {
    Row,
    Column,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FlexWrap {
    NoWrap,
    Wrap,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JustifyContent {
    FlexStart,
    Center,
    FlexEnd,
    SpaceBetween,
    SpaceAround,
    SpaceEvenly,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AlignItems {
    Stretch,
    FlexStart,
    Center,
    FlexEnd,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Overflow {
    Visible,
    Hidden,
    Scroll,
    Auto,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FlexStyle {
    pub display: bool,
    pub direction: FlexDirection,
    pub wrap: FlexWrap,
    pub flex_grow: f32,
    pub flex_shrink: f32,
    pub flex_basis: Dimension,
    pub width: Dimension,
    pub height: Dimension,
    pub min_width: Option<Dimension>,
    pub max_width: Option<Dimension>,
    pub min_height: Option<Dimension>,
    pub max_height: Option<Dimension>,
    pub gap: u16,
    pub padding: u16,
    pub margin: u16,
    pub justify_content: JustifyContent,
    pub align_items: AlignItems,
    pub overflow: Overflow,
    pub scroll_left: u16,
    pub scroll_top: u16,
}

impl Default for FlexStyle {
    fn default() -> Self {
        Self {
            display: true,
            direction: FlexDirection::Column,
            wrap: FlexWrap::NoWrap,
            flex_grow: 0.0,
            flex_shrink: 1.0,
            flex_basis: Dimension::Auto,
            width: Dimension::Auto,
            height: Dimension::Auto,
            min_width: None,
            max_width: None,
            min_height: None,
            max_height: None,
            gap: 0,
            padding: 0,
            margin: 0,
            justify_content: JustifyContent::FlexStart,
            align_items: AlignItems::Stretch,
            overflow: Overflow::Visible,
            scroll_left: 0,
            scroll_top: 0,
        }
    }
}

impl FlexStyle {
    pub const fn row(mut self) -> Self {
        self.direction = FlexDirection::Row;
        self
    }

    pub const fn column(mut self) -> Self {
        self.direction = FlexDirection::Column;
        self
    }

    pub const fn wrap(mut self, value: FlexWrap) -> Self {
        self.wrap = value;
        self
    }

    pub const fn flex_grow(mut self, value: f32) -> Self {
        self.flex_grow = value;
        self
    }

    pub const fn flex_shrink(mut self, value: f32) -> Self {
        self.flex_shrink = value;
        self
    }

    pub const fn basis(mut self, value: Dimension) -> Self {
        self.flex_basis = value;
        self
    }

    pub const fn width(mut self, value: Dimension) -> Self {
        self.width = value;
        self
    }

    pub const fn height(mut self, value: Dimension) -> Self {
        self.height = value;
        self
    }

    pub const fn min_width(mut self, value: Dimension) -> Self {
        self.min_width = Some(value);
        self
    }

    pub const fn max_width(mut self, value: Dimension) -> Self {
        self.max_width = Some(value);
        self
    }

    pub const fn min_height(mut self, value: Dimension) -> Self {
        self.min_height = Some(value);
        self
    }

    pub const fn max_height(mut self, value: Dimension) -> Self {
        self.max_height = Some(value);
        self
    }

    pub const fn gap(mut self, value: u16) -> Self {
        self.gap = value;
        self
    }

    pub const fn padding(mut self, value: u16) -> Self {
        self.padding = value;
        self
    }

    pub const fn margin(mut self, value: u16) -> Self {
        self.margin = value;
        self
    }

    pub const fn justify(mut self, value: JustifyContent) -> Self {
        self.justify_content = value;
        self
    }

    pub const fn align(mut self, value: AlignItems) -> Self {
        self.align_items = value;
        self
    }

    pub const fn overflow(mut self, value: Overflow) -> Self {
        self.overflow = value;
        self
    }

    pub const fn scroll(mut self, left: u16, top: u16) -> Self {
        self.scroll_left = left;
        self.scroll_top = top;
        self
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LayoutNode {
    id: ElementId,
    rect: Rect,
    content: Rect,
    children: Vec<LayoutNode>,
    scroll_width: u16,
    scroll_height: u16,
    scroll_left: u16,
    scroll_top: u16,
    overflow: Overflow,
}

impl LayoutNode {
    pub const fn id(&self) -> ElementId {
        self.id
    }

    pub const fn rect(&self) -> Rect {
        self.rect
    }

    pub const fn content(&self) -> Rect {
        self.content
    }

    pub fn children(&self) -> &[LayoutNode] {
        &self.children
    }

    pub const fn scroll_width(&self) -> u16 {
        self.scroll_width
    }

    pub const fn scroll_height(&self) -> u16 {
        self.scroll_height
    }

    pub const fn scroll_left(&self) -> u16 {
        self.scroll_left
    }

    pub const fn scroll_top(&self) -> u16 {
        self.scroll_top
    }

    pub const fn overflow(&self) -> Overflow {
        self.overflow
    }
}

pub struct LayoutEngine;

impl LayoutEngine {
    pub fn layout(root: &Element, viewport: Size) -> LayoutNode {
        layout_element(root, Rect::new(0, 0, viewport.width(), viewport.height()))
    }

    pub fn apply(root: &mut Element, layout: &LayoutNode) {
        apply_element(root, layout);
    }
}

struct Metric {
    visible: bool,
    main: f32,
    cross: f32,
    cross_explicit: bool,
    grow: f32,
    shrink: f32,
    min: f32,
    max: f32,
}

fn layout_element(element: &Element, rect: Rect) -> LayoutNode {
    let style = element.style();
    if !element.is_visible() || !style.display {
        return LayoutNode {
            id: element.id(),
            rect: Rect::new(rect.x(), rect.y(), 0, 0),
            content: Rect::new(rect.x(), rect.y(), 0, 0),
            children: Vec::new(),
            scroll_width: 0,
            scroll_height: 0,
            scroll_left: 0,
            scroll_top: 0,
            overflow: style.overflow,
        };
    }
    let padding = style.padding.saturating_mul(2);
    let content = Rect::new(
        rect.x().saturating_add(style.padding),
        rect.y().saturating_add(style.padding),
        rect.width().saturating_sub(padding),
        rect.height().saturating_sub(padding),
    );
    let direction = style.direction;
    let main_size =
        if direction == FlexDirection::Row { content.width() } else { content.height() } as f32;
    let cross_size =
        if direction == FlexDirection::Row { content.height() } else { content.width() } as f32;
    let metrics: Vec<Metric> = element
        .children()
        .iter()
        .map(|child| metric(child, direction, main_size, cross_size))
        .collect();
    let gap = style.gap as f32;
    let mut lines: Vec<Vec<usize>> = vec![Vec::new()];
    for (index, metric) in metrics.iter().enumerate() {
        if !metric.visible {
            continue;
        }
        let line = lines.last_mut().expect("layout line exists");
        let occupied = line.iter().map(|index| metrics[*index].main).sum::<f32>()
            + gap * line.len().saturating_sub(1) as f32;
        if style.wrap == FlexWrap::Wrap
            && !line.is_empty()
            && occupied + gap + metric.main > main_size
        {
            lines.push(vec![index]);
        } else {
            line.push(index);
        }
    }
    if lines.len() == 1 && lines[0].is_empty() {
        lines.clear();
    }
    let line_crosses: Vec<f32> = lines
        .iter()
        .map(|line| line.iter().map(|index| metrics[*index].cross).fold(0.0, f32::max))
        .collect();
    let mut children: Vec<LayoutNode> = element
        .children()
        .iter()
        .map(|child| layout_element(child, Rect::new(0, 0, 0, 0)))
        .collect();
    let mut cross_cursor = 0.0;
    for (line_index, line) in lines.iter().enumerate() {
        let sizes = resolve_flex_sizes(&metrics, line, main_size, gap);
        let occupied = sizes.iter().sum::<f32>() + gap * sizes.len().saturating_sub(1) as f32;
        let free = (main_size - occupied).max(0.0);
        let (mut cursor, distributed_gap) =
            distribution(style.justify_content, free, sizes.len(), gap);
        let line_cross = line_crosses.get(line_index).copied().unwrap_or(0.0).min(cross_size);
        for (line_item, index) in line.iter().enumerate() {
            let metric = metrics.get(*index).expect("layout metric exists");
            let cross = match style.align_items {
                AlignItems::Stretch if !metric.cross_explicit => line_cross,
                _ => metric.cross.min(line_cross),
            };
            let cross_offset = match style.align_items {
                AlignItems::Center => (line_cross - cross).max(0.0) / 2.0,
                AlignItems::FlexEnd => (line_cross - cross).max(0.0),
                _ => 0.0,
            };
            let main = sizes.get(line_item).copied().unwrap_or(metric.main).max(0.0);
            let (x, y, width, height) = if direction == FlexDirection::Row {
                (
                    content.x() as f32 + cursor,
                    content.y() as f32 + cross_cursor + cross_offset,
                    main,
                    cross,
                )
            } else {
                (
                    content.x() as f32 + cross_cursor + cross_offset,
                    content.y() as f32 + cursor,
                    cross,
                    main,
                )
            };
            if let Some(slot) = children.get_mut(*index) {
                let child = element.children().get(*index).expect("layout child exists");
                *slot = layout_element(
                    child,
                    Rect::new(round(x), round(y), round(width), round(height)),
                );
            }
            cursor += main + distributed_gap;
        }
        cross_cursor += line_cross + if lines.len() > 1 { gap } else { 0.0 };
    }
    let child_right = children
        .iter()
        .map(|child| child.rect.x().saturating_add(child.rect.width()))
        .max()
        .unwrap_or(content.x());
    let child_bottom = children
        .iter()
        .map(|child| child.rect.y().saturating_add(child.rect.height()))
        .max()
        .unwrap_or(content.y());
    let scroll_width = content.width().max(child_right.saturating_sub(content.x()));
    let scroll_height = content.height().max(child_bottom.saturating_sub(content.y()));
    let scroll_left = if matches!(style.overflow, Overflow::Scroll | Overflow::Auto) {
        style.scroll_left.min(scroll_width.saturating_sub(content.width()))
    } else {
        0
    };
    let scroll_top = if matches!(style.overflow, Overflow::Scroll | Overflow::Auto) {
        style.scroll_top.min(scroll_height.saturating_sub(content.height()))
    } else {
        0
    };
    let children =
        children.into_iter().map(|child| translate(child, scroll_left, scroll_top)).collect();
    LayoutNode {
        id: element.id(),
        rect,
        content,
        children,
        scroll_width,
        scroll_height,
        scroll_left,
        scroll_top,
        overflow: style.overflow,
    }
}

fn metric(
    element: &Element,
    direction: FlexDirection,
    main_basis: f32,
    cross_basis: f32,
) -> Metric {
    let style = element.style();
    let visible = element.is_visible() && style.display;
    let fallback_main = if direction == FlexDirection::Row {
        element.bounds().width()
    } else {
        element.bounds().height()
    }
    .max(1) as f32;
    let fallback_cross = if direction == FlexDirection::Row {
        element.bounds().height()
    } else {
        element.bounds().width()
    }
    .max(1) as f32;
    let main_value = if direction == FlexDirection::Row { style.width } else { style.height };
    let cross_value = if direction == FlexDirection::Row { style.height } else { style.width };
    let base = match style.flex_basis {
        Dimension::Auto => dimension(main_value, main_basis, fallback_main),
        value => dimension(value, main_basis, fallback_main),
    };
    let cross_explicit = !matches!(cross_value, Dimension::Auto);
    let cross = dimension(cross_value, cross_basis, fallback_cross);
    let min_value =
        if direction == FlexDirection::Row { style.min_width } else { style.min_height };
    let max_value =
        if direction == FlexDirection::Row { style.max_width } else { style.max_height };
    let min = min_value.map(|value| dimension(value, main_basis, 0.0)).unwrap_or(0.0);
    let max = max_value.map(|value| dimension(value, main_basis, f32::MAX)).unwrap_or(f32::MAX);
    Metric {
        visible,
        main: base.clamp(min, max),
        cross,
        cross_explicit,
        grow: style.flex_grow,
        shrink: style.flex_shrink,
        min,
        max,
    }
}

fn resolve_flex_sizes(metrics: &[Metric], line: &[usize], available: f32, gap: f32) -> Vec<f32> {
    let mut sizes: Vec<f32> = line.iter().map(|index| metrics[*index].main).collect();
    let occupied = sizes.iter().sum::<f32>() + gap * sizes.len().saturating_sub(1) as f32;
    let free = available - occupied;
    if free > 0.0 {
        let total = line.iter().map(|index| metrics[*index].grow.max(0.0)).sum::<f32>();
        if total > 0.0 {
            for (size, index) in sizes.iter_mut().zip(line) {
                let metric = &metrics[*index];
                *size = (*size + free * metric.grow.max(0.0) / total).clamp(metric.min, metric.max);
            }
        }
    } else if free < 0.0 {
        let total = line
            .iter()
            .map(|index| metrics[*index].shrink.max(0.0) * metrics[*index].main)
            .sum::<f32>();
        if total > 0.0 {
            for (size, index) in sizes.iter_mut().zip(line) {
                let metric = &metrics[*index];
                *size = (*size + free * metric.shrink.max(0.0) * metric.main / total)
                    .clamp(metric.min, metric.max);
            }
        }
    }
    pixel_sizes(sizes)
}

fn dimension(value: Dimension, basis: f32, fallback: f32) -> f32 {
    match value {
        Dimension::Points(value) => value as f32,
        Dimension::Percent(value) => basis * value.min(100) as f32 / 100.0,
        Dimension::Auto => fallback,
    }
}

fn distribution(value: JustifyContent, free: f32, count: usize, gap: f32) -> (f32, f32) {
    if count == 0 || free <= 0.0 {
        return (0.0, gap);
    }
    match value {
        JustifyContent::Center => (free / 2.0, gap),
        JustifyContent::FlexEnd => (free, gap),
        JustifyContent::SpaceBetween if count > 1 => (0.0, gap + free / (count - 1) as f32),
        JustifyContent::SpaceAround => (free / (count as f32 * 2.0), gap + free / count as f32),
        JustifyContent::SpaceEvenly => {
            (free / (count as f32 + 1.0), gap + free / (count as f32 + 1.0))
        }
        _ => (0.0, gap),
    }
}

fn pixel_sizes(values: Vec<f32>) -> Vec<f32> {
    if values.is_empty() {
        return values;
    }
    let mut result: Vec<f32> = values.iter().map(|value| value.floor()).collect();
    let target = values.iter().sum::<f32>().round();
    let used = result.iter().sum::<f32>();
    let mut remainder = (target - used).max(0.0) as usize;
    for index in (0..result.len()).rev() {
        if remainder == 0 {
            break;
        }
        result[index] += 1.0;
        remainder -= 1;
    }
    result
}

fn round(value: f32) -> u16 {
    value.max(0.0).round().min(u16::MAX as f32) as u16
}

fn translate(mut node: LayoutNode, left: u16, top: u16) -> LayoutNode {
    node.rect = Rect::new(
        node.rect.x().saturating_sub(left),
        node.rect.y().saturating_sub(top),
        node.rect.width(),
        node.rect.height(),
    );
    node.content = Rect::new(
        node.content.x().saturating_sub(left),
        node.content.y().saturating_sub(top),
        node.content.width(),
        node.content.height(),
    );
    node.children = node.children.into_iter().map(|child| translate(child, left, top)).collect();
    node
}

fn apply_element(element: &mut Element, layout: &LayoutNode) {
    element.set_bounds(layout.rect);
    for (child, child_layout) in element.children_mut().iter_mut().zip(&layout.children) {
        apply_element(child, child_layout);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Element, TextBlock};

    #[test]
    fn distributes_row_children_with_gap_and_grow() {
        let mut root =
            Element::new(ElementId::new(1), Rect::new(0, 0, 1, 1), TextBlock::new("root"))
                .styled(FlexStyle::default().row().gap(1));
        root.push(
            Element::new(ElementId::new(2), Rect::new(0, 0, 1, 1), TextBlock::new("a"))
                .styled(FlexStyle::default().flex_grow(1.0)),
        );
        root.push(
            Element::new(ElementId::new(3), Rect::new(0, 0, 1, 1), TextBlock::new("b"))
                .styled(FlexStyle::default().flex_grow(1.0)),
        );
        let layout = LayoutEngine::layout(&root, Size::new(10, 2));
        assert_eq!(layout.children()[0].rect().x(), 0);
        assert_eq!(layout.children()[1].rect().x(), 5);
        assert_eq!(layout.children()[0].rect().width(), 4);
        assert_eq!(layout.children()[1].rect().width(), 5);
    }

    #[test]
    fn resolves_percentage_and_constraints() {
        let mut root =
            Element::new(ElementId::new(1), Rect::new(0, 0, 1, 1), TextBlock::new("root"))
                .styled(FlexStyle::default().row());
        root.push(
            Element::new(ElementId::new(2), Rect::new(0, 0, 1, 1), TextBlock::new("a")).styled(
                FlexStyle::default().width(Dimension::Percent(50)).min_width(Dimension::Points(6)),
            ),
        );
        let layout = LayoutEngine::layout(&root, Size::new(10, 2));
        assert_eq!(layout.children()[0].rect().width(), 6);
    }

    #[test]
    fn wraps_children_into_cross_axis_lines() {
        let mut root =
            Element::new(ElementId::new(1), Rect::new(0, 0, 1, 1), TextBlock::new("root"))
                .styled(FlexStyle::default().row().wrap(FlexWrap::Wrap).gap(1));
        for id in 2..=4 {
            root.push(
                Element::new(ElementId::new(id), Rect::new(0, 0, 1, 1), TextBlock::new("item"))
                    .styled(
                        FlexStyle::default()
                            .width(Dimension::Points(3))
                            .height(Dimension::Points(1)),
                    ),
            );
        }
        let layout = LayoutEngine::layout(&root, Size::new(8, 4));
        assert_eq!(layout.children()[0].rect().y(), 0);
        assert_eq!(layout.children()[1].rect().x(), 4);
        assert_eq!(layout.children()[2].rect().y(), 2);
    }
}
