use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

#[derive(Debug)]
pub struct DependencyLink<RawT, ResolvedT> {
    raw: Mutex<Option<Vec<RawT>>>,
    resolved: OnceLock<HashMap<String, ResolvedT>>,
}

impl<RawT, ResolvedT> DependencyLink<RawT, ResolvedT> {
    pub fn new(raw: Vec<RawT>) -> Self {
        Self {
            raw: Mutex::new(Some(raw)),
            resolved: OnceLock::new(),
        }
    }

    pub fn take_raw(&self) -> Option<Vec<RawT>> {
        self.raw.lock().unwrap().take()
    }

    pub fn try_resolved(&self) -> Option<&HashMap<String, ResolvedT>> {
        self.resolved.get()
    }

    pub fn set_resolved(
        &self,
        resolved: HashMap<String, ResolvedT>,
    ) -> Result<(), HashMap<String, ResolvedT>> {
        self.resolved.set(resolved)
    }
}
