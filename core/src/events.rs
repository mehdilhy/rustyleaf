use wasm_bindgen::prelude::*;
use js_sys::{Array, Function};
use crate::error::RustyleafError;

pub struct EventSystem {
    pub move_callbacks: Vec<Function>,
    pub zoom_callbacks: Vec<Function>,
    pub click_callbacks: Vec<Function>,
    pub hover_callbacks: Vec<Function>,
    pub mousedown_callbacks: Vec<Function>,
    pub mouseup_callbacks: Vec<Function>,
    pub contextmenu_callbacks: Vec<Function>,
    pub keydown_callbacks: Vec<Function>,
    pub keyup_callbacks: Vec<Function>,
    pub dragend_callbacks: Vec<Function>,
}

impl EventSystem {
    pub fn new() -> Self {
        Self {
            move_callbacks: Vec::new(),
            zoom_callbacks: Vec::new(),
            click_callbacks: Vec::new(),
            hover_callbacks: Vec::new(),
            mousedown_callbacks: Vec::new(),
            mouseup_callbacks: Vec::new(),
            contextmenu_callbacks: Vec::new(),
            keydown_callbacks: Vec::new(),
            keyup_callbacks: Vec::new(),
            dragend_callbacks: Vec::new(),
        }
    }

    pub fn on_move(&mut self, callback: &Function) {
        self.move_callbacks.push(callback.clone());
    }

    pub fn on_zoom(&mut self, callback: &Function) {
        self.zoom_callbacks.push(callback.clone());
    }

    pub fn on_click(&mut self, callback: &Function) {
        self.click_callbacks.push(callback.clone());
    }

    pub fn on_hover(&mut self, callback: &Function) {
        self.hover_callbacks.push(callback.clone());
    }

    pub fn on_mousedown(&mut self, callback: &Function) {
        self.mousedown_callbacks.push(callback.clone());
    }

    pub fn on_mouseup(&mut self, callback: &Function) {
        self.mouseup_callbacks.push(callback.clone());
    }

    pub fn on_contextmenu(&mut self, callback: &Function) {
        self.contextmenu_callbacks.push(callback.clone());
    }

    pub fn on_keydown(&mut self, callback: &Function) {
        self.keydown_callbacks.push(callback.clone());
    }

    pub fn on_keyup(&mut self, callback: &Function) {
        self.keyup_callbacks.push(callback.clone());
    }

    pub fn on_dragend(&mut self, callback: &Function) {
        self.dragend_callbacks.push(callback.clone());
    }

    pub fn off_move(&mut self, callback: &Function) {
        self.move_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_zoom(&mut self, callback: &Function) {
        self.zoom_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_click(&mut self, callback: &Function) {
        self.click_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_hover(&mut self, callback: &Function) {
        self.hover_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_mousedown(&mut self, callback: &Function) {
        self.mousedown_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_mouseup(&mut self, callback: &Function) {
        self.mouseup_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_contextmenu(&mut self, callback: &Function) {
        self.contextmenu_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_keydown(&mut self, callback: &Function) {
        self.keydown_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_keyup(&mut self, callback: &Function) {
        self.keyup_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_dragend(&mut self, callback: &Function) {
        self.dragend_callbacks.retain(|cb| cb != callback);
    }
}

/// Invoke every registered callback with the given event object.
///
/// Iterates a SNAPSHOT so listeners that (de)register during dispatch cannot
/// abort the loop, and isolates failures: a throwing listener is reported on
/// the console but never prevents the remaining listeners from running.
/// (Calling any wasm method from inside a listener trips wasm-bindgen's
/// re-entrancy guard — that throw must not take down the whole event.)
pub fn trigger_event(callbacks: &[Function], event_obj: &JsValue) {
    let snapshot: Vec<Function> = callbacks.to_vec();
    for callback in snapshot {
        if let Err(e) = callback.call1(&JsValue::null(), event_obj) {
            web_sys::console::error_1(&e);
        }
    }
}

pub fn create_map_event(event_type: &str, center: &Array, zoom: f64, bounds: &Array) -> Result<JsValue, JsValue> {
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &JsValue::from_str("type"), &JsValue::from_str(event_type))
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set event type: {:?}", e)))?;
    js_sys::Reflect::set(&obj, &JsValue::from_str("target"), &JsValue::null())
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set target: {:?}", e)))?;
    js_sys::Reflect::set(&obj, &JsValue::from_str("sourceTarget"), &JsValue::null())
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set sourceTarget: {:?}", e)))?;
    js_sys::Reflect::set(&obj, &JsValue::from_str("propagatedFrom"), &JsValue::null())
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set propagatedFrom: {:?}", e)))?;
    js_sys::Reflect::set(&obj, &JsValue::from_str("originalEvent"), &JsValue::null())
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set originalEvent: {:?}", e)))?;

    js_sys::Reflect::set(&obj, &JsValue::from_str("center"), center)
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set center: {:?}", e)))?;

    js_sys::Reflect::set(&obj, &JsValue::from_str("zoom"), &JsValue::from_f64(zoom))
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set zoom: {:?}", e)))?;

    js_sys::Reflect::set(&obj, &JsValue::from_str("bounds"), bounds)
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set bounds: {:?}", e)))?;

    Ok(obj.into())
}

pub fn create_click_event(lat: f64, lng: f64, container_point: &Array, layer_point: &Array, original_event: Option<&JsValue>) -> Result<JsValue, JsValue> {
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &JsValue::from_str("type"), &JsValue::from_str("click"))
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set click type: {:?}", e)))?;
    js_sys::Reflect::set(&obj, &JsValue::from_str("target"), &JsValue::null())
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set click target: {:?}", e)))?;
    js_sys::Reflect::set(&obj, &JsValue::from_str("sourceTarget"), &JsValue::null())
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set click sourceTarget: {:?}", e)))?;
    js_sys::Reflect::set(&obj, &JsValue::from_str("propagatedFrom"), &JsValue::null())
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set click propagatedFrom: {:?}", e)))?;

    let latlng = Array::new();
    latlng.push(&JsValue::from_f64(lat));
    latlng.push(&JsValue::from_f64(lng));
    js_sys::Reflect::set(&obj, &JsValue::from_str("latlng"), &latlng)
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set click latlng: {:?}", e)))?;

    js_sys::Reflect::set(&obj, &JsValue::from_str("containerPoint"), container_point)
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set click containerPoint: {:?}", e)))?;

    js_sys::Reflect::set(&obj, &JsValue::from_str("layerPoint"), layer_point)
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set click layerPoint: {:?}", e)))?;

    let original_js = match original_event {
        Some(ev) => ev.clone(),
        None => JsValue::NULL,
    };
    js_sys::Reflect::set(&obj, &JsValue::from_str("originalEvent"), &original_js)
        .map_err(|e| RustyleafError::EventConstruction(format!("Failed to set click originalEvent: {:?}", e)))?;

    Ok(obj.into())
}
