// ─── 记忆星图 · 按参考图重制 ──────────────────────────────────

const { nodes, edges } = buildGraph();
let scene, camera, renderer, raycaster, mouse;
let nodeMeshes = [], edgeLines = [];
let currentMode = "graph";
let viewState = "3d";
let selectedNode = null;
let cameraDistance = 10;
let targetDistance = 10;
const DIST_3D = 10;
const DIST_2D = 6;
let cameraAngleX = 0, cameraAngleY = 0;
let targetAngleX = 0, targetAngleY = 0;
let pinchStartDist = 0;
let touchStartX = 0, touchStartY = 0;
let touchStartTime = 0;
let wasDragging = false;

const nodeOriginalPos = new Map();
const node2DTarget = new Map();
let transitionProgress = 0;
let targetTransition = 0;

// ─── 初始化 ───────────────────────────────────────────────────
function init() {
  const container = document.getElementById("canvas-container");

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a2332, 0.012);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
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

// ─── 建图 ────────────────────────────────────────────────────
function buildSceneGraph() {
  const selfNode = nodes.find(n => n.type === "self");
  const eventNodes = nodes.filter(n => n.type === "event");
  const entityNodes = nodes.filter(n => !["self", "event"].includes(n.type));

  // 3D 位置
  const R_EVENT = 3.2;
  const R_ENTITY = 5.8;

  const selfMesh = createNodeMesh(selfNode, 0.5, true);
  selfMesh.position.set(0, 0, 0);
  scene.add(selfMesh);
  nodeMeshes.push(selfMesh);
  nodeOriginalPos.set(selfNode.id, selfMesh.position.clone());

  eventNodes.forEach((node, i) => {
    const angle = (i / eventNodes.length) * Math.PI * 2;
    const mesh = createNodeMesh(node, 0.3);
    mesh.position.set(
      Math.cos(angle) * R_EVENT,
      (Math.random() - 0.5) * 1.6,
      Math.sin(angle) * R_EVENT
    );
    scene.add(mesh);
    nodeMeshes.push(mesh);
    nodeOriginalPos.set(node.id, mesh.position.clone());
  });

  entityNodes.forEach((node, i) => {
    const angle = (i / entityNodes.length) * Math.PI * 2 + 0.3;
    const mesh = createNodeMesh(node, 0.22);
    mesh.position.set(
      Math.cos(angle) * R_ENTITY,
      (Math.random() - 0.5) * 3,
      Math.sin(angle) * R_ENTITY
    );
    scene.add(mesh);
    nodeMeshes.push(mesh);
    nodeOriginalPos.set(node.id, mesh.position.clone());
  });

  // 2D 目标位置：所有节点挤在中心区域（按参考图）
  // 我在中心，事件环 r=1.8，实体环 r=3.2，全部在 XY 平面
  node2DTarget.set(selfNode.id, new THREE.Vector3(0, 0, 0));
  eventNodes.forEach((node, i) => {
    const angle = (i / eventNodes.length) * Math.PI * 2;
    node2DTarget.set(node.id, new THREE.Vector3(Math.cos(angle) * 1.8, Math.sin(angle) * 1.8, 0));
  });
  entityNodes.forEach((node, i) => {
    const angle = (i / entityNodes.length) * Math.PI * 2 + 0.3;
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

// ─── 创建节点：白边圆环 + 深色填充 + 内部文字 ────────────────
function createNodeMesh(node, radius, isSelf = false) {
  const group = new THREE.Group();

  // 外圈：白色描边圆环
  const ringGeo = new THREE.RingGeometry(radius * 0.85, radius, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  group.add(ring);

  // 内圆：深色半透明填充
  const fillGeo = new THREE.CircleGeometry(radius * 0.85, 32);
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0x1e2d46,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.position.z = 0.001;
  group.add(fill);

  // 文字：画在圆内部
  const textSprite = createInnerTextSprite(node.name, radius);
  textSprite.position.z = 0.01;
  group.add(textSprite);

  // 让 group 可以被 raycast
  group.userData = { ...node, baseRadius: radius, isSelf };

  // 包一层 sphere 用于点击检测（透明）
  const hitGeo = new THREE.SphereGeometry(radius, 8, 8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  group.add(hitMesh);

  return group;
}

function createInnerTextSprite(text, radius) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const size = 128;
  canvas.width = size;
  canvas.height = size;

  ctx.font = `bold ${Math.floor(size / (text.length > 3 ? text.length * 1.2 : 4))}px PingFang SC, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e8ecf4";
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const scale = radius * 1.4;
  sprite.scale.set(scale, scale, 1);
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
    if (!wasDragging && e.buttons === 1) {
      const dx = e.clientX - touchStartX;
      const dy = e.clientY - touchStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDragging = true;
      if (wasDragging && !selectedNode && viewState === "3d") {
        targetAngleY += dx * 0.004;
        targetAngleX += dy * 0.004;
        targetAngleX = clamp(targetAngleX, -1.2, 1.2);
        touchStartX = e.clientX;
        touchStartY = e.clientY;
      }
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
    } else if (!selectedNode && viewState === "3d") {
      targetAngleY += dx * 0.004;
      targetAngleX += dy * 0.004;
      targetAngleX = clamp(targetAngleX, -1.2, 1.2);
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
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

// ─── 视图状态 ────────────────────────────────────────────────
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
  }
}

// ─── 节点点击 ────────────────────────────────────────────────
function checkNodeTap(x, y) {
  if (currentMode !== "graph") return;

  mouse.x = (x / window.innerWidth) * 2 - 1;
  mouse.y = -(y / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // 用 hit mesh 做检测
  const hitMeshes = nodeMeshes.map(g => g.children.find(c => c.geometry?.type === "SphereGeometry"));
  const intersects = raycaster.intersectObjects(hitMeshes);

  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    const group = hitMesh.parent;
    selectNode(group);
  }
}

function selectNode(group) {
  selectedNode = group;
  const data = group.userData;

  // 高亮
  nodeMeshes.forEach(g => {
    const ring = g.children[0];
    const fill = g.children[1];
    if (g === group) {
      ring.material.opacity = 1;
      fill.material.opacity = 0.95;
    } else {
      ring.material.opacity = 0.3;
      fill.material.opacity = 0.4;
    }
  });
  edgeLines.forEach(l => {
    l.material.opacity = (l.userData.fromId === data.id || l.userData.toId === data.id) ? 0.5 : 0.06;
  });

  // 填充面板
  const catLabels = { self: "我", person: "人物", event: "事件", place: "地点", item: "物品", other: "其他" };
  document.getElementById("detailAvatar").textContent = data.name[0];
  document.getElementById("detailAvatar").style.background = "#4a9eff";
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

  nodeMeshes.forEach(g => {
    g.children[0].material.opacity = 0.6;
    g.children[1].material.opacity = 0.85;
  });
  edgeLines.forEach(l => {
    l.material.opacity = 0.15;
  });
}

// ─── 详情左右滑 ──────────────────────────────────────────────
function setupDetailSwipe() {
  const panel = document.getElementById("detailPanel");
  let startX = 0;

  panel.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
    e.stopPropagation();
  }, { passive: true });

  panel.addEventListener("touchmove", e => {
    e.stopPropagation();
  }, { passive: true });

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
  const idx = neighborIds.indexOf(currentId);
  const nextIdx = direction === "next"
    ? ((idx < 0 ? 0 : idx) + 1) % neighborIds.length
    : ((idx < 0 ? 0 : idx) - 1 + neighborIds.length) % neighborIds.length;

  const nextGroup = nodeMeshes.find(g => g.userData.id === neighborIds[nextIdx]);
  if (nextGroup) selectNode(nextGroup);
}

// ─── 图谱/列表切换 ───────────────────────────────────────────
function setupToggle() {
  const wrapper = document.getElementById("toggleWrapper");

  wrapper.addEventListener("click", e => {
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
      document.body.dataset.view = "list";
      closeDetail();
      renderList("basic");
      document.querySelectorAll(".list-tab").forEach(t => {
        t.classList.toggle("active", t.dataset.tab === "basic");
      });
    } else {
      document.body.dataset.view = "graph";
    }
  });

  document.querySelectorAll(".list-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".list-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderList(tab.dataset.tab);
    });
  });
}

function renderList(tab) {
  const container = document.getElementById("listContent");
  const items = LIST_DATA[tab];
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
  transitionProgress += (targetTransition - transitionProgress) * 0.05;

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
      group.position.lerpVectors(orig, target, t);
    }

    // 呼吸
    const s = 1 + Math.sin(Date.now() * 0.0015 + i * 0.7) * 0.04 * (1 - t);
    group.scale.setScalar(s);
  });

  // 连线跟随
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
