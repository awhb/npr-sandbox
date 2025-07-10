@group(0) @binding(0) var paper_tex: texture_2d<f32>;
@group(0) @binding(1) var s_paper: sampler;

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

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let tex_dims = vec2<f32>(textureDimensions(paper_tex));
    let texCoord = fragCoord.xy / tex_dims;
    let paperColor = textureSample(paper_tex, s_paper, texCoord);
    let paperHeight = paperColor.r;

    // Use derivatives to calculate normal from height map
    let n_x = dpdx(paperHeight);
    let n_y = dpdy(paperHeight);
    let n = normalize(vec3<f32>(-n_x, -n_y, 1.0));

    let l = normalize(vec3<f32>(1.0, 1.0, 1.0));
    var nl = (dot(n, l) + 1.0) / 2.0;
    nl = mix(-0.3, 1.3, nl);
    
    return vec4<f32>(paperHeight, 0.5 * n.xy + 0.5, nl);
}