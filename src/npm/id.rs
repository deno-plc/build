use std::fmt::Display;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NPMPackageId {
    pub name: String,
    pub version: String,
}

impl NPMPackageId {
    pub fn to_string(&self) -> String {
        format!("{}@{}", self.name, self.version)
    }

    pub fn from_string(id: &str) -> Option<Self> {
        let at_pos = id[1..].find('@');
        if let Some(at_pos) = at_pos {
            let name = &id[..at_pos + 1];
            let version = &id[(at_pos + 2)..];
            Some(Self {
                name: name.to_string(),
                version: version.to_string(),
            })
        } else {
            None
        }
    }
}

impl TryFrom<String> for NPMPackageId {
    type Error = ();

    fn try_from(value: String) -> Result<Self, Self::Error> {
        if let Some(id) = Self::from_string(&value) {
            Ok(id)
        } else {
            Err(())
        }
    }
}

impl TryFrom<&str> for NPMPackageId {
    type Error = ();

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        if let Some(id) = Self::from_string(value) {
            Ok(id)
        } else {
            Err(())
        }
    }
}

impl Into<String> for NPMPackageId {
    fn into(self) -> String {
        self.to_string()
    }
}

impl Display for NPMPackageId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}@{}", self.name, self.version)
    }
}

#[test]
fn test_npm_package_id() {
    let id = NPMPackageId::from_string("npm@1.0.0").unwrap();
    assert_eq!(id.name, "npm");
    assert_eq!(id.version, "1.0.0");
    assert_eq!(id.to_string(), "npm@1.0.0");
}
