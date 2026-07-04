use wasm_bindgen::prelude::*;
use js_sys::{Array, Function};

pub struct EventSystem {
    pub move_callbacks: Vec<Box<Function>>,
    pub zoom_callbacks: Vec<Box<Function>>,
    pub click_callbacks: Vec<Box<Function>>,
    pub hover_callbacks: Vec<Box<Function>>,
    pub mousedown_callbacks: Vec<Box<Function>>,
    pub mouseup_callbacks: Vec<Box<Function>>,
    pub contextmenu_callbacks: Vec<Box<Function>>,
    pub keydown_callbacks: Vec<Box<Function>>,
    pub keyup_callbacks: Vec<Box<Function>>,
    pub dragend_callbacks: Vec<Box<Function>>,
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
        self.move_callbacks.push(Box::new(callback.clone()));
    }

    pub fn on_zoom(&mut self, callback: &Function) {
        self.zoom_callbacks.push(Box::new(callback.clone()));
    }

    pub fn on_click(&mut self, callback: &Function) {
        self.click_callbacks.push(Box::new(callback.clone()));
    }

    pub fn on_hover(&mut self, callback: &Function) {
        self.hover_callbacks.push(Box::new(callback.clone()));
    }

    pub fn on_mousedown(&mut self, callback: &Function) {
        self.mousedown_callbacks.push(Box::new(callback.clone()));
    }

    pub fn on_mouseup(&mut self, callback: &Function) {
        self.mouseup_callbacks.push(Box::new(callback.clone()));
    }

    pub fn on_contextmenu(&mut self, callback: &Function) {
        self.contextmenu_callbacks.push(Box::new(callback.clone()));
    }

    pub fn on_keydown(&mut self, callback: &Function) {
        self.keydown_callbacks.push(Box::new(callback.clone()));
    }

    pub fn on_keyup(&mut self, callback: &Function) {
        self.keyup_callbacks.push(Box::new(callback.clone()));
    }

    pub fn on_dragend(&mut self, callback: &Function) {
        self.dragend_callbacks.push(Box::new(callback.clone()));
    }

    pub fn off_move(&mut self, callback: &Function) {
        self.move_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    pub fn off_zoom(&mut self, callback: &Function) {
        self.zoom_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    pub fn off_click(&mut self, callback: &Function) {
        self.click_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    pub fn off_hover(&mut self, callback: &Function) {
        self.hover_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    pub fn off_mousedown(&mut self, callback: &Function) {
        self.mousedown_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    pub fn off_mouseup(&mut self, callback: &Function) {
        self.mouseup_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    pub fn off_contextmenu(&mut self, callback: &Function) {
        self.contextmenu_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    pub fn off_keydown(&mut self, callback: &Function) {
        self.keydown_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    pub fn off_keyup(&mut self, callback: &Function) {
        self.keyup_callbacks.retain(|cb| cb.as_ref() != callback);
    }

    pub fn off_dragend(&mut self, callback: &Function) {
        self.dragend_callbacks.retain(|cb| cb.as_ref() != callback);
    }
}

pub fn trigger_move_event(callbacks: &[Box<Function>], event_obj: &JsValue) {
    for callback in callbacks {
        let _ = callback.call1(&JsValue::null(), event_obj);
    }
}

pub fn trigger_zoom_event(callbacks: &[Box<Function>], event_obj: &JsValue) {
    for callback in callbacks {
        let _ = callback.call1(&JsValue::null(), event_obj);
    }
}

pub fn trigger_click_event(callbacks: &[Box<Function>], event_obj: &JsValue) {
    for callback in callbacks {
        let _ = callback.call1(&JsValue::null(), event_obj);
    }
}

pub fn trigger_hover_event(callbacks: &[Box<Function>], event_obj: &JsValue) {
    for callback in callbacks {
        let _ = callback.call1(&JsValue::null(), event_obj);
    }
}

pub fn trigger_mousedown_event(callbacks: &[Box<Function>], event_obj: &JsValue) {
    for callback in callbacks {
        let _ = callback.call1(&JsValue::null(), event_obj);
    }
}

pub fn trigger_mouseup_event(callbacks: &[Box<Function>], event_obj: &JsValue) {
    for callback in callbacks {
        let _ = callback.call1(&JsValue::null(), event_obj);
    }
}

pub fn trigger_contextmenu_event(callbacks: &[Box<Function>], event_obj: &JsValue) {
    for callback in callbacks {
        let _ = callback.call1(&JsValue::null(), event_obj);
    }
}

pub fn trigger_keydown_event(callbacks: &[Box<Function>], event_obj: &JsValue) {
    for callback in callbacks {
        let _ = callback.call1(&JsValue::null(), event_obj);
    }
}

pub fn trigger_keyup_event(callbacks: &[Box<Function>], event_obj: &JsValue) {
    for callback in callbacks {
        let _ = callback.call1(&JsValue::null(), event_obj);
    }
}

pub fn trigger_dragend_event(callbacks: &[Box<Function>], event_obj: &JsValue) {
    for callback in callbacks {
        let _ = callback.call1(&JsValue::null(), event_obj);
    }
}

pub fn create_map_event(event_type: &str, center: &Array, zoom: f64, bounds: &Array) -> Result<JsValue, JsValue> {
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &JsValue::from_str("type"), &JsValue::from_str(event_type))
        .map_err(|e| JsValue::from_str(&format!("Failed to set event type: {:?}", e)))?;
    js_sys::Reflect::set(&obj, &JsValue::from_str("target"), &JsValue::null())
        .map_err(|e| JsValue::from_str(&format!("Failed to set target: {:?}", e)))?;
    js_sys::Reflect::set(&obj, &JsValue::from_str("sourceTarget"), &JsValue::null())
        .map_err(|e| JsValue::from_str(&format!("Failed to set sourceTarget: {:?}", e)))?;

    js_sys::Reflect::set(&obj, &JsValue::from_str("center"), center)
        .map_err(|e| JsValue::from_str(&format!("Failed to set center: {:?}", e)))?;

    js_sys::Reflect::set(&obj, &JsValue::from_str("zoom"), &JsValue::from_f64(zoom))
        .map_err(|e| JsValue::from_str(&format!("Failed to set zoom: {:?}", e)))?;

    js_sys::Reflect::set(&obj, &JsValue::from_str("bounds"), bounds)
        .map_err(|e| JsValue::from_str(&format!("Failed to set bounds: {:?}", e)))?;

    Ok(obj.into())
}

pub fn create_click_event(lat: f64, lng: f64, container_point: &Array) -> Result<JsValue, JsValue> {
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &JsValue::from_str("type"), &JsValue::from_str("click"))
        .map_err(|e| JsValue::from_str(&format!("Failed to set click type: {:?}", e)))?;
    js_sys::Reflect::set(&obj, &JsValue::from_str("target"), &JsValue::null())
        .map_err(|e| JsValue::from_str(&format!("Failed to set click target: {:?}", e)))?;

    let latlng = Array::new();
    latlng.push(&JsValue::from_f64(lat));
    latlng.push(&JsValue::from_f64(lng));
    js_sys::Reflect::set(&obj, &JsValue::from_str("latlng"), &latlng)
        .map_err(|e| JsValue::from_str(&format!("Failed to set click latlng: {:?}", e)))?;

    js_sys::Reflect::set(&obj, &JsValue::from_str("containerPoint"), container_point)
        .map_err(|e| JsValue::from_str(&format!("Failed to set click containerPoint: {:?}", e)))?;

    js_sys::Reflect::set(&obj, &JsValue::from_str("layerPoint"), container_point)
        .map_err(|e| JsValue::from_str(&format!("Failed to set click layerPoint: {:?}", e)))?;

    Ok(obj.into())
}

pub fn create_hover_event(lat: f64, lng: f64) -> Result<JsValue, JsValue> {
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &JsValue::from_str("type"), &JsValue::from_str("hover"))
        .map_err(|e| JsValue::from_str(&format!("Failed to set hover type: {:?}", e)))?;
    js_sys::Reflect::set(&obj, &JsValue::from_str("target"), &JsValue::null())
        .map_err(|e| JsValue::from_str(&format!("Failed to set hover target: {:?}", e)))?;

    let latlng = Array::new();
    latlng.push(&JsValue::from_f64(lat));
    latlng.push(&JsValue::from_f64(lng));
    js_sys::Reflect::set(&obj, &JsValue::from_str("latlng"), &latlng)
        .map_err(|e| JsValue::from_str(&format!("Failed to set hover latlng: {:?}", e)))?;

    Ok(obj.into())
}
