struct Uniforms {
    object_to_clip: mat4x4<f32>,
    object_to_light: mat4x4<f32>,
    normal_to_light: mat3x3<f32>,
    viewPos: vec3<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var t_diffuse: texture_2d<f32>;
@group(0) @binding(2) var s_diffuse: sampler;

struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) texCoord: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) shadingNormal: vec3<f32>,
    @location(1) texCoord: vec2<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = uniforms.object_to_clip * in.position;
    let normal_mat4 = mat4x4<f32>(
        vec4<f32>(uniforms.normal_to_light[0], 0.0),
        vec4<f32>(uniforms.normal_to_light[1], 0.0),
        vec4<f32>(uniforms.normal_to_light[2], 0.0),
        vec4<f32>(0.0, 0.0, 0.0, 1.0)
    );
    out.shadingNormal = (normal_mat4 * vec4<f32>(in.normal, 0.0)).xyz;
    out.texCoord = in.texCoord;
    return out;
}

struct FragmentOutput {
    @location(0) color: vec4<f32>,
    @location(1) control: vec4<f32>,
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var out: FragmentOutput;
    let sun_color = vec3<f32>(0.5, 0.5, 0.5);
    let sun_direction = normalize(vec3<f32>(0.5, 0.3, 1.0));
    let sky_color = vec3<f32>(0.2, 0.2, 0.2);
    let sky_direction = vec3<f32>(0.0, 0.0, 1.0);

    var total_light = vec3<f32>(0.0, 0.0, 0.0);
    let n = normalize(in.shadingNormal);

    let nl_sky = 0.5 + 0.5 * dot(n, sky_direction);
    total_light += nl_sky * sky_color;

    let nl_sun = max(0.0, dot(n, sun_direction));
    total_light += nl_sun * sun_color;

    out.color = textureSample(t_diffuse, s_diffuse, in.texCoord) * vec4<f32>(total_light, 1.0);
    out.color.a = 1.0;
    out.control = vec4<f32>(0.0, 0.5, 0.0, 0.0);
    
    return out;
}