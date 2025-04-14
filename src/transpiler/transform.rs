use std::sync::Arc;

use swc_core::atoms::Atom;
use swc_core::common::comments::SingleThreadedComments;
use swc_core::common::sync::Lrc;
use swc_core::common::{FileName, GLOBALS, Globals, Mark, SourceMap};
use swc_core::ecma::ast::{self, Ident, Pass, Program, Str};
use swc_core::ecma::codegen::Emitter;
use swc_core::ecma::codegen::text_writer::JsWriter;
use swc_core::ecma::parser::lexer::Lexer;
use swc_core::ecma::parser::{Parser, StringInput, Syntax, TsSyntax};
use swc_core::ecma::transforms::base::fixer::fixer;
use swc_core::ecma::transforms::base::{hygiene::hygiene, resolver};
use swc_core::ecma::transforms::typescript::strip;
use swc_core::ecma::visit::{Fold, FoldWith};

struct TestVisitor {
    // old_name: String,
    // new_name: String,
}

impl Fold for TestVisitor {
    // fn fold_ident(&mut self, ident: Ident) -> Ident {
    //     if ident.sym == *self.old_name {
    //         Ident {
    //             sym: self.new_name.clone().into(),
    //             ..ident
    //         }
    //     } else {
    //         ident
    //     }
    // }

    // fn fold_import(&mut self, node: ast::Import) -> ast::Import {
    //     println!("Import: {:?}", node);
    //     node.fold_children_with(self)
    // }

    // fn fold_import_specifier(&mut self, node: ast::ImportSpecifier) -> ast::ImportSpecifier {
    //     println!("Import Specifier: {:?}", node);
    //     node.fold_children_with(self)
    // }

    fn fold_import_decl(&mut self, mut node: ast::ImportDecl) -> ast::ImportDecl {
        println!("Import Decl: {:?}", node);

        let redirect = "foo";

        // let from = Atom::from(redirect);

        // node.src = Box::new(Str::from_tpl_raw(redirect).into());

        node.src.raw = None;
        node.src.value = Atom::from(redirect);

        node.fold_children_with(self)
    }
}

pub fn transform(code: &str) {
    let start = std::time::Instant::now();

    let cm = Arc::new(SourceMap::default());

    let fm = cm.new_source_file(Lrc::new(FileName::Anon), code.into());

    let comments = SingleThreadedComments::default();

    let lexer = Lexer::new(
        Syntax::Typescript(TsSyntax {
            tsx: true,
            ..Default::default()
        }),
        Default::default(),
        StringInput::from(&*fm),
        Some(&comments),
    );
    let mut parser = Parser::new_from(lexer);

    let mut module = parser.parse_program().expect("Failed to parse module");

    GLOBALS.set(&Default::default(), || {
        let top_level_mark = Mark::new();
        let unresolved_mark = Mark::new();

        module = module.fold_with(&mut TestVisitor {});

        // Conduct identifier scope analysis
        module = module.apply(resolver(unresolved_mark, top_level_mark, true));

        // Remove typescript types
        module = module.apply(strip(unresolved_mark, top_level_mark));

        // Fix up any identifiers with the same name, but different contexts
        module = module.apply(hygiene());

        // Ensure that we have enough parenthesis.
        module = module.apply(fixer(Some(&comments)));

        let mut buf = Vec::new();
        let mut sourcemap = Vec::new();
        {
            let writer = Box::new(JsWriter::new(
                cm.clone(),
                "\n",
                &mut buf,
                Some(&mut sourcemap),
            ));
            let mut emitter = Emitter {
                cfg: Default::default(),
                cm: cm.clone(),
                comments: None,
                wr: writer,
            };

            emitter
                .emit_program(&module)
                .expect("Failed to emit module");
        }

        {
            let sm = cm.build_source_map(&sourcemap).to_data_url().unwrap();
            println!("Source map: {}", sm);
        }

        // Print the modified JavaScript code
        let modified_code = String::from_utf8(buf).expect("Invalid UTF-8");
        let duration = start.elapsed();
        println!("Time taken: {:?}", duration);

        // println!("Modified code:\n{}", modified_code);
    });
}
