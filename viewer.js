import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";
globalThis.pdfjsWorker = { WorkerMessageHandler };
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import DATA from "./model-data.json";
import { createRing, createStackBands } from "./jewelry.js";
import { createStudio, LIGHT_PRESETS } from "./studio.js";
import { exportMotion } from "./video-export.js";

const $ = (id) => document.getElementById(id);
const status = $("status");
const state = {
  diameter: 16,
  width: 2,
  stone: 6.5,
  carat: 1,
  fire: 0.055,
  sparkle: 2.8,
  position: 0,
  style: "pear",
  setting: "solitaire",
  orientation: 0,
  metal: "gold",
  surface: "photo",
  view: "back",
  band: "none",
  bandPlacement: "wrist",
  bandMetal: "match",
  bandWidth: 1.8,
  gap: 0.4,
  background: "tray",
  lightMode: "soft",
  front: 1.65,
  back: 0.65,
  environment: 0.72,
  exposure: 1,
  lightAngle: -30,
  shadows: true,
  motion: "lights",
  playing: false,
};
let renderer,
  controls,
  camera,
  scene,
  hand,
  ring,
  assembly,
  photoMaterial,
  clayMaterial,
  geometry,
  nailMaterial,
  studio;
let phase = 0,
  raf = 0,
  lastTime = 0,
  recording = false;
let cancelVideo = false,
  resize,
  resizePending = false;
let currentURL = null;
const axis = new THREE.Vector3(...DATA.ring.axis);
const center = new THREE.Vector3(...DATA.ring.center);
const ringQuaternion = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  axis,
);
function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      for (const m of [o.material].flat()) m.dispose();
    }
  });
}

function rebuildRing() {
  if (ring) {
    assembly.remove(ring);
    disposeTree(ring);
  }
  ring = createRing(state);
  const bands = createStackBands(state);
  if (bands.children.length) ring.add(bands);
  assembly.add(ring);
  ring.quaternion.copy(ringQuaternion);
  ring.position
    .copy(center)
    .multiplyScalar(state.diameter / 16)
    .addScaledVector(axis, state.position);
  ring.position.x *= Number($("handWidth").value);
}

function update(rebuild = true) {
  const scale = state.diameter / 16;
  hand.scale.set(scale * Number($("handWidth").value), scale, scale);
  hand.material = state.surface === "photo" ? photoMaterial : clayMaterial;
  hand.children.forEach(
    (n) =>
      (n.material = state.surface === "photo" ? nailMaterial : clayMaterial),
  );
  if (rebuild) rebuildRing();
  for (const key of [
    "width",
    "stone",
    "position",
    "orientation",
    "bandWidth",
    "gap",
    "front",
    "back",
    "environment",
    "exposure",
    "lightAngle",
  ])
    $(key + "-value").textContent = state[key].toFixed(
      ["front", "back", "environment", "exposure", "stone"].includes(key)
        ? 2
        : ["orientation", "lightAngle"].includes(key)
          ? 0
          : 1,
    );
  document.querySelector(".stone-control").hidden =
    state.style === "none" || state.style === "band";
  document
    .querySelectorAll(".setting-control")
    .forEach(
      (e) => (e.hidden = state.style === "none" || state.style === "band"),
    );
  $("sizing-help").textContent =
    `Provisional ${state.diameter.toFixed(1)} mm. Adjust for measured finger size. This sets the hand’s scale.`;
  if (state.view === "ring") {
    const target = center
      .clone()
      .multiplyScalar(scale)
      .addScaledVector(axis, state.position);
    const delta = target.clone().sub(controls.target);
    camera.position.add(delta);
    controls.target.copy(target);
    controls.update();
  }
  renderFrame();
}

function setView(view) {
  stopMotion(true);
  state.view = view;
  const scale = state.diameter / 16;
  const target = new THREE.Vector3(0, 0, 0);
  const dist =
    Math.max(315, (175 / (2 * Math.tan(Math.PI / 8) * camera.aspect)) * 1.16) *
    scale;
  if (view === "palm") camera.position.set(0, 3, -dist);
  else if (view === "side") camera.position.set(dist * 0.94, 22, dist * 0.22);
  else if (view === "ring") {
    target
      .copy(center)
      .multiplyScalar(scale)
      .addScaledVector(axis, state.position);
    camera.position.copy(target).add(new THREE.Vector3(6, -12, 62));
  } else camera.position.set(0, 0, dist);
  camera.up.set(0, 1, 0);
  controls.target.copy(target);
  controls.update();
  document
    .querySelectorAll("[data-view]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.view === view)),
    );
  renderFrame();
}

async function download(includeRing, button) {
  const initial = button.textContent;
  button.disabled = true;
  button.textContent = "Preparing GLB…";
  status.textContent = "Preparing your model at the selected scale…";
  try {
    const group = new THREE.Group();
    group.name = "Generic adjustable hand";
    group.userData = {
      units: "metres",
      provisionalInnerDiameterMM: state.diameter,
      presentation: {
        background: state.background,
        lighting: state.lightMode,
        front: state.front,
        back: state.back,
        environment: state.environment,
        exposure: state.exposure,
        lightAngle: state.lightAngle,
      },
      accuracy:
        "Generic hand; proportions and scale are approximate.",
    };
    const clone = hand.clone();
    clone.material = hand.material.clone();
    group.add(clone);
    if (includeRing && (state.style !== "none" || state.band !== "none"))
      group.add(ring.clone(true));
    group.scale.setScalar(0.001);
    group.updateMatrixWorld(true);
    const output = await new GLTFExporter().parseAsync(group, { binary: true });
    const blob = new Blob([output], { type: "model/gltf-binary" });
    if (currentURL) URL.revokeObjectURL(currentURL);
    currentURL = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = currentURL;
    link.download = `diamond-studio-hand${includeRing ? "-" + state.style + "-" + state.setting + "-" + state.metal + "-band-" + state.band : ""}-${state.diameter.toFixed(1)}mm.glb`;
    document.body.append(link);
    link.click();
    link.remove();
    status.textContent = `GLB ready at ${state.diameter.toFixed(1)} mm provisional scale. glTF units: metres.`;
    clone.material.dispose();
  } catch (error) {
    status.textContent =
      "Could not export the model. Try again in Chrome, Edge or Safari.";
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = initial;
  }
}

function renderFrame() {
  if (!studio || !hand) return;
  assembly.rotation.y = state.motion === "turntable" ? phase : 0;
  studio.apply(state, phase);
  renderer.render(scene, camera);
}
function updateMotionButton() {
  $("animate-scene").textContent = state.playing
    ? "Pause motion"
    : "Play motion";
  $("animate-scene").setAttribute("aria-pressed", String(state.playing));
}
function tick(time) {
  raf = 0;
  if (!state.playing && !recording) {
    lastTime = 0;
    return;
  }
  const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.15) : 1 / 60;
  lastTime = time;
  phase += delta * 0.52;
  renderFrame();
  raf = requestAnimationFrame(tick);
}
function ensureAnimation() {
  if (!raf) {
    lastTime = 0;
    raf = requestAnimationFrame(tick);
  }
}
function stopMotion(reset = false) {
  state.playing = false;
  updateMotionButton();
  if (reset) phase = 0;
  if (!recording && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
    lastTime = 0;
  }
  renderFrame();
}
function selectPanel(name, focus = false) {
  document.querySelectorAll("[role=tab]").forEach((tab) => {
    const selected = tab.dataset.panel === name;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  });
  document
    .querySelectorAll("[role=tabpanel]")
    .forEach((panel) => (panel.hidden = panel.id !== "panel-" + name));
}
function saveBlob(blob, name) {
  if (currentURL) URL.revokeObjectURL(currentURL);
  currentURL = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = currentURL;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}
async function saveImage() {
  const b = $("save-image");
  b.disabled = true;
  try {
    renderFrame();
    const blob = await new Promise((resolve) =>
      renderer.domElement.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("No image");
    saveBlob(blob, `diamond-studio-${state.style}-${state.band}-${state.background}.png`);
    status.textContent =
      "Current view saved as PNG, including the chosen background and lighting.";
  } catch (error) {
    status.textContent = "Could not save the image. Try again.";
    console.error(error);
  } finally {
    b.disabled = false;
  }
}
async function recordVideo() {
  if (recording) {
    cancelVideo = true;
    return;
  }
  if (typeof VideoEncoder === "undefined") return;
  const button = $("record-video"),
    old = button.textContent,
    wasPlaying = state.playing,
    oldPhase = phase;
  const controlsBefore = controls.enabled;
  const disabled = [...document.querySelectorAll("input,button")]
    .filter((e) => e !== button)
    .map((e) => [e, e.disabled]);
  recording = true;
  cancelVideo = false;
  state.playing = false;
  controls.enabled = false;
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  lastTime = 0;
  for (const [e] of disabled) e.disabled = true;
  button.textContent = "Cancel video export";
  button.disabled = false;
  status.textContent =
    "Rendering an 8-second MP4 at 24 fps. This can take longer than playback.";
  try {
    const blob = await exportMotion(renderer.domElement, {
      frame: (offset) => {
        phase = oldPhase + offset;
        renderFrame();
      },
      cancelled: () => cancelVideo,
      progress: (done) => {
        status.textContent = `Rendering MP4 · ${Math.round(done * 100)}% · 8 seconds at 24 fps`;
      },
    });
    if (blob) {
      saveBlob(
        blob,
        `diamond-studio-${state.style}-${state.band}-${state.background}-light-study.mp4`,
      );
      status.textContent =
        "8-second MP4 saved at 24 fps. Lighting and sparkle remain a rendering preview.";
    } else
      status.textContent = "Video export cancelled. Your view is unchanged.";
  } catch (error) {
    status.textContent =
      "Could not export MP4. Try a current desktop browser; image and GLB export remain available.";
    console.error(error);
  } finally {
    recording = false;
    phase = oldPhase;
    controls.enabled = controlsBefore;
    for (const [e, value] of disabled) e.disabled = value;
    button.textContent = old;
    button.disabled = false;
    state.playing = wasPlaying;
    updateMotionButton();
    if (resizePending) {
      resizePending = false;
      resize();
    }
    renderFrame();
    if (wasPlaying) ensureAnimation();
  }
}

async function init() {
  const viewport = $("viewport");
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  viewport.append(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute(
    "aria-label",
    "Rotatable generic hand. Use camera view buttons or arrow keys to rotate; plus and minus to zoom.",
  );
  scene = new THREE.Scene();
  studio = createStudio(renderer, scene, document.querySelector(".stage"));
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
  camera.position.set(0, 0, 255);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = true;
  controls.minDistance = 28;
  controls.maxDistance = 650;
  controls.addEventListener("change", () => renderer.render(scene, camera));
  assembly = new THREE.Group();
  scene.add(assembly);
  geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(DATA.positions, 3),
  );
  geometry.setIndex(DATA.indices);
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(DATA.normals, 3),
  );
  const positions = geometry.getAttribute("position");
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = (positions.getX(i) + 100) / 200;
    uv[i * 2 + 1] = (positions.getY(i) + 100) / 200;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const textureSize = 256;
  const textureData = new Uint8Array(textureSize * textureSize * 4);
  let seed = 27;
  for (let i = 0; i < textureSize * textureSize; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = 115 + (seed >>> 28);
    textureData.set([value, value, value, 255], i * 4);
  }
  const pores = new THREE.DataTexture(textureData, textureSize, textureSize);
  pores.wrapS = THREE.RepeatWrapping;
  pores.wrapT = THREE.RepeatWrapping;
  pores.repeat.set(4, 4);
  pores.needsUpdate = true;
  photoMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xc39178, roughness: 0.75, metalness: 0,
    bumpMap: pores, bumpScale: 0.015,
    sheen: 0.12, sheenColor: new THREE.Color(0xe5b7a0),
    envMapIntensity: 0.48,
  });
  nailMaterial = photoMaterial.clone();
  clayMaterial = new THREE.MeshStandardMaterial({
    color: 0xc4b3a5,
    roughness: 0.74,
    metalness: 0,
    envMapIntensity: 0.5,
  });
  hand = new THREE.Mesh(geometry, photoMaterial);
  hand.name = "Generic configurable hand";
  hand.castShadow = true;
  hand.receiveShadow = true;
  for (const item of DATA.nails) {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(item.positions, 3),
    );
    g.setIndex(item.indices);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(item.uv, 2));
    g.computeVertexNormals();
    const nail = new THREE.Mesh(g, nailMaterial);
    nail.name = item.name;
    nail.castShadow = true;
    hand.add(nail);
  }
  assembly.add(hand);
  $("handWidth").addEventListener("input", () => update());
  $("carat").addEventListener("input", e => {
    const value = e.target.valueAsNumber;
    if (!Number.isFinite(value) || value < 0.1 || value > 8) return;
    state.carat = value;
    state.stone = Math.max(3, Math.min(12, 6.5 * Math.cbrt(value)));
    $("stone").value = state.stone;
    $("diamond-note").textContent = "Estimated visual size from carat weight. Enter measured dimensions for a closer match.";
    update();
  });
  for (const key of ["fire", "sparkle"]) $(key).addEventListener("input", e => {
    state[key] = Number(e.target.value);
    update();
  });
  $("report-file").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    $("report-status").textContent = "Reading report locally…";
    try {
      const pdf = await pdfjs.getDocument({data: await file.arrayBuffer(), useWorkerFetch: false}).promise;
      const page = await pdf.getPage(1);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(" ").replace(/\s+/g, " ");
      const find = pattern => text.match(pattern)?.[1];
      const weight = find(/Carat Weight\s+(\d+(?:\.\d+)?)\s+CARAT/i);
      const dimensions = text.match(/Measurements\s+(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i) || text.match(/Measurements\s+(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
      const shape = find(/Shape and Cutting Style\s+([A-Z ]+?)(?=\s+Measurements)/i);
      const color = find(/Color Grade\s+([D-Z])\b/i);
      const clarity = find(/Clarity Grade\s+((?:IF|FL|VVS|VS|SI|I)\s*[123]?)/i);
      const cut = find(/Cut Grade\s+(IDEAL|EXCELLENT|VERY GOOD|GOOD|FAIR|POOR)/i);
      if (!weight && !dimensions) throw new Error("No readable grading fields found");
      if (weight) { state.carat = Number(weight); $("carat").value = weight; }
      if (dimensions) { state.stone = Number(dimensions[1]); $("stone").value = state.stone; }
      if (shape) {
        const name = shape.trim().toLowerCase().split(" ")[0];
        const radio = document.querySelector('input[name="style"][value="' + name + '"]');
        if (radio) { radio.checked = true; state.style = name; }
      }
      $("grade-color").value = color || "";
      $("grade-clarity").value = clarity || "";
      $("grade-cut").value = cut || "";
      $("report-status").textContent = "Review extracted fields and dimensions. Image-only reports require manual entry.";
      $("diamond-note").textContent = dimensions ? "Showing the report's first measured dimension in millimetres." : "Enter the measured dimension from the report.";
      update();
    } catch (error) {
      $("report-status").textContent = "Could not read report text. Enter the report details manually.";
    }
    e.target.value = "";
  });
  resize = () => {
    if (recording) {
      resizePending = true;
      return;
    }
    const w = viewport.clientWidth,
      h = viewport.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    setView(state.view);
  };
  new ResizeObserver(resize).observe(viewport);
  for (const key of [
    "width",
    "stone",
    "position",
    "orientation",
    "bandWidth",
    "gap",
    "front",
    "back",
    "environment",
    "exposure",
    "lightAngle",
  ])
    $(key).addEventListener("input", (e) => {
      state[key] = Number(e.target.value);
      update(
        !["front", "back", "environment", "exposure", "lightAngle"].includes(
          key,
        ),
      );
    });
  function diameterChange(value, source) {
    if (!Number.isFinite(value) || value < 13 || value > 23) {
      $("diameter-error").textContent = "Enter a diameter from 13 to 23 mm.";
      $("diameter-number").setAttribute("aria-invalid", "true");
      return;
    }
    state.diameter = Math.round(value * 10) / 10;
    $("diameter").value = state.diameter;
    $("diameter-number").value = state.diameter;
    $("diameter-error").textContent = "";
    $("diameter-number").removeAttribute("aria-invalid");
    update();
    setView(state.view);
  }
  $("diameter").addEventListener("input", (e) =>
    diameterChange(e.target.valueAsNumber, "range"),
  );
  $("diameter-number").addEventListener("input", (e) =>
    diameterChange(e.target.valueAsNumber, "number"),
  );
  document.querySelectorAll("input[type=radio]").forEach((input) =>
    input.addEventListener("change", () => {
      state[input.name] = input.value;
      if (input.name === "lightMode") {
        Object.assign(state, LIGHT_PRESETS[input.value]);
        for (const key of ["front", "back", "environment"])
          $(key).value = state[key];
      }
      if (input.name === "motion") {
        phase = 0;
        lastTime = 0;
      }
      update(
        !["background", "lightMode", "motion", "surface"].includes(input.name),
      );
    }),
  );
  $("shadows").addEventListener("change", (e) => {
    state.shadows = e.target.checked;
    update(false);
  });
  $("animate-scene").addEventListener("click", () => {
    state.playing = !state.playing;
    updateMotionButton();
    if (state.playing) ensureAnimation();
    else if (!recording && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      lastTime = 0;
    }
  });
  controls.addEventListener("start", () => stopMotion(false));
  $("save-image").addEventListener("click", saveImage);
  $("record-video").addEventListener("click", recordVideo);
  document.querySelectorAll("[role=tab]").forEach((tab) => {
    tab.addEventListener("click", () => selectPanel(tab.dataset.panel, false));
    tab.addEventListener("keydown", (e) => {
      const tabs = [...document.querySelectorAll("[role=tab]")];
      let i = tabs.indexOf(tab);
      if (e.key === "ArrowRight") i = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") i = (i + tabs.length - 1) % tabs.length;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = tabs.length - 1;
      else return;
      e.preventDefault();
      selectPanel(tabs[i].dataset.panel, true);
    });
  });

  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.addEventListener("click", () => setView(button.dataset.view)),
    );
  $("export-look").addEventListener("click", () =>
    download(true, $("export-look")),
  );
  $("export-hand").addEventListener("click", () =>
    download(false, $("export-hand")),
  );
  renderer.domElement.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    const offset = camera.position.clone().sub(controls.target);
    if (e.key === "ArrowLeft" || e.key === "ArrowRight")
      offset.applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        e.key === "ArrowLeft" ? 0.12 : -0.12,
      );
    else if (e.key === "ArrowUp" || e.key === "ArrowDown")
      offset.applyAxisAngle(
        new THREE.Vector3(1, 0, 0),
        e.key === "ArrowUp" ? 0.12 : -0.12,
      );
    else if (e.key === "+" || e.key === "=") offset.multiplyScalar(0.9);
    else if (e.key === "-") offset.multiplyScalar(1.1);
    else return;
    e.preventDefault();
    camera.position.copy(controls.target).add(offset);
    controls.update();
    renderer.render(scene, camera);
  });
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    stopMotion(false);
    status.textContent =
      "The 3D display paused. Reload this file to restore it.";
  });
  update();
  setView("back");
  resize();
  $("loading").hidden = true;
  studio.apply(state, phase);
  document
    .querySelectorAll("button")
    .forEach((button) => (button.disabled = false));
  if (typeof VideoEncoder === "undefined") {
    $("record-video").disabled = true;
    $("record-help").textContent =
      "MP4 export is unavailable in this browser. Image and GLB export still work.";
  }
  window.__ringRoom = {
    state,
    hand,
    ring: () => ring,
    renderer,
    camera,
    controls,
    scene,
    studio,
    selectPanel,
    renderFrame,
    get recording() {
      return recording;
    },
  };
}
init().catch((error) => {
  $("loading").hidden = false;
  $("loading").textContent =
    "3D could not start. Open this file in a browser with WebGL enabled.";
  status.textContent =
    "The model files are also available separately in this folder.";
  console.error(error);
});
