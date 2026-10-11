/** Imported by Creator's shader compiler; no runtime shader compilation or JS loading. */
export const CREATOR_PROJECTION_EFFECT = `CCEffect %{
  techniques:
  - passes:
    - vert: qua-vs:vert
      frag: qua-fs:frag
      depthStencilState: { depthTest: false, depthWrite: false }
      blendState:
        targets:
        - { blend: true, blendSrc: src_alpha, blendDst: one_minus_src_alpha, blendDstAlpha: one_minus_src_alpha }
      rasterizerState: { cullMode: none }
      properties:
        ambient: { value: [1, 1, 1, 1] }
        shade: { value: [1, 1, 1, 1] }
        shadeLine: { value: [0, 0, 1, 1] }
        tone: { value: [1, 1, 1, 0] }
        blurStep: { value: [0, 0, 0, 0] }
}%
CCProgram qua-vs %{
  precision highp float;
  #include <builtin/uniforms/cc-global>
  #if USE_LOCAL
    #include <builtin/uniforms/cc-local>
  #endif
  #if SAMPLE_FROM_RT
    #include <common/common-define>
  #endif
  in vec3 a_position;
  in vec2 a_texCoord;
  in vec4 a_color;
  out vec2 uv0;
  out vec4 color;
  vec4 vert () {
    vec4 p = vec4(a_position, 1.0);
    #if USE_LOCAL
      p = cc_matWorld * p;
    #endif
    uv0 = a_texCoord;
    #if SAMPLE_FROM_RT
      CC_HANDLE_RT_SAMPLE_FLIP(uv0);
    #endif
    color = a_color;
    return cc_matViewProj * p;
  }
}%
CCProgram qua-fs %{
  precision highp float;
  #include <builtin/internal/embedded-alpha>
  in vec2 uv0;
  in vec4 color;
  #pragma builtin(local)
  layout(set = 2, binding = 12) uniform sampler2D cc_spriteTexture;
  uniform QuaProjection {
    vec4 ambient;
    vec4 shade;
    vec4 shadeLine;
    vec4 tone;
    vec4 blurStep;
  };
  vec4 frag () {
    vec4 o = CCSampleWithAlphaSeparated(cc_spriteTexture, uv0);
    if (blurStep.x > 0.0 || blurStep.y > 0.0) {
      o = vec4(0.0);
      float total = 0.0;
      for (int y = -4; y <= 4; ++y) {
        for (int x = -4; x <= 4; ++x) {
          vec2 offset = vec2(float(x), float(y)) * 0.75;
          float weight = exp(-dot(offset, offset) * 0.5);
          o += CCSampleWithAlphaSeparated(cc_spriteTexture, uv0 + offset * blurStep.xy) * weight;
          total += weight;
        }
      }
      o /= total;
    }
    vec2 d = shadeLine.zw - shadeLine.xy;
    float t = clamp(dot(uv0 - shadeLine.xy, d) / max(dot(d, d), 0.000001), 0.0, 1.0);
    o.rgb = clamp(o.rgb * ambient.rgb * mix(vec3(1.0), shade.rgb, t), 0.0, 1.0);
    o.rgb = (o.rgb * tone.x - 0.5) * tone.y + 0.5;
    float luma = dot(o.rgb, vec3(0.2126, 0.7152, 0.0722));
    o.rgb = mix(vec3(luma), o.rgb, tone.z);
    o.rgb = mix(o.rgb, vec3(luma), tone.w);
    return o * color;
  }
}%
`
