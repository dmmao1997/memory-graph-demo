// ─── 记忆星图 · 球状3D + 2D滑动浏览 ───────────────────────────

const { nodes, edges } = buildGraph();
let scene, camera, renderer, raycaster, mouse;
let nodeMeshes = [], edgeLines = [];
let currentMode = "graph";
let viewState = "3d";
let selectedNode = null;
// 判断手机端
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 500;

// 手机端适配参数
const MOBILE = {
  DIST_3D: 22,      // 更远，全局感
  DIST_2D: 9,       // 2D 也不太远
  nodeScale: 1.6,   // 节点放大倍数
  textScale: 1.8,   // 文字放大倍数
  fov: 65           // 视野更宽
};

const DESKTOP = {
  DIST_3D: 18,
  DIST_2D: 8,
  nodeScale: 1.0,
  textScale: 1.0,
  fov: 55
};

const CFG = isMobile ? MOBILE : DESKTOP;

let cameraDistance = CFG.DIST_3D;
let targetDistance = CFG.DIST_3D;
const DIST_3D = CFG.DIST_3D;
const DIST_2D = CFG.DIST_2D;
let cameraAngleX = isMobile ? 0.2 : 0.3;
let targetAngleX = isMobile ? 0.2 : 0.3;
let cameraAngleY = 0;
let targetAngleY = 0;
let pinchStartDist = 0;
let touchStartX = 0, touchStartY = 0;
let touchStartTime = 0;
let wasDragging = false;

const nodeOriginalPos = new Map();
const node2DTarget = new Map();
let transitionProgress = 0;
let targetTransition = 0;

// 2D 滑动浏览
let current2DIndex = 0;
let offsetX = 0;
let targetOffsetX = 0;

// ─── 初始化 ───────────────────────────────────────────────────
function init() {
  const container = document.getElementById("canvas-container");

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a2332, 0.008);

  camera = new THREE.PerspectiveCamera(CFG.fov, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, cameraDistance);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x1a2332, 1);
  container.appendChild(renderer.domElement);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  buildSceneGraph();
  setupEvents();
  setupToggle();
  setupDetailSwipe();

  setViewState("3d");
  document.body.dataset.view = "graph";

  animate();
}

// ─── 球状分布 ────────────────────────────────────────────────
function fibonacciSphere(i, n, radius) {
  const phi = Math.acos(1 - 2 * (i + 0.5) / n);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi)
  );
}

function buildSceneGraph() {
  const selfNode = nodes.find(n => n.type === "self");
  const eventNodes = nodes.filter(n => n.type === "event");
  const entityNodes = nodes.filter(n => !["self", "event"].includes(n.type));

  // 3D：我=中心，事件=球面 r=3.5，实体=球面 r=6
  const selfMesh = createNodeMesh(selfNode, 0.5, true);
  selfMesh.position.set(0, 0, 0);
  scene.add(selfMesh);
  nodeMeshes.push(selfMesh);
  nodeOriginalPos.set(selfNode.id, selfMesh.position.clone());

  eventNodes.forEach((node, i) => {
    const pos = fibonacciSphere(i, eventNodes.length, 3.5);
    const mesh = createNodeMesh(node, 0.32);
    mesh.position.copy(pos);
    scene.add(mesh);
    nodeMeshes.push(mesh);
    nodeOriginalPos.set(node.id, pos.clone());
  });

  entityNodes.forEach((node, i) => {
    const pos = fibonacciSphere(i, entityNodes.length, 6);
    const mesh = createNodeMesh(node, 0.24);
    mesh.position.copy(pos);
    scene.add(mesh);
    nodeMeshes.push(mesh);
    nodeOriginalPos.set(node.id, pos.clone());
  });

  // 2D：压扁成 XY 平面圆盘，放大到占屏幕 ~2/3
  // 我在中心(r=0)，事件环 r=1.8，实体环 r=3.2
  node2DTarget.set(selfNode.id, new THREE.Vector3(0, 0, 0));
  eventNodes.forEach((node, i) => {
    const angle = (i / eventNodes.length) * Math.PI * 2;
    node2DTarget.set(node.id, new THREE.Vector3(Math.cos(angle) * 1.8, Math.sin(angle) * 1.8, 0));
  });
  entityNodes.forEach((node, i) => {
    const angle = (i / entityNodes.length) * Math.PI * 2 + 0.35;
    node2DTarget.set(node.id, new THREE.Vector3(Math.cos(angle) * 3.2, Math.sin(angle) * 3.2, 0));
  });

  // 连线
  edges.forEach(edge => {
    const fromMesh = nodeMeshes.find(m => m.userData.id === edge.from);
    const toMesh = nodeMeshes.find(m => m.userData.id === edge.to);
    if (fromMesh && toMesh) {
      const geo = new THREE.BufferGeometry().setFromPoints([fromMesh.position.clone(), toMesh.position.clone()]);
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
      const line = new THREE.Line(geo, mat);
      line.userData = { fromId: edge.from, toId: edge.to };
      scene.add(line);
      edgeLines.push(line);
    }
  });
}

// ─── 节点样式：3D=彩色球体，2D=白边圆盘 ─────────────────────
function createNodeMesh(node, radius, isSelf = false) {
  const group = new THREE.Group();
  const color = CATEGORIES[node.type]?.color || "#6b7280";
  const r = radius * CFG.nodeScale; // 手机端节点更大

  // 3D：彩色发光球体
  const sphereGeo = new THREE.SphereGeometry(r, 20, 20);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.9
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  group.add(sphere);

  // 3D 光晕
  const glowGeo = new THREE.SphereGeometry(r * 1.3, 16, 16);
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide
  });
  group.add(new THREE.Mesh(glowGeo, glowMat));

  // 2D：白边圆环
  const ringGeo = new THREE.RingGeometry(r * 0.82, r, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.65, side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  group.add(ring);

  // 2D：深色填充
  const fillGeo = new THREE.CircleGeometry(r * 0.82, 32);
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0x1e2d46, transparent: true, opacity: 0.88, side: THREE.DoubleSide
  });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.position.z = 0.001;
  group.add(fill);

  // 文字
  const textSprite = createInnerTextSprite(node.name, r, color);
  textSprite.position.z = 0.01;
  group.add(textSprite);

  // 点击检测
  const hitGeo = new THREE.SphereGeometry(r, 8, 8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  group.add(new THREE.Mesh(hitGeo, hitMat));

  group.userData = { ...node, baseRadius: radius, isSelf };
  return group;
}

function createInnerTextSprite(text, radius, color = "#e8ecf4") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const baseFont = text.length <= 2 ? 36 : text.length <= 4 ? 26 : 20;
  const fontSize = baseFont * CFG.textScale;
  ctx.font = `bold ${fontSize}px PingFang SC, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const s = radius * 1.5 * CFG.textScale;
  sprite.scale.set(s, s, 1);
  return sprite;
}

// ─── 事件 ────────────────────────────────────────────────────
function setupEvents() {
  const el = renderer.domElement;

  el.addEventListener("touchstart", onTouchStart, { passive: false });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd, { passive: false });

  el.addEventListener("mousedown", e => {
    wasDragging = false;
    touchStartX = e.clientX;
    touchStartY = e.clientY;
  });
  el.addEventListener("mousemove", e => {
    if (e.buttons !== 1) return;
    const dx = e.clientX - touchStartX;
    const dy = e.clientY - touchStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDragging = true;

    if (!selectedNode) {
      if (viewState === "3d") {
        targetAngleY += dx * 0.004;
        targetAngleX += dy * 0.004;
        targetAngleX = clamp(targetAngleX, -1.2, 1.2);
      } else {
        // 2D 模式：左右滑浏览节点
        targetOffsetX += dx * 0.015;
      }
      touchStartX = e.clientX;
      touchStartY = e.clientY;
    }
  });
  el.addEventListener("mouseup", () => {
    setTimeout(() => { wasDragging = false; }, 50);
  });
  el.addEventListener("click", e => {
    if (!wasDragging) checkNodeTap(e.clientX, e.clientY);
  });
  el.addEventListener("wheel", e => {
    setViewState(e.deltaY > 0 ? "2d" : "3d");
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.getElementById("detailClose").addEventListener("click", closeDetail);
}

function onTouchStart(e) {
  e.preventDefault();
  touchStartTime = Date.now();

  if (e.touches.length === 1) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    wasDragging = false;
  } else if (e.touches.length === 2) {
    pinchStartDist = getTouchDist(e);
  }
}

function onTouchMove(e) {
  e.preventDefault();

  if (e.touches.length === 1) {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) wasDragging = true;

    if (selectedNode && Math.abs(dx) > 40) {
      navigateNode(dx > 0 ? "prev" : "next");
      touchStartX = e.touches[0].clientX;
      wasDragging = false;
      return;
    }

    if (!selectedNode) {
      if (viewState === "3d") {
        targetAngleY += dx * 0.004;
        targetAngleX += dy * 0.004;
        targetAngleX = clamp(targetAngleX, -1.2, 1.2);
      } else {
        // 2D：左右滑平移视角浏览节点
        targetOffsetX += dx * 0.015;
      }
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    const dist = getTouchDist(e);
    const delta = pinchStartDist - dist;

    if (Math.abs(delta) > 25 && !wasDragging) {
      wasDragging = true;
      if (delta > 0) setViewState("2d");
      else setViewState("3d");
    }
  }
}

function onTouchEnd(e) {
  e.preventDefault();
  const tapDuration = Date.now() - touchStartTime;

  if (!wasDragging && tapDuration < 350 && e.changedTouches.length === 1) {
    const t = e.changedTouches[0];
    checkNodeTap(t.clientX, t.clientY);
  }

  wasDragging = false;
  if (e.touches.length < 2) pinchStartDist = 0;
}

function getTouchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ─── 视图切换 ────────────────────────────────────────────────
function setViewState(state) {
  if (viewState === state) return;
  viewState = state;
  targetTransition = state === "2d" ? 1 : 0;
  targetDistance = state === "2d" ? DIST_2D : DIST_3D;

  const pct = state === "3d" ? 100 : 0;
  document.getElementById("barFill").style.width = pct + "%";
  document.getElementById("barDot").style.left = pct + "%";

  if (state === "2d") {
    if (selectedNode) closeDetail();
    targetAngleX = 0;
    targetAngleY = 0;
    // 重置 2D 偏移
    targetOffsetX = 0;
    offsetX = 0;
    current2DIndex = 0;
  }
}

// ─── 节点点击 ────────────────────────────────────────────────
function checkNodeTap(x, y) {
  if (currentMode !== "graph") return;

  mouse.x = (x / window.innerWidth) * 2 - 1;
  mouse.y = -(y / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hitMeshes = nodeMeshes.map(g => g.children.find(c => c.geometry?.type === "SphereGeometry"));
  const intersects = raycaster.intersectObjects(hitMeshes);

  if (intersects.length > 0) {
    selectNode(intersects[0].object.parent);
  }
}

function selectNode(group) {
  selectedNode = group;
  const data = group.userData;
  const t = easeInOut(transitionProgress);
  const is3D = t < 0.5;

  nodeMeshes.forEach(g => {
    const isSel = g === group;
    if (is3D) {
      // 3D：球体高亮
      g.children[0].material.opacity = isSel ? 1 : 0.15;
      g.children[1].material.opacity = isSel ? 0.25 : 0.05;
    } else {
      // 2D：圆盘高亮
      g.children[2].material.opacity = isSel ? 1 : 0.2;
      g.children[3].material.opacity = isSel ? 0.95 : 0.3;
    }
  });
  edgeLines.forEach(l => {
    l.material.opacity = (l.userData.fromId === data.id || l.userData.toId === data.id) ? 0.5 : 0.06;
  });

  const catLabels = { self: "我", person: "人物", event: "事件", place: "地点", item: "物品", other: "其他" };
  document.getElementById("detailAvatar").textContent = data.name[0];
  document.getElementById("detailName").textContent = data.name;
  document.getElementById("detailCategory").textContent = catLabels[data.type] || data.type;
  document.getElementById("detailDesc").textContent = data.desc || "暂无描述";

  const fieldsEl = document.getElementById("detailFields");
  if (data.type === "self" && data.fields) {
    fieldsEl.innerHTML = data.fields.map(f => `
      <div class="detail-field">
        <div class="detail-field-label">${f.label}</div>
        <div class="detail-field-value">${f.value}</div>
      </div>
    `).join("");
    fieldsEl.classList.add("visible");
  } else {
    fieldsEl.classList.remove("visible");
  }

  document.getElementById("detailPanel").classList.add("visible");
}

function closeDetail() {
  selectedNode = null;
  document.getElementById("detailPanel").classList.remove("visible");
  const t = easeInOut(transitionProgress);
  const is3D = t < 0.5;
  nodeMeshes.forEach(g => {
    if (is3D) {
      g.children[0].material.opacity = 0.9;
      g.children[1].material.opacity = 0.15;
    } else {
      g.children[2].material.opacity = 0.65;
      g.children[3].material.opacity = 0.88;
    }
  });
  edgeLines.forEach(l => { l.material.opacity = 0.15; });
}

// ─── 详情左右滑 ──────────────────────────────────────────────
function setupDetailSwipe() {
  const panel = document.getElementById("detailPanel");
  let startX = 0;

  panel.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
    e.stopPropagation();
  }, { passive: true });

  panel.addEventListener("touchmove", e => { e.stopPropagation(); }, { passive: true });

  panel.addEventListener("touchend", e => {
    e.stopPropagation();
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) navigateNode(dx > 0 ? "prev" : "next");
  });
}

function navigateNode(direction) {
  if (!selectedNode) return;
  const currentId = selectedNode.userData.id;
  const connected = edges.filter(e => e.from === currentId || e.to === currentId);
  if (connected.length === 0) return;

  const neighborIds = connected.map(e => e.from === currentId ? e.to : e.from);
  // 简化：直接用 selectedNode 的 id 找 index
  const curIdx = neighborIds.findIndex(id => {
    const m = nodeMeshes.find(g => g.userData.id === id);
    if (!m) return false;
    // 判断是否高亮（无论 3D 球体还是 2D 圆盘）
    return m.children[0].material.opacity > 0.5 || m.children[2].material.opacity > 0.5;
  });

  const nextIdx = direction === "next"
    ? (curIdx + 1) % neighborIds.length
    : (curIdx - 1 + neighborIds.length) % neighborIds.length;

  const nextGroup = nodeMeshes.find(g => g.userData.id === neighborIds[nextIdx]);
  if (nextGroup) selectNode(nextGroup);
}

// ─── 图谱/列表切换 ───────────────────────────────────────────
function setupToggle() {
  const wrapper = document.getElementById("toggleWrapper");

  function handleToggle(e) {
    e.preventDefault();
    e.stopPropagation();
    const clicked = e.target.closest(".toggle-option");
    if (!clicked) return;
    const mode = clicked.dataset.mode;
    if (mode === currentMode) return;

    currentMode = mode;
    wrapper.dataset.mode = mode;
    document.querySelectorAll(".toggle-option").forEach(t => {
      t.classList.toggle("active", t.dataset.mode === mode);
    });

    if (mode === "list") {
      // 强制显示列表，不用 CSS 类，直接改 style
      document.body.dataset.view = "list";
      const lv = document.getElementById("listView");
      lv.style.display = "flex";
      lv.style.zIndex = "50";
      if (selectedNode) closeDetail();
      renderList("basic");
      document.querySelectorAll(".list-tab").forEach(t => {
        t.classList.toggle("active", t.dataset.tab === "basic");
      });
    } else {
      document.body.dataset.view = "graph";
      const lv = document.getElementById("listView");
      lv.style.display = "none";
    }
  }

  wrapper.addEventListener("click", handleToggle);
  wrapper.addEventListener("touchend", handleToggle);

  // 列表 tab
  function handleTab(e) {
    e.preventDefault();
    e.stopPropagation();
    const tab = e.target.closest(".list-tab");
    if (!tab) return;
    document.querySelectorAll(".list-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    renderList(tab.dataset.tab);
  }

  document.querySelector(".list-tabs").addEventListener("click", handleTab);
  document.querySelector(".list-tabs").addEventListener("touchend", handleTab);
}

function renderList(tab) {
  const container = document.getElementById("listContent");
  const items = LIST_DATA[tab];
  if (!items || items.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#5a6a84;font-size:13px;">暂无数据</div>';
    return;
  }
  container.innerHTML = items.map((item, i) => `
    <div class="list-item" style="animation-delay: ${i * 0.03}s">
      <div class="list-item-header">
        <div class="list-item-icon">${item.icon}</div>
        <div class="list-item-title">${item.title}</div>
      </div>
      <div class="list-item-value">${item.value}</div>
      ${item.time ? `<div class="list-item-time">${item.time}</div>` : ""}
    </div>
  `).join("");
}

// ─── 动画 ────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  cameraDistance += (targetDistance - cameraDistance) * 0.06;
  cameraAngleX += (targetAngleX - cameraAngleX) * 0.06;
  cameraAngleY += (targetAngleY - cameraAngleY) * 0.06;
  transitionProgress += (targetTransition - transitionProgress) * 0.12;
  offsetX += (targetOffsetX - offsetX) * 0.08;

  if (targetTransition === 1) {
    targetAngleX *= 0.92;
    targetAngleY *= 0.92;
  }

  camera.position.x = Math.sin(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
  camera.position.y = Math.sin(cameraAngleX) * cameraDistance;
  camera.position.z = Math.cos(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
  camera.lookAt(0, 0, 0);

  const t = easeInOut(transitionProgress);

  nodeMeshes.forEach((group, i) => {
    const id = group.userData.id;
    const orig = nodeOriginalPos.get(id);
    const target = node2DTarget.get(id);
    if (orig && target) {
      const pos = new THREE.Vector3().lerpVectors(orig, target, t);
      pos.x += offsetX * t;
      pos.z *= (1 - t);
      group.position.copy(pos);
      if (t > 0.5) group.rotation.set(0, 0, 0);
    }

    // ── 形态过渡：3D=球体可见，2D=圆盘可见 ──
    const sphere = group.children[0];  // 彩色球体
    const glow = group.children[1];    // 光晕
    const ring = group.children[2];    // 白边圆环
    const fill = group.children[3];    // 深色填充
    const textSprite = group.children[4]; // 文字

    // 3D 状态 (t=0)：球体可见，圆盘隐藏
    // 2D 状态 (t=1)：球体隐藏，圆盘可见
    const opacity3d = 1 - t;
    const opacity2d = t;

    sphere.material.opacity = 0.9 * opacity3d;
    sphere.visible = opacity3d > 0.05;
    glow.material.opacity = 0.15 * opacity3d;
    glow.visible = opacity3d > 0.05;

    ring.material.opacity = 0.65 * opacity2d;
    ring.visible = opacity2d > 0.05;
    fill.material.opacity = 0.88 * opacity2d;
    fill.visible = opacity2d > 0.05;

    // 文字始终可见，颜色随形态切换
    // 3D 时用类别颜色，2D 时用白色
    if (textSprite.material.map) {
      // 简单处理：始终用白色文字，3D 时球体本身有颜色
    }

    // 缩放
    if (t > 0.5) {
      const distToCenter = Math.abs(group.position.x);
      const centerScale = Math.max(0.6, 1.2 - distToCenter * 0.15);
      const breathe = 1 + Math.sin(Date.now() * 0.0015 + i * 0.7) * 0.04 * (1 - t);
      group.scale.setScalar(breathe * centerScale);
    } else {
      const s = 1 + Math.sin(Date.now() * 0.0015 + i * 0.7) * 0.04;
      group.scale.setScalar(s);
    }
  });

  edgeLines.forEach(line => {
    const fromG = nodeMeshes.find(g => g.userData.id === line.userData.fromId);
    const toG = nodeMeshes.find(g => g.userData.id === line.userData.toId);
    if (fromG && toG) {
      line.geometry.setFromPoints([fromG.position, toG.position]);
    }
  });

  renderer.render(scene, camera);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

init();
