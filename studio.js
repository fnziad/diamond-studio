import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const LIGHT_PRESETS = {
  sunny: { front: 3.3, back: 0.35, environment: 1.1 },
  evening: { front: 1.5, back: 1.2, environment: 0.35 },
  soft: { front: 1.65, back: 0.65, environment: 0.72 },
  spot: { front: 2.5, back: 0.15, environment: 0.55 },
  back: { front: 0.2, back: 2.8, environment: 0.6 },
  balanced: { front: 1.2, back: 1.2, environment: 0.8 },
};

export function createStudio(renderer, scene, stage) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const soft = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  // Narrow white cards in a dark room create moving facet reflections without
  // painting star sprites or treating the camera flare as diamond geometry.
  const contrastRoom = new THREE.Scene();
  contrastRoom.background = new THREE.Color(0x090b10);
  const cards = [
    [-9, 6, 9, 2.5, 9, 13],
    [8, 2, 6, 1.1, 7, 18],
    [0, 9, -4, 5, 2, 8],
    [-3, -5, 7, 5, 1.3, 5],
    [3, 2, -9, 0.8, 8, 16],
  ];
  for (const [x, y, z, w, h, brightness] of cards) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setScalar(brightness),
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    contrastRoom.add(m);
  }
  const contrast = pmrem.fromScene(contrastRoom, 0.012).texture;
  contrastRoom.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  pmrem.dispose();
  const ambient = new THREE.AmbientLight(0xffffff, 0.1);
  const front = new THREE.DirectionalLight(0xfff5eb, 1.65);
  const back = new THREE.DirectionalLight(0xe7efff, 0.65);
  front.castShadow = true;
  front.shadow.mapSize.set(1024, 1024);
  front.shadow.blurSamples = 8;
  Object.assign(front.shadow.camera, {
    left: -145,
    right: 145,
    top: 150,
    bottom: -150,
    near: 1,
    far: 600,
  });
  front.shadow.camera.updateProjectionMatrix();
  front.shadow.bias = -0.0003;
  front.shadow.normalBias = 0.08;
  front.shadow.radius = 6;
  scene.add(ambient, front, back);
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.ShadowMaterial({ color: 0x222831, opacity: 0.13 }),
  );
  backdrop.position.z = -19;
  backdrop.receiveShadow = true;
  scene.add(backdrop);
  function apply(state, phase = 0) {
    stage.dataset.background = state.background;
    const css = getComputedStyle(stage);
    const color = new THREE.Color(
      css.getPropertyValue("--stage-background").trim(),
    );
    scene.background = color;
    renderer.setClearColor(color, 1);
    const angle =
      THREE.MathUtils.degToRad(state.lightAngle) +
      (state.motion === "lights" ? phase : 0);
    front.position.set(Math.sin(angle) * 200, 90, Math.cos(angle) * 200);
    back.position.set(-Math.sin(angle) * 180, 40, -Math.cos(angle) * 180);
    front.color.set(state.lightMode === "evening" ? 0xffcc99 : 0xfff5eb);
    back.color.set(state.lightMode === "evening" ? 0xffae72 : 0xe7efff);
    front.intensity = state.front;
    back.intensity = state.back;
    ambient.intensity = state.lightMode === "spot" ? 0.035 : 0.1;
    scene.environment =
      state.lightMode === "soft" || state.lightMode === "balanced"
        ? soft
        : contrast;
    scene.environmentIntensity = state.environment;
    scene.environmentRotation.set(0, angle + 0.4, 0);
    renderer.toneMappingExposure = state.exposure;
    backdrop.visible = state.shadows;
    backdrop.material.opacity = state.background === "black" ? 0.08 : 0.13;
  }
  return { apply, front, back, ambient, backdrop };
}
