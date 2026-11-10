import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { diamond, gemGeometry, createRing } from "./jewelry.js";
import { createStudio, LIGHT_PRESETS } from "./studio.js";

globalThis.pdfjsWorker = { WorkerMessageHandler };
const $ = (id) => document.getElementById(id);
const state = {
  background: "black", lightMode: "soft", front: 1.65, back: 0.65,
  environment: 0.72, exposure: 1, lightAngle: -30, shadows: false,
  motion: "lights", fire: 0.055, sparkle: 2.8,
};
const viewport = $("viewport");
let renderer, scene, camera, controls, studio, stone, pavilion, ring;
let phase = 0;
let playing = false;
let animation = 0;
let previousTime = 0;

function render() {
  studio.apply(state, phase);
  renderer.render(scene, camera);
}
function rebuild() {
  const length = $("length").valueAsNumber;
  if (!Number.isFinite(length) || length < 2 || length > 20) {
    $("length").setAttribute("aria-invalid", "true");
    return;
  }
  $("length").removeAttribute("aria-invalid");
  if (ring) {
    scene.remove(ring);
    ring.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
    ring = null;
  }
  if (stone) {
    scene.remove(stone);
    stone.geometry.dispose();
    stone.material.dispose();
    stone = null;
  }
  if (pavilion) {
    scene.remove(pavilion);
    pavilion.geometry.dispose();
    pavilion.material.dispose();
    pavilion = null;
  }
  const shape = $("shape").value.toLowerCase();
  const ringView = $("presentation").value === "ring";
  document.querySelectorAll(".ring-option").forEach((option) => { option.hidden = !ringView; });
  $("preview-label").textContent = ringView ? "Diamond in a ring" : "Loose diamond";
  const source = gemGeometry(shape, length);
  const position = source.getAttribute("position");
  const triangles = [];
  for (let i = 0; i < position.count; i += 3) {
    if (Math.max(position.getZ(i), position.getZ(i + 1), position.getZ(i + 2)) > 0) continue;
    for (let j = 0; j < 3; j++) triangles.push(position.getX(i + j), position.getY(i + j), position.getZ(i + j));
  }
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(triangles, 3));
  geometry.computeVertexNormals();
  pavilion = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0xdde4eb, metalness: 0.72, roughness: 0.08, side: THREE.DoubleSide,
    envMapIntensity: state.sparkle,
  }));
  pavilion.scale.setScalar(0.98);
  scene.add(pavilion);
  if (ringView) {
    ring = createRing({
      style: shape, setting: $("setting").value, metal: $("metal").value,
      diameter: 16, width: 2, stone: length, orientation: 0,
      fire: state.fire, sparkle: state.sparkle,
    });
    ring.position.z = -(8 + 1.12 + length * 0.32 + 0.35);
    scene.add(ring);
    render();
    return;
  }
  stone = diamond(shape, length, state);
  scene.add(stone);
  render();
}
function setView(view) {
  const distance = Math.max(18, $("length").valueAsNumber * 3);
  if (view === "face") camera.position.set(0, 0, distance);
  if (view === "side") camera.position.set(distance, 0, 0.01);
  if (view === "pavilion") camera.position.set(0, 0, -distance);
  camera.up.set(0, 1, 0);
  controls.target.set(0, 0, 0);
  controls.update();
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  });
  render();
}
function tick(time) {
  if (!playing) return;
  if (previousTime) phase += Math.min((time - previousTime) / 1000, 0.1) * 0.45;
  previousTime = time;
  render();
  animation = requestAnimationFrame(tick);
}
function updateLighting() {
  state.lightMode = $("preset").value;
  state.background = $("background").value;
  state.lightAngle = Number($("angle").value);
  state.front = Number($("front").value);
  state.back = Number($("back").value);
  $("angle-value").textContent = state.lightAngle + "°";
  $("front-value").textContent = state.front.toFixed(2) + "×";
  $("back-value").textContent = state.back.toFixed(2) + "×";
  render();
}
async function importReport(file) {
  $("report-status").textContent = "Reading report locally…";
  try {
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), useWorkerFetch: false }).promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(" ").replace(/\s+/g, " ");
    const match = (pattern) => text.match(pattern)?.[1];
    const weight = match(/Carat Weight\s+(\d+(?:\.\d+)?)\s+CARAT/i);
    const measurements = text.match(/Measurements\s+(\d+(?:\.\d+)?)\s*(?:[-–]|[x×])\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    const shape = match(/Shape and Cutting Style\s+([A-Z ]+?)(?=\s+Measurements)/i);
    const color = match(/Color Grade\s+([D-Z])\b/i);
    const clarity = match(/Clarity Grade\s+((?:IF|FL|VVS|VS|SI|I)\s*[123]?)/i);
    const cut = match(/Cut Grade\s+(IDEAL|EXCELLENT|VERY GOOD|GOOD|FAIR|POOR)/i);
    if (!weight && !measurements) throw new Error("No readable report details");
    if (weight) $("carat").value = weight;
    if (measurements) {
      $("length").value = measurements[1];
      $("dimension-help").textContent = "Report measurements: " + measurements.slice(1).join(" × ") + " mm. The preview uses the first dimension for scale.";
    }
    if (shape) {
      const name = shape.trim().split(" ")[0].toLowerCase();
      const option = [...$("shape").options].find((o) => o.value.toLowerCase() === name);
      if (option) $("shape").value = option.value;
    }
    $("color").value = color || "";
    $("clarity").value = clarity || "";
    $("cut").value = cut || "";
    $("report-status").textContent = "Review the extracted values against the report.";
    rebuild();
    setView("face");
  } catch {
    $("report-status").textContent = "Could not read report text. Enter values manually; image-only reports are not supported.";
  }
}
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  viewport.append(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "Rotatable loose diamond. Arrow keys rotate, plus and minus zoom.");
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 100;
  controls.addEventListener("change", render);
  studio = createStudio(renderer, scene, document.querySelector(".stage"));
  const resize = () => {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };
  new ResizeObserver(resize).observe(viewport);
  for (const id of ["shape", "presentation", "setting", "metal"]) $(id).addEventListener("change", rebuild);
  $("length").addEventListener("input", rebuild);
  $("carat").addEventListener("input", () => {
    const value = $("carat").valueAsNumber;
    if (!Number.isFinite(value) || value < 0.1 || value > 8) return;
    $("length").value = (6.5 * Math.cbrt(value)).toFixed(2);
    $("dimension-help").textContent = "Estimated size from weight. Enter a measured length for a closer scale.";
    rebuild();
  });
  $("report-file").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) importReport(file);
    event.target.value = "";
  });
  $("preset").addEventListener("change", () => {
    const preset = LIGHT_PRESETS[$("preset").value];
    $("front").value = preset.front;
    $("back").value = preset.back;
    state.environment = preset.environment;
    updateLighting();
  });
  for (const id of ["background", "angle", "front", "back"]) $(id).addEventListener("input", updateLighting);
  for (const id of ["fire", "sparkle"]) $(id).addEventListener("input", () => {
    state[id] = Number($(id).value);
    rebuild();
  });
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("animate").addEventListener("click", () => {
    playing = !playing;
    $("animate").textContent = playing ? "Pause light sweep" : "Play light sweep";
    $("animate").setAttribute("aria-pressed", String(playing));
    previousTime = 0;
    if (playing) animation = requestAnimationFrame(tick);
    else cancelAnimationFrame(animation);
  });
  $("save").addEventListener("click", () => {
    renderer.domElement.toBlob((blob) => {
      if (!blob) { $("status").textContent = "Could not save image."; return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "diamond-inspection.png";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $("status").textContent = "Image saved.";
    }, "image/png");
  });
  renderer.domElement.addEventListener("keydown", (event) => {
    const offset = camera.position.clone().sub(controls.target);
    if (event.key === "ArrowLeft") offset.applyAxisAngle(camera.up, 0.12);
    else if (event.key === "ArrowRight") offset.applyAxisAngle(camera.up, -0.12);
    else if (event.key === "ArrowUp") offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.12);
    else if (event.key === "ArrowDown") offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.12);
    else if (event.key === "+" || event.key === "=") offset.multiplyScalar(0.9);
    else if (event.key === "-") offset.multiplyScalar(1.1);
    else return;
    event.preventDefault();
    camera.position.copy(controls.target).add(offset);
    controls.update();
  });
  rebuild();
  setView("face");
  resize();
  $("loading").hidden = true;
  document.querySelectorAll("button").forEach((button) => { button.disabled = false; });
} catch (error) {
  $("loading").textContent = "3D could not start. Open in a browser with WebGL enabled.";
  console.error(error);
}
