export const svgNamespace = 'http://www.w3.org/2000/svg';
export const definitionTags = new Set('defs linearGradient radialGradient clipPath mask pattern marker symbol filter'.split(' '));
export const filterTags = new Set('feGaussianBlur feDropShadow feOffset feFlood feComposite feBlend feColorMatrix feMerge feMergeNode feComponentTransfer feFuncR feFuncG feFuncB feFuncA feMorphology feTurbulence feDisplacementMap feTile'.split(' '));
export const svgTags = new Set([
  ...'svg g path rect circle ellipse line polygon polyline stop text tspan textPath image use title desc'.split(' '),
  ...definitionTags, ...filterTags,
]);

export const svgAttributes = new Set((
  'id data-name data-locked data-fold-group transform viewBox x y x1 y1 x2 y2 cx cy r rx ry width height d points pathLength ' +
  'fill fill-rule fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset ' +
  'opacity color display visibility overflow clip-path clip-rule clipPathUnits mask mask-type maskUnits maskContentUnits ' +
  'gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity fx fy fr patternUnits patternContentUnits patternTransform ' +
  'marker-start marker-mid marker-end markerUnits markerWidth markerHeight refX refY orient vector-effect paint-order ' +
  'font-family font-size font-weight font-style font-stretch text-anchor text-decoration letter-spacing word-spacing dx dy rotate ' +
  'textLength lengthAdjust startOffset method spacing side dominant-baseline alignment-baseline baseline-shift direction writing-mode ' +
  'xml:space xml:lang href xlink:href preserveAspectRatio shape-rendering text-rendering image-rendering color-interpolation color-interpolation-filters ' +
  'filter filterUnits primitiveUnits in in2 result stdDeviation edgeMode flood-color flood-opacity operator k1 k2 k3 k4 ' +
  'mode type values radius baseFrequency numOctaves seed stitchTiles scale xChannelSelector yChannelSelector tableValues slope intercept amplitude exponent'
).split(/\s+/));

export const presentationProperties = new Set((
  'x y cx cy r rx ry width height fill fill-rule fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin ' +
  'stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color display visibility overflow clip-path clip-rule mask mask-type ' +
  'stop-color stop-opacity marker-start marker-mid marker-end vector-effect paint-order font-family font-size font-weight font-style ' +
  'font-stretch text-anchor text-decoration letter-spacing word-spacing dominant-baseline alignment-baseline baseline-shift direction ' +
  'writing-mode shape-rendering text-rendering image-rendering color-interpolation color-interpolation-filters filter flood-color flood-opacity'
).split(/\s+/));
export const cssOnlyProperties = new Set((
  'transform transform-box transform-origin mix-blend-mode isolation white-space unicode-bidi font-kerning font-feature-settings ' +
  'font-variant-caps font-variant-ligatures text-decoration-line text-decoration-color text-decoration-style text-decoration-thickness ' +
  'white-space-collapse text-wrap-mode text-wrap-style line-height font-size-adjust font-optical-sizing font-variation-settings ' +
  'font-variant-numeric font-variant-east-asian font-variant-alternates font-variant-position font-variant-emoji font-language-override ' +
  'font-synthesis font-synthesis-small-caps font-synthesis-style font-synthesis-weight font-synthesis-position'
).split(/\s+/));

const idPattern = '[\\p{L}\\p{N}_.:-]+';
export const svgId = new RegExp(`^${idPattern}$`, 'u');
const localUrl = new RegExp(`^url\\(\\s*(['"]?)#(${idPattern})\\1\\s*\\)(?:\\s+(.+))?$`, 'iu');
const referenceProperties = new Set('fill stroke clip-path mask filter marker-start marker-mid marker-end'.split(' '));
const referenceOnly = new Set([...referenceProperties].filter(key => key !== 'fill' && key !== 'stroke'));
const hrefTags = new Set('use textPath linearGradient radialGradient pattern'.split(' '));
const inlineImage = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-zA-Z0-9+/=\s]+$/i;
const filterFunction = /^(?:(?:blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia)\([^()]*\)|drop-shadow\((?:[^()]|(?:rgba?|hsla?)\([^()]*\))*\))\s*/i;

export function normalizeSvgValue(tag, key, value) {
  if (key === 'href' || key === 'xlink:href') return validSvgHref(tag, value) ? value : null;
  // Names are plain metadata, escaped by the SVG serializer and rendered as text.
  if(key==='data-name'){
    if(typeof value!=='string'||value.length>8e6||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))return null;
    return value.trim();
  }
  if (typeof value !== 'string' || value.length > 8e6 ||
      /[\\<>{};\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return null;
  value = value.trim();
  if (key === 'id') return svgId.test(value) ? value : null;
  const ref = value.match(localUrl);
  if (ref) {
    if (!referenceProperties.has(key) || (ref[3] && (referenceOnly.has(key) ||
        /url\s*\(|\b(?:var|env|attr|image|paint)\s*\(/i.test(ref[3])))) return null;
    return `url(#${ref[2]})${ref[3] ? ' ' + ref[3] : ''}`;
  }
  if (/\b(?:url|src|image-set|image|cross-fade|paint|expression|var|env|attr)\s*\(/i.test(value)) return null;
  if(key==='filter'){
    let remaining=value;
    while(remaining.match(filterFunction))remaining=remaining.replace(filterFunction,'');
    if(!remaining)return value;
  }
  if (referenceOnly.has(key) && !/^(?:none|inherit|initial|unset)$/i.test(value)) return null;
  return value;
}

export function validSvgHref(tag, value) {
  if (typeof value !== 'string' || value.length > 8e6) return false;
  if (tag === 'image') return inlineImage.test(value);
  return hrefTags.has(tag) && value.startsWith('#') && svgId.test(value.slice(1));
}

export function svgReference(key, value) {
  if ((key === 'href' || key === 'xlink:href') && value.startsWith('#')) return value.slice(1);
  return value.match(localUrl)?.[2];
}
