use std::path::PathBuf;
use std::sync::Arc;

use path_clean::PathClean;
use serde::Serialize;
use static_assertions::assert_impl_all;
use swc_core::atoms::Atom;
use swc_core::common::comments::{Comment, CommentKind, Comments, SingleThreadedComments};
use swc_core::common::sync::Lrc;
use swc_core::common::{BytePos, DUMMY_SP, FileName, GLOBALS, Mark, SourceMap, Spanned};
use swc_core::ecma::ast::{ModuleDecl, Str};
use swc_core::ecma::codegen::Emitter;
use swc_core::ecma::codegen::text_writer::JsWriter;
use swc_core::ecma::parser::lexer::Lexer;
use swc_core::ecma::parser::{Parser, StringInput, Syntax, TsSyntax};
use swc_core::ecma::transforms::base::fixer::fixer;
use swc_core::ecma::transforms::base::{hygiene::hygiene, resolver};
use swc_core::ecma::transforms::react::{Options, RefreshOptions, Runtime, react};
use swc_core::ecma::transforms::typescript::strip;
use swc_core::ecma::visit::{Fold, FoldWith};
use swc_prefresh::PrefreshPluginConfig;
use urlencoding::encode;

use crate::graph::{ESMGraphModule, GraphModule, ModuleGraph};
use crate::specifier::ModuleSpecifier;

fn safe_strip_prefix(path: &PathBuf, base: &PathBuf) -> Option<PathBuf> {
    let clean_path = path.clean();
    let clean_base = base.clean();

    if !clean_path.starts_with(&clean_base) {
        return None;
    }

    clean_path
        .strip_prefix(&clean_base)
        .ok()
        .map(|p| p.to_path_buf())
}

// #[test]
// fn test() {
//     let path = PathBuf::from("D:\\dev\\technik-app\\frontend\\app\\App.tsx");
//     let base = PathBuf::from("D:\\dev\\technik-app");

//     let result = safe_strip_prefix(&path, &base);
//     assert_eq!(result, Some(PathBuf::from("frontend\\app\\App.tsx")));
// }

struct ImportResolver {
    graph: Arc<ModuleGraph>,
    module: Arc<ESMGraphModule>,
    comments: Arc<SingleThreadedComments>,
    // root_dir: Arc<PathBuf>,
}

impl ImportResolver {
    fn resolve_import(&self, src: &mut Box<Str>, span_hi: BytePos) {
        let import_path = src.value.as_str();

        let mut resolved = self.module.lookup_import(import_path);

        if resolved.is_none() {
            println!(
                "Trying to resolve import {} with global packages",
                import_path
            );
            resolved = self.graph.global_package_imports.get(import_path).cloned();
        }

        let import_comment: Vec<String> = vec![format!(" import \"{}\";", import_path)];

        let import_string = if let Some(resolved) = resolved {
            match resolved {
                GraphModule::Esm(module) => {
                    let specifier: Arc<ModuleSpecifier> = module.specifier();

                    match specifier.scheme() {
                        "file" => {
                            if let Ok(path) = specifier.to_file_path() {
                                if let Some(relative) =
                                    safe_strip_prefix(&path, &self.graph.root_dir)
                                {
                                    format!("/{}", relative.to_string_lossy().replace("\\", "/"))
                                } else {
                                    format!(
                                        "/@module/{}",
                                        encode(&specifier.to_string().replace("\\", "/"))
                                    )
                                }
                            } else {
                                "/@module/error/invalid-file-url".to_string()
                            }
                        }
                        "http" | "https" => {
                            format!("/@module/{}", encode(specifier.as_str()))
                        }
                        _ => format!(
                            "/@module/error/{}",
                            encode("Unsupported scheme for ESM Import")
                        ),
                    }
                }
                GraphModule::Npm(module) => {
                    let package = module.package();
                    let subpath = module.subpath();
                    if subpath.is_empty() {
                        format!(
                            "/@npm/{}/{}",
                            encode(&package.id().name),
                            package.id().version,
                        )
                    } else {
                        format!(
                            "/@npm/{}/{}/{}",
                            encode(&package.id().name),
                            package.id().version,
                            encode(&subpath)
                        )
                    }
                }
                GraphModule::Virtual(module) => {
                    format!(
                        "/@module/{}",
                        encode(&module.specifier().to_string().replace("\\", "/"))
                    )
                }
            }

            // let specifier: Arc<ModuleSpecifier> = resolved.specifier();

            // match specifier.scheme() {
            //     "file" => {
            //         if let Ok(path) = specifier.to_file_path() {
            //             if let Some(relative) = safe_strip_prefix(&path, &self.graph.root_dir) {
            //                 format!("/{}", relative.to_string_lossy().replace("\\", "/"))
            //             } else {
            //                 format!(
            //                     "/@module/{}",
            //                     encode(&specifier.to_string().replace("\\", "/"))
            //                 )
            //             }
            //         } else {
            //             "/@module/error/invalid-file-url".to_string()
            //         }
            //     }
            //     "http" | "https" => {
            //         format!("/@module/{}", encode(specifier.as_str()))
            //     }
            //     "npm" => {
            //         format!("/@npm/{}", encode(&specifier.path()[1..]))
            //     }
            //     _ => "/@module/error/unsupported-scheme".to_string(),
            // }
        } else {
            format!(
                "/@module/error/{}",
                encode(&format!("Failed to resolve import {}", import_path))
            )
        };

        src.raw = None;
        src.value = Atom::from(import_string);

        self.comments.add_trailing(
            span_hi,
            Comment {
                kind: CommentKind::Line,
                span: DUMMY_SP,
                text: import_comment.join(" ").into(),
            },
        );
    }
}

impl Fold for ImportResolver {
    fn fold_module_decl(&mut self, mut node: ModuleDecl) -> ModuleDecl {
        match &mut node {
            ModuleDecl::Import(import_decl) => {
                let span = import_decl.span_hi();
                self.resolve_import(&mut import_decl.src, span);
            }
            ModuleDecl::ExportAll(export_all) => {
                let span = export_all.span_hi();
                self.resolve_import(&mut export_all.src, span);
            }
            ModuleDecl::ExportNamed(named_export) => {
                let span = named_export.span_hi();
                if let Some(src) = &mut named_export.src {
                    self.resolve_import(src, span);
                }
            }
            // These do not contain an import path
            ModuleDecl::ExportDecl(_) | ModuleDecl::ExportDefaultDecl(_) => {}
            rem => {
                println!("Module Decl: {:?}, Ctx: {}", rem, self.module.specifier());
            }
        }

        node.fold_children_with(self)
    }
}

#[derive(Debug)]
pub struct TransformOptions {
    pub code: String,
    pub hmr: bool,
    pub graph: Arc<ModuleGraph>,
    pub module: Arc<ESMGraphModule>,
    // pub root_dir: Arc<PathBuf>,
}

assert_impl_all!(TransformOptions: Send, Sync);

#[derive(Debug, Serialize)]
pub struct TransformResult {
    pub code: String,
    pub source_map: String,
}

assert_impl_all!(TransformResult: Send, Sync);

pub fn transform_code(options: TransformOptions) -> TransformResult {
    let source_map = Arc::new(SourceMap::default());

    let source_file = source_map.new_source_file(
        Lrc::new(FileName::Url(options.module.specifier().as_ref().clone())),
        options.code,
    );

    let comments = Arc::new(SingleThreadedComments::default());

    let lexer = Lexer::new(
        Syntax::Typescript(TsSyntax {
            tsx: true,
            ..Default::default()
        }),
        Default::default(),
        StringInput::from(&*source_file),
        Some(&comments),
    );
    let mut parser = Parser::new_from(lexer);

    let mut program = parser.parse_program().expect("Failed to parse module");

    let mut result = None;

    let globals = Default::default();

    // globals;

    GLOBALS.set(&globals, || {
        let top_level_mark = Mark::new();
        let unresolved_mark = Mark::new();

        program = program.apply(resolver(unresolved_mark, top_level_mark, true));

        program = program.apply(strip(unresolved_mark, top_level_mark));

        program = program.apply(react(
            source_map.clone(),
            Some(&comments),
            Options {
                import_source: Some("preact".into()),
                runtime: Some(Runtime::Automatic),
                development: Some(options.hmr),
                refresh: if options.hmr {
                    Some(RefreshOptions::default())
                } else {
                    None
                },
                ..Default::default()
            },
            top_level_mark,
            unresolved_mark,
        ));

        let program_span_lo = program.span_lo();
        program = program.apply(swc_prefresh::swc_prefresh(
            PrefreshPluginConfig::default(),
            format!(
                "{:x}",
                source_map.lookup_char_pos(program_span_lo).file.src_hash
            ),
        ));

        if options
            .module
            .specifier()
            .path()
            .to_string()
            .ends_with("logtape/mod.ts")
        {
            // dbg!(&program);
        }

        program = program.fold_with(&mut ImportResolver {
            module: options.module.clone(),
            graph: options.graph.clone(),
            comments: comments.clone(),
        });

        program = program.apply(hygiene());

        program = program.apply(fixer(Some(&comments)));

        let mut output_buffer = Vec::new();
        let mut output_mapping = Vec::new();

        Emitter {
            cfg: Default::default(),
            cm: source_map.clone(),
            comments: Some(&comments),
            wr: Box::new(JsWriter::new(
                source_map.clone(),
                "\n",
                &mut output_buffer,
                Some(&mut output_mapping),
            )),
        }
        .emit_program(&program)
        .expect("Failed to emit module");

        let sm = source_map
            .build_source_map(&output_mapping)
            .to_data_url()
            .unwrap();

        output_buffer.extend_from_slice(b"\n//# sourceMappingURL=");
        output_buffer.extend_from_slice(sm.as_bytes());

        let modified_code = String::from_utf8(output_buffer).expect("Invalid UTF-8");

        result = Some(TransformResult {
            code: modified_code,
            source_map: sm,
        });
    });

    result.unwrap()
}

// #[test]
// fn test() {
// assert!(!PathBuf::from("/foo/bar/../baz").starts_with("/foo/bar"));
// }
