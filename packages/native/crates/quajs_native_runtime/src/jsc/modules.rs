//! Parse ESM with SWC and lower to System.register for the public JSC C API.
//! Resolution is confined to the already validated QPK graph and official
//! helpers. There is no filesystem, URL, Node, or implicit fetch resolver.
use super::{
    value::{Context, Error, Object, Result, Value},
    JscEvaluationRequest,
};
use std::collections::BTreeMap;
use swc_common::{sync::Lrc, FileName, Globals, Mark, SourceMap, GLOBALS};
use swc_ecma_ast::{ModuleDecl, ModuleItem, Pass, Program};
use swc_ecma_parser::{lexer::Lexer, EsSyntax, Parser, StringInput, Syntax};
use swc_ecma_transforms_base::{fixer::fixer, hygiene::hygiene, resolver};
use swc_ecma_transforms_module::{path::Resolver, system_js::system_js};

fn compile(source: &str, name: &str) -> Result<String> {
    GLOBALS.set(&Globals::new(), || {
        let cm: Lrc<SourceMap> = Default::default();
        let file = cm.new_source_file(FileName::Custom(name.into()).into(), source.to_owned());
        let lexer = Lexer::new(
            Syntax::Es(EsSyntax::default()),
            Default::default(),
            StringInput::from(&*file),
            None,
        );
        let mut parser = Parser::new_from(lexer);
        let module = parser
            .parse_module()
            .map_err(|e| Error::JavaScript(format!("{name}: {:?}", e.kind())))?;
        if let Some(e) = parser.take_errors().first() {
            return Err(Error::JavaScript(format!("{name}: {:?}", e.kind())));
        }
        for item in &module.body {
            let attributes = match item {
                ModuleItem::ModuleDecl(ModuleDecl::Import(decl)) => decl.with.is_some(),
                ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(decl)) => decl.with.is_some(),
                ModuleItem::ModuleDecl(ModuleDecl::ExportAll(decl)) => decl.with.is_some(),
                _ => false,
            };
            if attributes {
                return Err(Error::JavaScript(format!(
                    "{name}: native modules do not support import attributes"
                )));
            }
        }
        let mut program = Program::Module(module);
        let unresolved = Mark::new();
        resolver(unresolved, Mark::new(), false).process(&mut program);
        system_js(Resolver::Default, unresolved, Default::default()).process(&mut program);
        hygiene().process(&mut program);
        fixer(None).process(&mut program);
        Ok(swc_ecma_codegen::to_code_default(cm, None, &program))
    })
}

pub(super) fn evaluate_module(
    ctx: &Context,
    request: &JscEvaluationRequest,
    helper_source: fn(&str) -> Option<String>,
) -> Result<Object> {
    let mut sources = BTreeMap::new();
    sources.insert(
        request.module.asset_name.clone(),
        request.module.code.clone(),
    );
    for module in &request.module_graph {
        sources.insert(module.asset_name.clone(), module.code.clone());
    }
    // The catalog is fixed by the signed host. Compile helpers once, rather
    // than inspecting source strings (escaped ESM specifiers are legal).
    static BUILTINS: std::sync::OnceLock<BTreeMap<String, String>> = std::sync::OnceLock::new();
    let builtins = BUILTINS.get_or_init(|| {
        HELPERS
            .iter()
            .filter_map(|name| {
                helper_source(name).map(|code| {
                    (
                        name.to_string(),
                        compile(&code, name).expect("host helper ESM"),
                    )
                })
            })
            .collect()
    });
    let mut compiled = builtins.clone();
    for (name, source) in &sources {
        compiled.insert(name.clone(), compile(source, name)?);
    }
    let mut script = String::from("(() => {\n");
    script.push_str(include_str!("module-loader.js"));
    for (name, source) in &compiled {
        // Function-created code has only the real global scope and the fixed
        // registration API. Inlining it in the loader closure would expose
        // records/resolve/evaluate as unintended module globals.
        script.push_str("\nFunction('System', ");
        script.push_str(&serde_json::to_string(source).unwrap());
        script.push_str(")(Object.freeze({ register: (deps, declare) => register(");
        script.push_str(&serde_json::to_string(name).unwrap());
        script.push_str(", deps, declare) }));\n");
    }
    script.push_str("return evaluate(");
    script.push_str(&serde_json::to_string(&request.module.asset_name).unwrap());
    script.push_str("); })()");
    let value: Value = ctx.eval_source(&script, &request.module.asset_name)?;
    match value.as_promise() {
        Some(promise) => promise.finish::<Object>(),
        None => value
            .into_object()
            .ok_or_else(|| Error::JavaScript("Missing module namespace".into())),
    }
}

const HELPERS: &[&str] = &[
    "@quajs/engine",
    "@quajs/character",
    "@quajs/character/animation",
    "@quajs/plugin-achievement",
    "@quajs/plugin-animation",
    "@quajs/plugin-audio",
    "@quajs/plugin-background",
    "@quajs/plugin-backlog",
    "@quajs/plugin-gallery",
    "@quajs/plugin-inventory",
    "@quajs/story-graph",
];
