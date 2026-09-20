const path = require("node:path");
const fs = require("node:fs");

const PACKAGE_NAME = "@slate-terminal/native";
const REQUIRED_EXPORTS = [
  "clearScreen",
  "closeTerminal",
  "disableAlternateScreen",
  "disableBracketedPaste",
  "disableFocusChange",
  "disableMouseCapture",
  "disableRawMode",
  "enableAlternateScreen",
  "enableBracketedPaste",
  "enableFocusChange",
  "enableMouseCapture",
  "enableRawMode",
  "hideCursor",
  "pollEvent",
  "render",
  "renderColorShift",
  "renderGlow",
  "renderText",
  "showCursor",
  "version",
];
const PLATFORM_TARGETS = {
  win32: { x64: "win32-x64-msvc", arm64: "win32-arm64-msvc" },
  linux: { x64: "linux-x64-gnu", arm64: "linux-arm64-gnu" },
  darwin: { x64: "darwin-x64", arm64: "darwin-arm64" },
};
const SOURCE_ARTIFACT_NAMES = {
  win32: "slate_node.dll",
  linux: "libslate_node.so",
  darwin: "libslate_node.dylib",
};
const SUPPORTED_TARGETS = Object.values(PLATFORM_TARGETS).flatMap((architectures) => Object.values(architectures));

function createNativeError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function resolvePlatformTarget(platform, arch) {
  const targetsForPlatform = PLATFORM_TARGETS[platform];
  const platformTarget = targetsForPlatform && targetsForPlatform[arch];
  if (platformTarget) return platformTarget;

  throw createNativeError(
    "ERR_SLATE_NATIVE_UNSUPPORTED_PLATFORM",
    `${PACKAGE_NAME} does not support ${platform}-${arch}. Supported Node targets: ${SUPPORTED_TARGETS.join(
      ", ",
    )}.`,
    { platform, arch, supportedTargets: SUPPORTED_TARGETS },
  );
}

function resolveCandidates(addonDirectory, platform, platformTarget) {
  return [
    path.join(addonDirectory, `slate_node.${platformTarget}.node`),
    path.join(addonDirectory, "slate_node.node"),
    path.join(addonDirectory, "..", "..", "target", "release", SOURCE_ARTIFACT_NAMES[platform]),
  ];
}

function isMissingPath(error) {
  return error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function isRegularFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw createNativeError(
      "ERR_SLATE_NATIVE_RESOLUTION",
      `Unable to inspect the ${PACKAGE_NAME} candidate "${candidate}": ${error.message}`,
      { candidate, cause: error },
    );
  }
}

function loadCandidate(candidate) {
  try {
    if (path.extname(candidate) === ".node") return require(candidate);
    process.dlopen(module, candidate);
    return module.exports;
  } catch (error) {
    throw createNativeError(
      "ERR_SLATE_NATIVE_LOAD_FAILED",
      `Unable to load the ${PACKAGE_NAME} addon from "${candidate}": ${error.message}`,
      { candidate, cause: error },
    );
  }
}

function validateBinding(binding, candidate) {
  const missingExports = REQUIRED_EXPORTS.filter((exportName) => typeof binding?.[exportName] !== "function");
  if (missingExports.length === 0) return binding;

  throw createNativeError(
    "ERR_SLATE_NATIVE_CONTRACT",
    `The ${PACKAGE_NAME} addon at "${candidate}" is missing required exports: ${missingExports.join(", ")}.`,
    { candidate, missingExports },
  );
}

function createMissingAddonError(platform, arch, platformTarget, candidates) {
  const checkedPaths = candidates.map((candidate) => `  - ${candidate}`).join("\n");
  return createNativeError(
    "ERR_SLATE_NATIVE_BINARY_NOT_FOUND",
    `Could not find a ${PACKAGE_NAME} addon for ${platformTarget} (${platform}-${arch}). Checked:\n${checkedPaths}\nBuild it from the Slate repository with "npm run native:build" or install a package containing the target-specific .node file.`,
    { platform, arch, platformTarget, candidates },
  );
}

const platformTarget = resolvePlatformTarget(process.platform, process.arch);
const candidates = resolveCandidates(__dirname, process.platform, platformTarget);
let hasLoadedAddon = false;

for (const candidate of candidates) {
  if (!isRegularFile(candidate)) continue;
  module.exports = validateBinding(loadCandidate(candidate), candidate);
  hasLoadedAddon = true;
  break;
}

if (!hasLoadedAddon) {
  throw createMissingAddonError(process.platform, process.arch, platformTarget, candidates);
}
