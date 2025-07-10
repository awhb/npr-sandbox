@group(0) @binding(0) var color_tex: texture_2d<f32>;
@group(0) @binding(1) var control_tex: texture_2d<f32>;
@group(0) @binding(2) var blurred_tex: texture_2d<f32>;
@group(0) @binding(3) var bleeded_tex: texture_2d<f32>;
@group(0) @binding(4) var surface_tex: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) in_vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(in_vertex_index & 1u) * 4.0 - 1.0;
    let y = f32(in_vertex_index & 2u) * 2.0 - 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    return out;
}

fn pow_col(base: vec4<f32>, exp: f32) -> vec4<f32> {
    return vec4<f32>(pow(base.r, exp), pow(base.g, exp), pow(base.b, exp), 1.0);
}

fn max_col(col: vec4<f32>) -> f32 {
    return max(0.0, max(col.r, max(col.g, col.b)));
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let fragPos = vec2<i32>(fragCoord.xy);
    let surfaceColor = textureLoad(surface_tex, fragPos, 0);
    
    // Paper distortion
    let shift_amt = surfaceColor.gb * 10.0; // Scaled for effect
    let shiftedCoord = vec2<i32>(fragCoord.xy + shift_amt);

    let controlColor = textureLoad(control_tex, shiftedCoord, 0);
    let colorColor = textureLoad(color_tex, shiftedCoord, 0);
    let blurredColor = textureLoad(blurred_tex, shiftedCoord, 0);
    let bleededColor = textureLoad(bleeded_tex, shiftedCoord, 0);

    // Color bleeding
    let colorBleed = controlColor.b * (bleededColor - colorColor) + colorColor;
    
    // Edge darkening
    let blurDif = blurredColor - colorColor;
    let maxVal = max_col(blurDif);
    let exp = 1.0 + (1.0 - controlColor.b) * maxVal * 5.0; 
    let edgeDarkening = pow_col(colorBleed, exp);

    // Paper granulation
    let saturation = edgeDarkening;
    let paperHeight = surfaceColor.r;
    let tint = surfaceColor.a;
    let Piv = 0.5 * (1.0 - paperHeight);
    let ctrl_g = textureLoad(control_tex, shiftedCoord, 0).g;
    let density_amount = 2.0;

    let granulated = saturation * (saturation - ctrl_g * density_amount * Piv) + (1.0 - saturation) * pow_col(saturation, 1.0 + (ctrl_g * density_amount * Piv));
    var final_out = granulated * tint;
    final_out.a = 1.0;
    
    return final_out;
}