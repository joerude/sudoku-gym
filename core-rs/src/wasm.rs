//! JS bindings (feature "wasm"): grids go in as strings of 81 cells, steps come out as JSON text.

use crate::{parse, to_str, Cands, Grid, Step, MAX_CHAIN};
use wasm_bindgen::prelude::*;

fn grid(s: &str) -> Result<Grid, JsError> {
    parse(s).map_err(|e| JsError::new(&e.to_string()))
}

fn steps_json(steps: &[Step]) -> String {
    let items: Vec<String> = steps.iter().map(Step::to_json).collect();
    format!("[{}]", items.join(","))
}

#[wasm_bindgen(js_name = grade)]
pub fn grade_js(givens: &str) -> Result<u8, JsError> {
    Ok(crate::grade(&grid(givens)?))
}

#[wasm_bindgen(js_name = solve)]
pub fn solve_js(givens: &str) -> Result<Option<String>, JsError> {
    Ok(crate::solve(&grid(givens)?).map(|g| to_str(&g)))
}

#[wasm_bindgen(js_name = countSolutions)]
pub fn count_solutions_js(givens: &str, limit: u32) -> Result<u32, JsError> {
    Ok(crate::count_solutions(&grid(givens)?, limit))
}

#[wasm_bindgen(js_name = candidates)]
pub fn candidates_js(g: &str) -> Result<Vec<u16>, JsError> {
    Ok(crate::candidates(&grid(g)?).to_vec())
}

#[wasm_bindgen(js_name = easiestSteps)]
pub fn easiest_steps_js(g: &str) -> Result<String, JsError> {
    Ok(steps_json(&crate::easiest_steps(&crate::candidates(&grid(g)?))))
}

#[wasm_bindgen(js_name = chainStep)]
pub fn chain_step_js(cands: &[u16]) -> Result<String, JsError> {
    let c: Cands = cands
        .try_into()
        .map_err(|_| JsError::new(&format!("нужно 81 маску кандидатов, получено {}", cands.len())))?;
    if let Some(i) = c.iter().position(|&m| m & !0x3FE != 0) {
        return Err(JsError::new(&format!("маска кандидатов {i}: только цифры 1–9")));
    }
    Ok(crate::chain_step(&c, MAX_CHAIN).map_or("null".into(), |s| s.to_json()))
}
