import * as THREE from "three";

export const SHAPES = [
  "round",
  "oval",
  "pear",
  "marquise",
  "emerald",
  "princess",
  "cushion",
  "radiant",
  "asscher",
  "heart",
];
const METALS = { gold: 0xd8b264, white: 0xe4e6e9, rose: 0xd3a08c };

export function outline(shape = "round", count = 48) {
  let p = [];
  if (["emerald", "radiant", "asscher", "princess"].includes(shape)) {
    const w = shape === "emerald" ? 0.34 : shape === "radiant" ? 0.38 : 0.5;
    const corner =
      shape === "asscher" ? 0.2 : shape === "princess" ? 0.025 : 0.1;
    p = [
      [-w + corner, 0.5],
      [w - corner, 0.5],
      [w, 0.5 - corner],
      [w, -0.5 + corner],
      [w - corner, -0.5],
      [-w + corner, -0.5],
      [-w, -0.5 + corner],
      [-w, 0.5 - corner],
    ].map((a) => new THREE.Vector2(...a));
  } else if (shape === "pear" || shape === "marquise") {
    const s = new THREE.Shape();
    s.moveTo(0, 0.5);
    if (shape === "pear") {
      s.bezierCurveTo(-0.075, 0.29, -0.365, 0.1, -0.365, -0.15);
      s.bezierCurveTo(-0.365, -0.56, 0.365, -0.56, 0.365, -0.15);
      s.bezierCurveTo(0.365, 0.1, 0.075, 0.29, 0, 0.5);
    } else {
      s.bezierCurveTo(-0.34, 0.19, -0.34, -0.19, 0, -0.5);
      s.bezierCurveTo(0.34, -0.19, 0.34, 0.19, 0, 0.5);
    }
    p = s.getSpacedPoints(count).slice(0, -1);
  } else {
    for (let i = 0; i < count; i++) {
      const a = (i * 2 * Math.PI) / count;
      let x, y;
      if (shape === "heart") {
        x = (16 * Math.sin(a) ** 3) / 32;
        y =
          (13 * Math.cos(a) -
            5 * Math.cos(2 * a) -
            2 * Math.cos(3 * a) -
            Math.cos(4 * a)) /
          32;
      } else if (shape === "cushion") {
        x = Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** 0.53 * 0.43;
        y = Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** 0.53 * 0.5;
      } else {
        x = Math.cos(a) * (shape === "oval" ? 0.34 : 0.5);
        y = Math.sin(a) * 0.5;
      }
      p.push(new THREE.Vector2(x, y));
    }
  }
  const box = new THREE.Box2().setFromPoints(p),
    center = box.getCenter(new THREE.Vector2());
  const h = box.max.y - box.min.y;
  p.forEach((v) => v.sub(center).divideScalar(h));
  let area = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    area += p[i].x * q.y - q.x * p[i].y;
  }
  if (area < 0) p.reverse();
  return p;
}

export function gemGeometry(shape, length) {
  const p = outline(shape),
    n = p.length,
    points = [],
    indices = [];
  const stepcut = shape === "emerald" || shape === "asscher";
  // Pavilion tip → pavilion break → girdle (two edges) → crown break → table.
  const levels = stepcut
    ? [
        [0.1, -0.29],
        [0.55, -0.19],
        [1, -0.013],
        [1, 0.013],
        [0.82, 0.085],
        [0.6, 0.15],
      ]
    : [
        [0.025, -0.31],
        [0.46, -0.205],
        [1, -0.014],
        [1, 0.014],
        [0.8, 0.085],
        [0.54, 0.145],
      ];
  levels.forEach(([r, z], layer) =>
    p.forEach((v, i) => {
      const stagger =
        !stepcut && (layer === 1 || layer === 4)
          ? 1 + 0.025 * (i % 2 ? 1 : -1)
          : 1;
      points.push(
        v.x * r * length * stagger,
        v.y * r * length * stagger,
        z * length,
      );
    }),
  );
  for (let k = 0; k < levels.length - 1; k++)
    for (let i = 0; i < n; i++) {
      const a = k * n + i,
        b = k * n + ((i + 1) % n),
        c = (k + 1) * n + i,
        d = (k + 1) * n + ((i + 1) % n);
      indices.push(a, b, c, b, d, c);
    }
  const table = p.map((v) => new THREE.Vector2(v.x, v.y));
  const triangles = THREE.ShapeUtils.triangulateShape(table, []);
  for (const t of triangles)
    indices.push(...t.map((i) => i + (levels.length - 1) * n));
  for (let i = 1; i < n - 1; i++) indices.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  g.setIndex(indices);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}

function diamond(shape, length, appearance = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf5f8ff,
    metalness: 0,
    roughness: 0.015,
    transmission: 0.58,
    thickness: length * 0.65,
    ior: 2.42,
    dispersion: appearance.fire ?? 0.055,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    envMapIntensity: appearance.sparkle ?? 2.8,
  });
  const stone = new THREE.Mesh(gemGeometry(shape, length), material);
  stone.name = shape + " faceted example stone";
  stone.castShadow = true;
  return stone;
}
function tube(points, radius, material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  const m = new THREE.Mesh(
    new THREE.TubeGeometry(
      curve,
      Math.max(24, points.length * 5),
      radius,
      10,
      closed,
    ),
    material,
  );
  m.castShadow = true;
  return m;
}
function pointsOnPerimeter(p, count) {
  const curve = new THREE.CurvePath();
  for (let i = 0; i < p.length; i++)
    curve.add(new THREE.LineCurve(p[i], p[(i + 1) % p.length]));
  return Array.from({ length: count }, (_, i) => curve.getPointAt(i / count));
}
function bandGeometry(inner, width) {
  const mid = inner + 0.56;
  const profile = [];
  // Rounded comfort-fit inner edge and a domed, polished outer face.
  for (let i = 0; i <= 48; i++) {
    const a = (i * 2 * Math.PI) / 48;
    profile.push(
      new THREE.Vector2(mid + Math.cos(a) * 0.56, (Math.sin(a) * width) / 2),
    );
  }
  return new THREE.LatheGeometry(profile, 192);
}

export function createRing(state) {
  const group = new THREE.Group();
  group.name = `${state.style} · ${state.setting} example ring`;
  if (state.style === "none") return group;
  const material = new THREE.MeshPhysicalMaterial({
    color: METALS[state.metal],
    metalness: 1,
    roughness: 0.145,
    clearcoat: 0.35,
    clearcoatRoughness: 0.09,
    envMapIntensity: 1.15,
  });
  const r = state.diameter / 2;
  const band = new THREE.Mesh(bandGeometry(r, state.width), material);
  band.name = `Polished comfort band ${state.width.toFixed(1)}mm`;
  band.castShadow = true;
  group.add(band);
  if (state.style === "band") return group;
  const head = new THREE.Group();
  head.rotation.z = THREE.MathUtils.degToRad(state.orientation);
  group.add(head);
  const length = state.stone,
    z = r + 1.12 + length * 0.32 + 0.35;
  const p = outline(state.style);
  const stone = diamond(state.style, length, state);
  stone.position.z = z;
  head.add(stone);
  // Open basket below the stone, instead of a stone suspended above the band.
  head.add(
    tube(
      p.map(
        (v) =>
          new THREE.Vector3(
            v.x * length * 0.68,
            v.y * length * 0.68,
            z - length * 0.13,
          ),
      ),
      0.18,
      material,
      true,
    ),
  );
  const targets =
    state.style === "pear"
      ? [
          [0, 0.5],
          [-0.25, 0.13],
          [0.25, 0.13],
          [-0.23, -0.3],
          [0.23, -0.3],
        ]
      : state.style === "marquise"
        ? [
            [0, 0.5],
            [0, -0.5],
            [-0.2, 0.16],
            [0.2, 0.16],
            [-0.2, -0.16],
            [0.2, -0.16],
          ]
        : ["emerald", "radiant", "asscher", "princess", "cushion"].includes(
              state.style,
            )
          ? [
              [-0.32, -0.4],
              [0.32, -0.4],
              [-0.32, 0.4],
              [0.32, 0.4],
            ]
          : [
              [-0.34, -0.34],
              [0.34, -0.34],
              [-0.34, 0.34],
              [0.34, 0.34],
            ];
  for (const target of targets) {
    const t = new THREE.Vector2(...target);
    const q = p.reduce(
      (best, v) =>
        v.distanceToSquared(t) < best.distanceToSquared(t) ? v : best,
      p[0],
    );
    const tip = new THREE.Vector3(
      q.x * length * 0.965,
      q.y * length * 0.965,
      z + 0.035 * length,
    );
    head.add(
      tube(
        [
          new THREE.Vector3(q.x * length * 0.35, q.y * length * 0.35, r + 1),
          new THREE.Vector3(
            q.x * length * 0.86,
            q.y * length * 0.86,
            z - length * 0.15,
          ),
          tip,
        ],
        0.18,
        material,
      ),
    );
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.225, 14, 10),
      material,
    );
    cap.position.copy(tip);
    cap.castShadow = true;
    head.add(cap);
  }
  // Cathedral shoulders connect the band to the underside of the basket.
  for (const sign of [-1, 1])
    head.add(
      tube(
        [
          new THREE.Vector3(sign * (r + 0.5) * 0.64, 0, (r + 0.5) * 0.77),
          new THREE.Vector3(sign * length * 0.47, 0, r + 1.5),
          new THREE.Vector3(sign * length * 0.3, 0, z - length * 0.14),
        ],
        0.37,
        material,
      ),
    );
  if (state.setting === "halo") {
    const perimeter = pointsOnPerimeter(
      p,
      Math.max(22, Math.round(length * 3.7)),
    );
    const rail = [];
    perimeter.forEach((v, i) => {
      const before = perimeter[(i + perimeter.length - 1) % perimeter.length],
        after = perimeter[(i + 1) % perimeter.length];
      const tangent = after.clone().sub(before).normalize();
      const normal = new THREE.Vector2(tangent.y, -tangent.x);
      const q = v.clone().multiplyScalar(length).addScaledVector(normal, 0.6);
      rail.push(new THREE.Vector3(q.x, q.y, z - 0.11));
      const accent = diamond("round", 1.02);
      accent.position.set(q.x, q.y, z + 0.08);
      head.add(accent);
    });
    head.add(tube(rail, 0.27, material, true));
  }
  if (state.setting === "pave" || state.setting === "three") {
    if (state.setting === "three")
      for (const sign of [-1, 1]) {
        const side = diamond("round", length * 0.4);
        const halfWidth = Math.max(...p.map((v) => abs(v.x))) * length;
        side.position.set(
          sign * (halfWidth + length * 0.22 + 0.25),
          0,
          z - length * 0.08,
        );
        head.add(side);
        head.add(
          tube(
            [
              new THREE.Vector3(sign * (r + 0.4) * 0.6, 0, (r + 0.4) * 0.8),
              side.position
                .clone()
                .add(new THREE.Vector3(0, 0, -length * 0.13)),
            ],
            0.27,
            material,
          ),
        );
      }
    if (state.setting === "pave")
      for (const sign of [-1, 1])
        for (let i = 0; i < 7; i++) {
          const a = sign * (0.35 + i * 0.115),
            radius = r + 1.15;
          const small = diamond("round", Math.min(state.width * 0.65, 1.3));
          small.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
          small.rotation.y = a;
          group.add(small);
          const bead = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 8, 6),
            material,
          );
          bead.position
            .copy(small.position)
            .add(new THREE.Vector3(0, state.width * 0.3, 0.15));
          group.add(bead);
        }
  }
  group.userData = {
    shape: state.style,
    setting: state.setting,
    orientationDegrees: state.orientation,
    innerDiameterMM: state.diameter,
    bandWidthMM: state.width,
    stoneLengthMM: state.stone,
    reportedSize: "10",
    sizingStandard: "unknown",
    scaleStatus: "provisional",
  };
  return group;
}
const abs = Math.abs;

export function createStackBands(state) {
  const group = new THREE.Group();
  group.name = "Additional bands";
  if (state.band === "none") return group;
  const metal = state.bandMetal === "match" ? state.metal : state.bandMetal;
  const material = new THREE.MeshPhysicalMaterial({
    color: METALS[metal],
    metalness: 1,
    roughness: 0.15,
    clearcoat: 0.3,
    envMapIntensity: 1.15,
  });
  const width = state.bandWidth,
    r = state.diameter / 2;
  const primary = state.style !== "none";
  const distance = primary
    ? (state.width + width) / 2 + state.gap
    : state.bandPlacement === "both"
      ? (width + state.gap) / 2
      : 0;
  const signs =
    state.bandPlacement === "both"
      ? [-1, 1]
      : [state.bandPlacement === "tip" ? 1 : -1];
  for (const sign of signs) {
    const vertices = [],
      indices = [];
    const around = 192,
      profile = 24;
    const curve = (a) => {
      const front = Math.min(a, Math.PI * 2 - a);
      if (state.band === "chevron")
        return sign * Math.max(0, 1 - front / 0.57) * 2.6;
      if (state.band === "contour")
        return sign * Math.exp(-((front / 0.38) ** 2)) * 2.4;
      return 0;
    };
    for (let i = 0; i <= around; i++) {
      const a = (i * 2 * Math.PI) / around;
      for (let j = 0; j <= profile; j++) {
        const b = (j * 2 * Math.PI) / profile;
        const rr = r + 0.55 + Math.cos(b) * 0.55;
        vertices.push(
          Math.sin(a) * rr,
          sign * distance + curve(a) + (Math.sin(b) * width) / 2,
          Math.cos(a) * rr,
        );
      }
    }
    for (let i = 0; i < around; i++)
      for (let j = 0; j < profile; j++) {
        const a = i * (profile + 1) + j,
          b = a + profile + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = `${state.band} band · ${sign < 0 ? "wrist" : "fingertip"} side`;
    mesh.castShadow = true;
    group.add(mesh);
    if (state.band === "pave")
      for (let i = -7; i <= 7; i++) {
        const a = i * 0.105;
        const small = diamond("round", Math.min(width * 0.65, 1.25));
        small.position.set(
          Math.sin(a) * (r + 1.11),
          sign * distance,
          Math.cos(a) * (r + 1.11),
        );
        small.rotation.y = a;
        group.add(small);
      }
  }
  group.userData = {
    bandStyle: state.band,
    placement: state.bandPlacement,
    widthMM: width,
    gapMM: state.gap,
    metal,
    sizingStandard: "unknown",
    scaleStatus: "provisional",
  };
  return group;
}
