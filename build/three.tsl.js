/**
 * @license
 * Copyright 2010-2025 Three.js Authors
 * SPDX-License-Identifier: MIT
 */
import { TSL } from 'three/webgpu';

const BRDF_GGX = TSL.BRDF_GGX;
const BRDF_Lambert = TSL.BRDF_Lambert;
const BasicShadowFilter = TSL.BasicShadowFilter;
const Break = TSL.Break;
const Continue = TSL.Continue;
const DFGApprox = TSL.DFGApprox;
const D_GGX = TSL.D_GGX;
const Discard = TSL.Discard;
const EPSILON = TSL.EPSILON;
const F_Schlick = TSL.F_Schlick;
const Fn = TSL.Fn;
const INFINITY = TSL.INFINITY;
const If = TSL.If;
const Loop = TSL.Loop;
const NodeShaderStage = TSL.NodeShaderStage;
const NodeType = TSL.NodeType;
const NodeUpdateType = TSL.NodeUpdateType;
const NodeAccess = TSL.NodeAccess;
const PCFShadowFilter = TSL.PCFShadowFilter;
const PCFSoftShadowFilter = TSL.PCFSoftShadowFilter;
const PI = TSL.PI;
const PI2 = TSL.PI2;
const Return = TSL.Return;
const Schlick_to_F0 = TSL.Schlick_to_F0;
const ScriptableNodeResources = TSL.ScriptableNodeResources;
const ShaderNode = TSL.ShaderNode;
const TBNViewMatrix = TSL.TBNViewMatrix;
const VSMShadowFilter = TSL.VSMShadowFilter;
const V_GGX_SmithCorrelated = TSL.V_GGX_SmithCorrelated;
const abs = TSL.abs;
const acesFilmicToneMapping = TSL.acesFilmicToneMapping;
const acos = TSL.acos;
const add = TSL.add;
const addNodeElement = TSL.addNodeElement;
const agxToneMapping = TSL.agxToneMapping;
const all = TSL.all;
const alphaT = TSL.alphaT;
const and = TSL.and;
const anisotropy = TSL.anisotropy;
const anisotropyB = TSL.anisotropyB;
const anisotropyT = TSL.anisotropyT;
const any = TSL.any;
const append = TSL.append;
const arrayBuffer = TSL.arrayBuffer;
const asin = TSL.asin;
const assign = TSL.assign;
const atan = TSL.atan;
const atan2 = TSL.atan2;
const atomicAdd = TSL.atomicAdd;
const atomicAnd = TSL.atomicAnd;
const atomicFunc = TSL.atomicFunc;
const atomicMax = TSL.atomicMax;
const atomicMin = TSL.atomicMin;
const atomicOr = TSL.atomicOr;
const atomicStore = TSL.atomicStore;
const atomicSub = TSL.atomicSub;
const atomicXor = TSL.atomicXor;
const attenuationColor = TSL.attenuationColor;
const attenuationDistance = TSL.attenuationDistance;
const attribute = TSL.attribute;
const attributeArray = TSL.attributeArray;
const backgroundBlurriness = TSL.backgroundBlurriness;
const backgroundIntensity = TSL.backgroundIntensity;
const backgroundRotation = TSL.backgroundRotation;
const batch = TSL.batch;
const billboarding = TSL.billboarding;
const bitAnd = TSL.bitAnd;
const bitNot = TSL.bitNot;
const bitOr = TSL.bitOr;
const bitXor = TSL.bitXor;
const bitangentGeometry = TSL.bitangentGeometry;
const bitangentLocal = TSL.bitangentLocal;
const bitangentView = TSL.bitangentView;
const bitangentWorld = TSL.bitangentWorld;
const bitcast = TSL.bitcast;
const blendBurn = TSL.blendBurn;
const blendColor = TSL.blendColor;
const blendDodge = TSL.blendDodge;
const blendOverlay = TSL.blendOverlay;
const blendScreen = TSL.blendScreen;
const blur = TSL.blur;
const bool = TSL.bool;
const buffer = TSL.buffer;
const bufferAttribute = TSL.bufferAttribute;
const bumpMap = TSL.bumpMap;
const burn = TSL.burn;
const bvec2 = TSL.bvec2;
const bvec3 = TSL.bvec3;
const bvec4 = TSL.bvec4;
const bypass = TSL.bypass;
const cache = TSL.cache;
const call = TSL.call;
const cameraFar = TSL.cameraFar;
const cameraNear = TSL.cameraNear;
const cameraNormalMatrix = TSL.cameraNormalMatrix;
const cameraPosition = TSL.cameraPosition;
const cameraProjectionMatrix = TSL.cameraProjectionMatrix;
const cameraProjectionMatrixInverse = TSL.cameraProjectionMatrixInverse;
const cameraViewMatrix = TSL.cameraViewMatrix;
const cameraWorldMatrix = TSL.cameraWorldMatrix;
const cbrt = TSL.cbrt;
const cdl = TSL.cdl;
const ceil = TSL.ceil;
const checker = TSL.checker;
const cineonToneMapping = TSL.cineonToneMapping;
const clamp = TSL.clamp;
const clearcoat = TSL.clearcoat;
const clearcoatRoughness = TSL.clearcoatRoughness;
const code = TSL.code;
const color = TSL.color;
const colorSpaceToWorking = TSL.colorSpaceToWorking;
const colorToDirection = TSL.colorToDirection;
const compute = TSL.compute;
const cond = TSL.cond;
const Const = TSL.Const;
const context = TSL.context;
const convert = TSL.convert;
const convertColorSpace = TSL.convertColorSpace;
const convertToTexture = TSL.convertToTexture;
const cos = TSL.cos;
const cross = TSL.cross;
const cubeTexture = TSL.cubeTexture;
const dFdx = TSL.dFdx;
const dFdy = TSL.dFdy;
const dashSize = TSL.dashSize;
const defaultBuildStages = TSL.defaultBuildStages;
const defaultShaderStages = TSL.defaultShaderStages;
const defined = TSL.defined;
const degrees = TSL.degrees;
const deltaTime = TSL.deltaTime;
const densityFog = TSL.densityFog;
const densityFogFactor = TSL.densityFogFactor;
const depth = TSL.depth;
const depthPass = TSL.depthPass;
const difference = TSL.difference;
const diffuseColor = TSL.diffuseColor;
const directPointLight = TSL.directPointLight;
const directionToColor = TSL.directionToColor;
const dispersion = TSL.dispersion;
const distance = TSL.distance;
const div = TSL.div;
const dodge = TSL.dodge;
const dot = TSL.dot;
const drawIndex = TSL.drawIndex;
const dynamicBufferAttribute = TSL.dynamicBufferAttribute;
const element = TSL.element;
const emissive = TSL.emissive;
const equal = TSL.equal;
const equals = TSL.equals;
const equirectUV = TSL.equirectUV;
const exp = TSL.exp;
const exp2 = TSL.exp2;
const expression = TSL.expression;
const faceDirection = TSL.faceDirection;
const faceForward = TSL.faceForward;
const faceforward = TSL.faceforward;
const float = TSL.float;
const floor = TSL.floor;
const fog = TSL.fog;
const fract = TSL.fract;
const frameGroup = TSL.frameGroup;
const frameId = TSL.frameId;
const frontFacing = TSL.frontFacing;
const fwidth = TSL.fwidth;
const gain = TSL.gain;
const gapSize = TSL.gapSize;
const getConstNodeType = TSL.getConstNodeType;
const getCurrentStack = TSL.getCurrentStack;
const getDirection = TSL.getDirection;
const getDistanceAttenuation = TSL.getDistanceAttenuation;
const getGeometryRoughness = TSL.getGeometryRoughness;
const getNormalFromDepth = TSL.getNormalFromDepth;
const getParallaxCorrectNormal = TSL.getParallaxCorrectNormal;
const getRoughness = TSL.getRoughness;
const getScreenPosition = TSL.getScreenPosition;
const getShIrradianceAt = TSL.getShIrradianceAt;
const getTextureIndex = TSL.getTextureIndex;
const getViewPosition = TSL.getViewPosition;
const glsl = TSL.glsl;
const glslFn = TSL.glslFn;
const grayscale = TSL.grayscale;
const greaterThan = TSL.greaterThan;
const greaterThanEqual = TSL.greaterThanEqual;
const hash = TSL.hash;
const highpModelNormalViewMatrix = TSL.highpModelNormalViewMatrix;
const highpModelViewMatrix = TSL.highpModelViewMatrix;
const hue = TSL.hue;
const instance = TSL.instance;
const instanceIndex = TSL.instanceIndex;
const instancedArray = TSL.instancedArray;
const instancedBufferAttribute = TSL.instancedBufferAttribute;
const instancedDynamicBufferAttribute = TSL.instancedDynamicBufferAttribute;
const instancedMesh = TSL.instancedMesh;
const int = TSL.int;
const inverseSqrt = TSL.inverseSqrt;
const inversesqrt = TSL.inversesqrt;
const invocationLocalIndex = TSL.invocationLocalIndex;
const invocationSubgroupIndex = TSL.invocationSubgroupIndex;
const ior = TSL.ior;
const iridescence = TSL.iridescence;
const iridescenceIOR = TSL.iridescenceIOR;
const iridescenceThickness = TSL.iridescenceThickness;
const ivec2 = TSL.ivec2;
const ivec3 = TSL.ivec3;
const ivec4 = TSL.ivec4;
const js = TSL.js;
const label = TSL.label;
const length = TSL.length;
const lengthSq = TSL.lengthSq;
const lessThan = TSL.lessThan;
const lessThanEqual = TSL.lessThanEqual;
const lightPosition = TSL.lightPosition;
const lightTargetDirection = TSL.lightTargetDirection;
const lightTargetPosition = TSL.lightTargetPosition;
const lightViewPosition = TSL.lightViewPosition;
const lightingContext = TSL.lightingContext;
const lights = TSL.lights;
const linearDepth = TSL.linearDepth;
const linearToneMapping = TSL.linearToneMapping;
const localId = TSL.localId;
const globalId = TSL.globalId;
const log = TSL.log;
const log2 = TSL.log2;
const logarithmicDepthToViewZ = TSL.logarithmicDepthToViewZ;
const loop = TSL.loop;
const luminance = TSL.luminance;
const mediumpModelViewMatrix = TSL.mediumpModelViewMatrix;
const mat2 = TSL.mat2;
const mat3 = TSL.mat3;
const mat4 = TSL.mat4;
const matcapUV = TSL.matcapUV;
const materialAO = TSL.materialAO;
const materialAlphaTest = TSL.materialAlphaTest;
const materialAnisotropy = TSL.materialAnisotropy;
const materialAnisotropyVector = TSL.materialAnisotropyVector;
const materialAttenuationColor = TSL.materialAttenuationColor;
const materialAttenuationDistance = TSL.materialAttenuationDistance;
const materialClearcoat = TSL.materialClearcoat;
const materialClearcoatNormal = TSL.materialClearcoatNormal;
const materialClearcoatRoughness = TSL.materialClearcoatRoughness;
const materialColor = TSL.materialColor;
const materialDispersion = TSL.materialDispersion;
const materialEmissive = TSL.materialEmissive;
const materialIOR = TSL.materialIOR;
const materialIridescence = TSL.materialIridescence;
const materialIridescenceIOR = TSL.materialIridescenceIOR;
const materialIridescenceThickness = TSL.materialIridescenceThickness;
const materialLightMap = TSL.materialLightMap;
const materialLineDashOffset = TSL.materialLineDashOffset;
const materialLineDashSize = TSL.materialLineDashSize;
const materialLineGapSize = TSL.materialLineGapSize;
const materialLineScale = TSL.materialLineScale;
const materialLineWidth = TSL.materialLineWidth;
const materialMetalness = TSL.materialMetalness;
const materialNormal = TSL.materialNormal;
const materialOpacity = TSL.materialOpacity;
const materialPointWidth = TSL.materialPointWidth;
const materialReference = TSL.materialReference;
const materialReflectivity = TSL.materialReflectivity;
const materialRefractionRatio = TSL.materialRefractionRatio;
const materialRotation = TSL.materialRotation;
const materialRoughness = TSL.materialRoughness;
const materialSheen = TSL.materialSheen;
const materialSheenRoughness = TSL.materialSheenRoughness;
const materialShininess = TSL.materialShininess;
const materialSpecular = TSL.materialSpecular;
const materialSpecularColor = TSL.materialSpecularColor;
const materialSpecularIntensity = TSL.materialSpecularIntensity;
const materialSpecularStrength = TSL.materialSpecularStrength;
const materialThickness = TSL.materialThickness;
const materialTransmission = TSL.materialTransmission;
const max = TSL.max;
const maxMipLevel = TSL.maxMipLevel;
const metalness = TSL.metalness;
const min = TSL.min;
const mix = TSL.mix;
const mixElement = TSL.mixElement;
const mod = TSL.mod;
const modInt = TSL.modInt;
const modelDirection = TSL.modelDirection;
const modelNormalMatrix = TSL.modelNormalMatrix;
const modelPosition = TSL.modelPosition;
const modelScale = TSL.modelScale;
const modelViewMatrix = TSL.modelViewMatrix;
const modelViewPosition = TSL.modelViewPosition;
const modelViewProjection = TSL.modelViewProjection;
const modelWorldMatrix = TSL.modelWorldMatrix;
const modelWorldMatrixInverse = TSL.modelWorldMatrixInverse;
const morphReference = TSL.morphReference;
const mrt = TSL.mrt;
const mul = TSL.mul;
const mx_aastep = TSL.mx_aastep;
const mx_cell_noise_float = TSL.mx_cell_noise_float;
const mx_contrast = TSL.mx_contrast;
const mx_fractal_noise_float = TSL.mx_fractal_noise_float;
const mx_fractal_noise_vec2 = TSL.mx_fractal_noise_vec2;
const mx_fractal_noise_vec3 = TSL.mx_fractal_noise_vec3;
const mx_fractal_noise_vec4 = TSL.mx_fractal_noise_vec4;
const mx_hsvtorgb = TSL.mx_hsvtorgb;
const mx_noise_float = TSL.mx_noise_float;
const mx_noise_vec3 = TSL.mx_noise_vec3;
const mx_noise_vec4 = TSL.mx_noise_vec4;
const mx_ramplr = TSL.mx_ramplr;
const mx_ramptb = TSL.mx_ramptb;
const mx_rgbtohsv = TSL.mx_rgbtohsv;
const mx_safepower = TSL.mx_safepower;
const mx_splitlr = TSL.mx_splitlr;
const mx_splittb = TSL.mx_splittb;
const mx_srgb_texture_to_lin_rec709 = TSL.mx_srgb_texture_to_lin_rec709;
const mx_transform_uv = TSL.mx_transform_uv;
const mx_worley_noise_float = TSL.mx_worley_noise_float;
const mx_worley_noise_vec2 = TSL.mx_worley_noise_vec2;
const mx_worley_noise_vec3 = TSL.mx_worley_noise_vec3;
const negate = TSL.negate;
const neutralToneMapping = TSL.neutralToneMapping;
const nodeArray = TSL.nodeArray;
const nodeImmutable = TSL.nodeImmutable;
const nodeObject = TSL.nodeObject;
const nodeObjects = TSL.nodeObjects;
const nodeProxy = TSL.nodeProxy;
const normalFlat = TSL.normalFlat;
const normalGeometry = TSL.normalGeometry;
const normalLocal = TSL.normalLocal;
const normalMap = TSL.normalMap;
const normalView = TSL.normalView;
const normalWorld = TSL.normalWorld;
const normalize = TSL.normalize;
const not = TSL.not;
const notEqual = TSL.notEqual;
const numWorkgroups = TSL.numWorkgroups;
const objectDirection = TSL.objectDirection;
const objectGroup = TSL.objectGroup;
const objectPosition = TSL.objectPosition;
const objectScale = TSL.objectScale;
const objectViewPosition = TSL.objectViewPosition;
const objectWorldMatrix = TSL.objectWorldMatrix;
const oneMinus = TSL.oneMinus;
const or = TSL.or;
const orthographicDepthToViewZ = TSL.orthographicDepthToViewZ;
const oscSawtooth = TSL.oscSawtooth;
const oscSine = TSL.oscSine;
const oscSquare = TSL.oscSquare;
const oscTriangle = TSL.oscTriangle;
const output = TSL.output;
const outputStruct = TSL.outputStruct;
const overlay = TSL.overlay;
const overloadingFn = TSL.overloadingFn;
const parabola = TSL.parabola;
const parallaxDirection = TSL.parallaxDirection;
const parallaxUV = TSL.parallaxUV;
const parameter = TSL.parameter;
const pass = TSL.pass;
const passTexture = TSL.passTexture;
const pcurve = TSL.pcurve;
const perspectiveDepthToViewZ = TSL.perspectiveDepthToViewZ;
const pmremTexture = TSL.pmremTexture;
const pointUV = TSL.pointUV;
const pointWidth = TSL.pointWidth;
const positionGeometry = TSL.positionGeometry;
const positionLocal = TSL.positionLocal;
const positionPrevious = TSL.positionPrevious;
const positionView = TSL.positionView;
const positionViewDirection = TSL.positionViewDirection;
const positionWorld = TSL.positionWorld;
const positionWorldDirection = TSL.positionWorldDirection;
const posterize = TSL.posterize;
const pow = TSL.pow;
const pow2 = TSL.pow2;
const pow3 = TSL.pow3;
const pow4 = TSL.pow4;
const property = TSL.property;
const radians = TSL.radians;
const rand = TSL.rand;
const range = TSL.range;
const rangeFog = TSL.rangeFog;
const rangeFogFactor = TSL.rangeFogFactor;
const reciprocal = TSL.reciprocal;
const reference = TSL.reference;
const referenceBuffer = TSL.referenceBuffer;
const reflect = TSL.reflect;
const reflectVector = TSL.reflectVector;
const reflectView = TSL.reflectView;
const reflector = TSL.reflector;
const refract = TSL.refract;
const refractVector = TSL.refractVector;
const refractView = TSL.refractView;
const reinhardToneMapping = TSL.reinhardToneMapping;
const remainder = TSL.remainder;
const remap = TSL.remap;
const remapClamp = TSL.remapClamp;
const renderGroup = TSL.renderGroup;
const renderOutput = TSL.renderOutput;
const rendererReference = TSL.rendererReference;
const rotate = TSL.rotate;
const rotateUV = TSL.rotateUV;
const roughness = TSL.roughness;
const round = TSL.round;
const rtt = TSL.rtt;
const sRGBTransferEOTF = TSL.sRGBTransferEOTF;
const sRGBTransferOETF = TSL.sRGBTransferOETF;
const sampler = TSL.sampler;
const saturate = TSL.saturate;
const saturation = TSL.saturation;
const screen = TSL.screen;
const screenCoordinate = TSL.screenCoordinate;
const screenSize = TSL.screenSize;
const screenUV = TSL.screenUV;
const scriptable = TSL.scriptable;
const scriptableValue = TSL.scriptableValue;
const select = TSL.select;
const setCurrentStack = TSL.setCurrentStack;
const shaderStages = TSL.shaderStages;
const shadow = TSL.shadow;
const shadowPositionWorld = TSL.shadowPositionWorld;
const sharedUniformGroup = TSL.sharedUniformGroup;
const sheen = TSL.sheen;
const sheenRoughness = TSL.sheenRoughness;
const shiftLeft = TSL.shiftLeft;
const shiftRight = TSL.shiftRight;
const shininess = TSL.shininess;
const sign = TSL.sign;
const sin = TSL.sin;
const sinc = TSL.sinc;
const skinning = TSL.skinning;
const skinningReference = TSL.skinningReference;
const smoothstep = TSL.smoothstep;
const smoothstepElement = TSL.smoothstepElement;
const specularColor = TSL.specularColor;
const specularF90 = TSL.specularF90;
const spherizeUV = TSL.spherizeUV;
const split = TSL.split;
const spritesheetUV = TSL.spritesheetUV;
const sqrt = TSL.sqrt;
const stack = TSL.stack;
const step = TSL.step;
const storage = TSL.storage;
const storageBarrier = TSL.storageBarrier;
const storageObject = TSL.storageObject;
const storageTexture = TSL.storageTexture;
const string = TSL.string;
const sub = TSL.sub;
const subgroupIndex = TSL.subgroupIndex;
const subgroupSize = TSL.subgroupSize;
const tan = TSL.tan;
const tangentGeometry = TSL.tangentGeometry;
const tangentLocal = TSL.tangentLocal;
const tangentView = TSL.tangentView;
const tangentWorld = TSL.tangentWorld;
const temp = TSL.temp;
const texture = TSL.texture;
const texture3D = TSL.texture3D;
const textureBarrier = TSL.textureBarrier;
const textureBicubic = TSL.textureBicubic;
const textureCubeUV = TSL.textureCubeUV;
const textureLoad = TSL.textureLoad;
const textureSize = TSL.textureSize;
const textureStore = TSL.textureStore;
const thickness = TSL.thickness;
const threshold = TSL.threshold;
const time = TSL.time;
const timerDelta = TSL.timerDelta;
const timerGlobal = TSL.timerGlobal;
const timerLocal = TSL.timerLocal;
const toOutputColorSpace = TSL.toOutputColorSpace;
const toWorkingColorSpace = TSL.toWorkingColorSpace;
const toneMapping = TSL.toneMapping;
const toneMappingExposure = TSL.toneMappingExposure;
const toonOutlinePass = TSL.toonOutlinePass;
const transformDirection = TSL.transformDirection;
const transformNormal = TSL.transformNormal;
const transformNormalToView = TSL.transformNormalToView;
const transformedBentNormalView = TSL.transformedBentNormalView;
const transformedBitangentView = TSL.transformedBitangentView;
const transformedBitangentWorld = TSL.transformedBitangentWorld;
const transformedClearcoatNormalView = TSL.transformedClearcoatNormalView;
const transformedNormalView = TSL.transformedNormalView;
const transformedNormalWorld = TSL.transformedNormalWorld;
const transformedTangentView = TSL.transformedTangentView;
const transformedTangentWorld = TSL.transformedTangentWorld;
const transmission = TSL.transmission;
const transpose = TSL.transpose;
const tri = TSL.tri;
const tri3 = TSL.tri3;
const triNoise3D = TSL.triNoise3D;
const triplanarTexture = TSL.triplanarTexture;
const triplanarTextures = TSL.triplanarTextures;
const trunc = TSL.trunc;
const tslFn = TSL.tslFn;
const uint = TSL.uint;
const uniform = TSL.uniform;
const uniformArray = TSL.uniformArray;
const uniformGroup = TSL.uniformGroup;
const uniforms = TSL.uniforms;
const userData = TSL.userData;
const uv = TSL.uv;
const uvec2 = TSL.uvec2;
const uvec3 = TSL.uvec3;
const uvec4 = TSL.uvec4;
const Var = TSL.Var;
const varying = TSL.varying;
const varyingProperty = TSL.varyingProperty;
const vec2 = TSL.vec2;
const vec3 = TSL.vec3;
const vec4 = TSL.vec4;
const vectorComponents = TSL.vectorComponents;
const velocity = TSL.velocity;
const vertexColor = TSL.vertexColor;
const vertexIndex = TSL.vertexIndex;
const vibrance = TSL.vibrance;
const viewZToLogarithmicDepth = TSL.viewZToLogarithmicDepth;
const viewZToOrthographicDepth = TSL.viewZToOrthographicDepth;
const viewZToPerspectiveDepth = TSL.viewZToPerspectiveDepth;
const viewport = TSL.viewport;
const viewportBottomLeft = TSL.viewportBottomLeft;
const viewportCoordinate = TSL.viewportCoordinate;
const viewportDepthTexture = TSL.viewportDepthTexture;
const viewportLinearDepth = TSL.viewportLinearDepth;
const viewportMipTexture = TSL.viewportMipTexture;
const viewportResolution = TSL.viewportResolution;
const viewportSafeUV = TSL.viewportSafeUV;
const viewportSharedTexture = TSL.viewportSharedTexture;
const viewportSize = TSL.viewportSize;
const viewportTexture = TSL.viewportTexture;
const viewportTopLeft = TSL.viewportTopLeft;
const viewportUV = TSL.viewportUV;
const wgsl = TSL.wgsl;
const wgslFn = TSL.wgslFn;
const workgroupArray = TSL.workgroupArray;
const workgroupBarrier = TSL.workgroupBarrier;
const workgroupId = TSL.workgroupId;
const workingToColorSpace = TSL.workingToColorSpace;
const xor = TSL.xor;

export { BRDF_GGX, BRDF_Lambert, BasicShadowFilter, Break, Const, Continue, DFGApprox, D_GGX, Discard, EPSILON, F_Schlick, Fn, INFINITY, If, Loop, NodeAccess, NodeShaderStage, NodeType, NodeUpdateType, PCFShadowFilter, PCFSoftShadowFilter, PI, PI2, Return, Schlick_to_F0, ScriptableNodeResources, ShaderNode, TBNViewMatrix, VSMShadowFilter, V_GGX_SmithCorrelated, Var, abs, acesFilmicToneMapping, acos, add, addNodeElement, agxToneMapping, all, alphaT, and, anisotropy, anisotropyB, anisotropyT, any, append, arrayBuffer, asin, assign, atan, atan2, atomicAdd, atomicAnd, atomicFunc, atomicMax, atomicMin, atomicOr, atomicStore, atomicSub, atomicXor, attenuationColor, attenuationDistance, attribute, attributeArray, backgroundBlurriness, backgroundIntensity, backgroundRotation, batch, billboarding, bitAnd, bitNot, bitOr, bitXor, bitangentGeometry, bitangentLocal, bitangentView, bitangentWorld, bitcast, blendBurn, blendColor, blendDodge, blendOverlay, blendScreen, blur, bool, buffer, bufferAttribute, bumpMap, burn, bvec2, bvec3, bvec4, bypass, cache, call, cameraFar, cameraNear, cameraNormalMatrix, cameraPosition, cameraProjectionMatrix, cameraProjectionMatrixInverse, cameraViewMatrix, cameraWorldMatrix, cbrt, cdl, ceil, checker, cineonToneMapping, clamp, clearcoat, clearcoatRoughness, code, color, colorSpaceToWorking, colorToDirection, compute, cond, context, convert, convertColorSpace, convertToTexture, cos, cross, cubeTexture, dFdx, dFdy, dashSize, defaultBuildStages, defaultShaderStages, defined, degrees, deltaTime, densityFog, densityFogFactor, depth, depthPass, difference, diffuseColor, directPointLight, directionToColor, dispersion, distance, div, dodge, dot, drawIndex, dynamicBufferAttribute, element, emissive, equal, equals, equirectUV, exp, exp2, expression, faceDirection, faceForward, faceforward, float, floor, fog, fract, frameGroup, frameId, frontFacing, fwidth, gain, gapSize, getConstNodeType, getCurrentStack, getDirection, getDistanceAttenuation, getGeometryRoughness, getNormalFromDepth, getParallaxCorrectNormal, getRoughness, getScreenPosition, getShIrradianceAt, getTextureIndex, getViewPosition, globalId, glsl, glslFn, grayscale, greaterThan, greaterThanEqual, hash, highpModelNormalViewMatrix, highpModelViewMatrix, hue, instance, instanceIndex, instancedArray, instancedBufferAttribute, instancedDynamicBufferAttribute, instancedMesh, int, inverseSqrt, inversesqrt, invocationLocalIndex, invocationSubgroupIndex, ior, iridescence, iridescenceIOR, iridescenceThickness, ivec2, ivec3, ivec4, js, label, length, lengthSq, lessThan, lessThanEqual, lightPosition, lightTargetDirection, lightTargetPosition, lightViewPosition, lightingContext, lights, linearDepth, linearToneMapping, localId, log, log2, logarithmicDepthToViewZ, loop, luminance, mat2, mat3, mat4, matcapUV, materialAO, materialAlphaTest, materialAnisotropy, materialAnisotropyVector, materialAttenuationColor, materialAttenuationDistance, materialClearcoat, materialClearcoatNormal, materialClearcoatRoughness, materialColor, materialDispersion, materialEmissive, materialIOR, materialIridescence, materialIridescenceIOR, materialIridescenceThickness, materialLightMap, materialLineDashOffset, materialLineDashSize, materialLineGapSize, materialLineScale, materialLineWidth, materialMetalness, materialNormal, materialOpacity, materialPointWidth, materialReference, materialReflectivity, materialRefractionRatio, materialRotation, materialRoughness, materialSheen, materialSheenRoughness, materialShininess, materialSpecular, materialSpecularColor, materialSpecularIntensity, materialSpecularStrength, materialThickness, materialTransmission, max, maxMipLevel, mediumpModelViewMatrix, metalness, min, mix, mixElement, mod, modInt, modelDirection, modelNormalMatrix, modelPosition, modelScale, modelViewMatrix, modelViewPosition, modelViewProjection, modelWorldMatrix, modelWorldMatrixInverse, morphReference, mrt, mul, mx_aastep, mx_cell_noise_float, mx_contrast, mx_fractal_noise_float, mx_fractal_noise_vec2, mx_fractal_noise_vec3, mx_fractal_noise_vec4, mx_hsvtorgb, mx_noise_float, mx_noise_vec3, mx_noise_vec4, mx_ramplr, mx_ramptb, mx_rgbtohsv, mx_safepower, mx_splitlr, mx_splittb, mx_srgb_texture_to_lin_rec709, mx_transform_uv, mx_worley_noise_float, mx_worley_noise_vec2, mx_worley_noise_vec3, negate, neutralToneMapping, nodeArray, nodeImmutable, nodeObject, nodeObjects, nodeProxy, normalFlat, normalGeometry, normalLocal, normalMap, normalView, normalWorld, normalize, not, notEqual, numWorkgroups, objectDirection, objectGroup, objectPosition, objectScale, objectViewPosition, objectWorldMatrix, oneMinus, or, orthographicDepthToViewZ, oscSawtooth, oscSine, oscSquare, oscTriangle, output, outputStruct, overlay, overloadingFn, parabola, parallaxDirection, parallaxUV, parameter, pass, passTexture, pcurve, perspectiveDepthToViewZ, pmremTexture, pointUV, pointWidth, positionGeometry, positionLocal, positionPrevious, positionView, positionViewDirection, positionWorld, positionWorldDirection, posterize, pow, pow2, pow3, pow4, property, radians, rand, range, rangeFog, rangeFogFactor, reciprocal, reference, referenceBuffer, reflect, reflectVector, reflectView, reflector, refract, refractVector, refractView, reinhardToneMapping, remainder, remap, remapClamp, renderGroup, renderOutput, rendererReference, rotate, rotateUV, roughness, round, rtt, sRGBTransferEOTF, sRGBTransferOETF, sampler, saturate, saturation, screen, screenCoordinate, screenSize, screenUV, scriptable, scriptableValue, select, setCurrentStack, shaderStages, shadow, shadowPositionWorld, sharedUniformGroup, sheen, sheenRoughness, shiftLeft, shiftRight, shininess, sign, sin, sinc, skinning, skinningReference, smoothstep, smoothstepElement, specularColor, specularF90, spherizeUV, split, spritesheetUV, sqrt, stack, step, storage, storageBarrier, storageObject, storageTexture, string, sub, subgroupIndex, subgroupSize, tan, tangentGeometry, tangentLocal, tangentView, tangentWorld, temp, texture, texture3D, textureBarrier, textureBicubic, textureCubeUV, textureLoad, textureSize, textureStore, thickness, threshold, time, timerDelta, timerGlobal, timerLocal, toOutputColorSpace, toWorkingColorSpace, toneMapping, toneMappingExposure, toonOutlinePass, transformDirection, transformNormal, transformNormalToView, transformedBentNormalView, transformedBitangentView, transformedBitangentWorld, transformedClearcoatNormalView, transformedNormalView, transformedNormalWorld, transformedTangentView, transformedTangentWorld, transmission, transpose, tri, tri3, triNoise3D, triplanarTexture, triplanarTextures, trunc, tslFn, uint, uniform, uniformArray, uniformGroup, uniforms, userData, uv, uvec2, uvec3, uvec4, varying, varyingProperty, vec2, vec3, vec4, vectorComponents, velocity, vertexColor, vertexIndex, vibrance, viewZToLogarithmicDepth, viewZToOrthographicDepth, viewZToPerspectiveDepth, viewport, viewportBottomLeft, viewportCoordinate, viewportDepthTexture, viewportLinearDepth, viewportMipTexture, viewportResolution, viewportSafeUV, viewportSharedTexture, viewportSize, viewportTexture, viewportTopLeft, viewportUV, wgsl, wgslFn, workgroupArray, workgroupBarrier, workgroupId, workingToColorSpace, xor };
