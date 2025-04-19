pub mod dependencies;

use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::Arc,
};

use crate::{npm::id::NPMPackageId, specifier::ModuleSpecifier};
use dependencies::DependencyLink;
use tokio::fs::read_to_string;
use url::Url;

use crate::deno::info::{self, DenoInfo, EsmDependency, EsmModule, Module};

#[derive(Debug, Default)]
pub struct ModuleGraph {
    modules: HashMap<Arc<ModuleSpecifier>, GraphModule>,
    redirects: HashMap<Arc<ModuleSpecifier>, Arc<ModuleSpecifier>>,
    specifiers: HashSet<Arc<ModuleSpecifier>>,
    root_specifier: Option<Arc<ModuleSpecifier>>,
    root_module: Option<Arc<ESMGraphModule>>,
    npm_packages: HashMap<String, Arc<NPMPackage>>,
    pub global_package_imports: HashMap<String, GraphModule>,
    pub root_dir: PathBuf,
}

const REDIRECT_LIMIT: usize = 10;

impl ModuleGraph {
    pub fn new() -> Self {
        Default::default()
    }

    pub fn root_specifier(&self) -> Option<Arc<ModuleSpecifier>> {
        self.root_specifier.clone()
    }

    pub fn root(&self) -> Option<Arc<ESMGraphModule>> {
        self.root_module.clone()
    }

    pub fn as_arc(&mut self, spec: ModuleSpecifier) -> Arc<ModuleSpecifier> {
        let n = Arc::new(spec);
        if self.specifiers.contains(&n) {
            return self.specifiers.get(&n).unwrap().clone();
        } else {
            self.specifiers.insert(n.clone());
            n
        }
    }

    pub async fn build(&mut self, info: DenoInfo, root_dir: PathBuf) {
        self.root_dir = root_dir;

        for (long_name, package) in info.npm_packages {
            let package = NPMPackage::from_package(package);

            let short_name = package.id().to_string();

            if short_name != long_name {
                self.npm_packages.insert(short_name, package.clone());
            }

            self.npm_packages.insert(long_name, package);
        }

        for (_name, package) in &self.npm_packages {
            package.link(|name| self.npm_packages.get(name).cloned());
        }

        for module in info.modules {
            let m = match module {
                Module::Esm(module) => Some(GraphModule::Esm(ESMGraphModule::from_esm(module))),
                Module::Npm(npm_module) => {
                    if let Some(package) = self
                        .npm_packages
                        .get(npm_module.npm_package.as_str())
                        .cloned()
                    {
                        Some(GraphModule::Npm(
                            package.import_specifier(Arc::new(npm_module.specifier)),
                        ))
                    } else {
                        eprintln!(
                            "Failed to resolve NPM module {} for {}, unknown reference",
                            npm_module.npm_package, npm_module.specifier
                        );
                        None
                    }
                }
                Module::Node(node_builtin) => Some(GraphModule::Virtual(Arc::new(
                    VirtualModule::new(node_builtin.specifier),
                ))),
                Module::External(external_module) => Some(GraphModule::Virtual(Arc::new(
                    VirtualModule::new(external_module.specifier),
                ))),
            };
            if let Some(m) = m {
                self.specifiers.insert(m.specifier());
                self.modules.insert(m.specifier(), m);
            }
        }

        self.root_specifier = Some(self.as_arc(info.roots[0].clone()));
        self.root_module = self
            .modules
            .get(self.root_specifier.as_ref().unwrap())
            .and_then(|m| match m {
                GraphModule::Esm(m) => Some(m.clone()),
                _ => None,
            });

        for (key, value) in info.redirects {
            let key = self.as_arc(key);
            let value = self.as_arc(value);
            self.redirects.insert(key, value);
        }

        for (_spec, module) in self.modules.iter() {
            match module {
                GraphModule::Esm(m) => {
                    let global_packages =
                        m.link(|specifier| self.get_module_with_redirect(specifier, 0));
                    self.global_package_imports.extend(global_packages);
                }
                _ => {}
            }
        }

        for (id, module) in &self.global_package_imports {
            println!("Global package import: {} -> {}", id, module.specifier());
        }
    }

    pub fn get_module(&self, specifier: &ModuleSpecifier) -> Option<GraphModule> {
        self.modules.get(specifier).cloned()
    }

    pub fn get_module_with_redirect(
        &self,
        specifier: &ModuleSpecifier,
        redirects: usize,
    ) -> Option<GraphModule> {
        if let Some(module) = self.modules.get(specifier) {
            return Some(module.clone());
        }

        if let Some(redirect) = self.redirects.get(specifier) {
            if redirects < REDIRECT_LIMIT {
                return self.get_module_with_redirect(redirect, redirects + 1);
            } else {
                eprintln!("Redirect limit reached for {}", specifier);
            }
        }

        None
    }

    pub fn get_npm_package(&self, id: &str) -> Option<Arc<NPMPackage>> {
        self.npm_packages.get(id).cloned()
    }
}

#[derive(Debug, Clone)]
pub enum GraphModule {
    Esm(Arc<ESMGraphModule>),
    Npm(Arc<NPMImportSpecifier>),
    Virtual(Arc<VirtualModule>),
}

impl GraphModule {
    pub fn specifier(&self) -> Arc<ModuleSpecifier> {
        match self {
            GraphModule::Esm(module) => module.specifier.clone(),
            GraphModule::Npm(module) => module.specifier.clone(),
            GraphModule::Virtual(module) => module.specifier.clone(),
        }
    }

    pub fn esm(&self) -> Option<Arc<ESMGraphModule>> {
        match self {
            GraphModule::Esm(module) => Some(module.clone()),
            _ => None,
        }
    }

    pub fn npm(&self) -> Option<Arc<NPMImportSpecifier>> {
        match self {
            GraphModule::Npm(module) => Some(module.clone()),
            _ => None,
        }
    }

    pub fn virtual_module(&self) -> Option<Arc<VirtualModule>> {
        match self {
            GraphModule::Virtual(module) => Some(module.clone()),
            _ => None,
        }
    }
}

#[derive(Debug)]
pub struct ESMGraphModule {
    specifier: Arc<ModuleSpecifier>,
    dependencies: DependencyLink<EsmDependency, GraphModule>,
    local: PathBuf,
}

impl ESMGraphModule {
    fn from_esm(esm: EsmModule) -> Arc<Self> {
        Arc::new(Self {
            specifier: Arc::new(esm.specifier),
            dependencies: DependencyLink::new(esm.dependencies),
            local: esm.local,
        })
    }

    pub fn specifier(&self) -> Arc<ModuleSpecifier> {
        self.specifier.clone()
    }

    fn link(
        &self,
        resolve: impl Fn(&ModuleSpecifier) -> Option<GraphModule>,
    ) -> HashMap<String, GraphModule> {
        if let Some(deps) = self.dependencies.take_raw() {
            let mut resolved = HashMap::new();
            let mut global_packages = HashMap::new();

            for dep in deps.iter() {
                let specifier = &dep.specifier;

                if let Some(dep_code_linking_section) = dep.code.clone() {
                    if let Some(module) = resolve(&dep_code_linking_section.specifier) {
                        if self.specifier.scheme() == "file" && !specifier.starts_with(".") {
                            global_packages.insert(specifier.clone(), module.clone());
                        }

                        resolved.insert(specifier.clone(), module);
                    } else {
                        eprintln!(
                            "Failed to resolve dependency source {} for {} of {}",
                            dep_code_linking_section.specifier, specifier, self.specifier
                        );
                    }
                } else {
                    // eprintln!("Missing code section for dependency: {}", specifier);
                }
            }

            self.dependencies.set_resolved(resolved).unwrap();

            global_packages
        } else {
            HashMap::new()
        }
    }

    pub fn lookup_import(&self, import: &str) -> Option<GraphModule> {
        self.dependencies
            .try_resolved()
            .map(|deps| deps.get(import).cloned())?
    }

    pub fn lookup_table(&self) -> Option<HashMap<String, GraphModule>> {
        self.dependencies.try_resolved().cloned()
    }

    pub async fn load_code(&self) -> Result<String, std::io::Error> {
        read_to_string(self.local.clone()).await
    }
}

#[derive(Debug)]
pub struct NPMImportSpecifier {
    specifier: Arc<ModuleSpecifier>,
    package: Arc<NPMPackage>,
}

impl NPMImportSpecifier {
    pub fn specifier(&self) -> Arc<ModuleSpecifier> {
        self.specifier.clone()
    }

    pub fn package(&self) -> Arc<NPMPackage> {
        self.package.clone()
    }

    pub fn subpath(&self) -> String {
        let mut first_has_at = false;

        self.specifier
            .path()
            .split('/')
            .enumerate()
            .filter_map(|(i, part)| {
                if i == 0 {
                    assert!(part.is_empty());
                    None
                } else if i == 1 {
                    first_has_at = part.starts_with('@');
                    None
                } else if i == 2 && first_has_at {
                    None
                } else {
                    Some(part)
                }
            })
            .collect::<Vec<_>>()
            .join("/")
    }
}

#[derive(Debug)]
pub struct NPMPackage {
    id: NPMPackageId,
    dependencies: DependencyLink<String, Arc<NPMPackage>>,
    registry_url: Url,
}

impl NPMPackage {
    fn from_package(package: info::NpmPackage) -> Arc<Self> {
        Arc::new(Self {
            id: NPMPackageId {
                name: package.name,
                version: package.version,
            },
            dependencies: DependencyLink::new(package.dependencies),
            registry_url: package.registry_url,
        })
    }

    pub fn id(&self) -> &NPMPackageId {
        &self.id
    }

    fn import_specifier(
        self: Arc<Self>,
        specifier: Arc<ModuleSpecifier>,
    ) -> Arc<NPMImportSpecifier> {
        Arc::new(NPMImportSpecifier {
            specifier,
            package: self,
        })
    }

    fn link(&self, resolve: impl Fn(&str) -> Option<Arc<NPMPackage>>) {
        if let Some(deps) = self.dependencies.take_raw() {
            let mut resolved = HashMap::new();

            for dep in deps.iter() {
                if let Some(module) = resolve(dep) {
                    resolved.insert(dep.clone(), module);
                } else {
                    eprintln!("Failed to resolve dependency {} from {}", dep, self.id);
                }
            }

            self.dependencies.set_resolved(resolved).unwrap();
        }
    }

    pub fn registry_url(&self) -> &Url {
        &self.registry_url
    }

    pub fn dependencies(&self) -> Vec<NPMPackageId> {
        self.dependencies
            .try_resolved()
            .map(|deps| deps.iter().map(|(_, v)| v.id().clone()).collect())
            .unwrap_or_default()
    }
}

#[derive(Debug)]
pub struct VirtualModule {
    specifier: Arc<ModuleSpecifier>,
}

impl VirtualModule {
    pub fn new(specifier: ModuleSpecifier) -> Self {
        Self {
            specifier: Arc::new(specifier),
        }
    }

    pub fn specifier(&self) -> Arc<ModuleSpecifier> {
        self.specifier.clone()
    }
}
