use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightInfo {
    #[serde(default = "Vec::new")]
    pub modules: Vec<PreflightModule>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightModule {
    pub kind: String,
    pub specifier: Option<String>,
    pub error: Option<String>,
    #[serde(default)]
    pub dependencies: Vec<PreflightModuleDependency>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightModuleDependency {
    #[serde(default)]
    pub specifier: String,
    pub code: Option<PreflightModuleDependencyCode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightModuleDependencyCode {
    #[serde(default)]
    pub specifier: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

impl PreflightModule {
    pub fn diagnostics(&self) -> Vec<String> {
        let mut diagnostics = self
            .dependencies
            .iter()
            .filter_map(|dep| dep.diagnostics())
            .collect::<Vec<_>>();

        if let Some(error) = &self.error {
            diagnostics.push(format!(
                "{}: {} {}",
                self.kind,
                self.specifier
                    .as_deref()
                    .unwrap_or("<no specifier available>"),
                error
            ));
        }

        diagnostics
    }
}

impl PreflightModuleDependency {
    pub fn specifier(&self) -> &str {
        &self.specifier
    }

    pub fn diagnostics(&self) -> Option<String> {
        if let Some(code) = &self.code {
            if let Some(error) = &code.error {
                Some(format!("Dependency {}:\n{}", self.specifier, error))
            } else {
                None
            }
        } else {
            None
        }
    }
}
