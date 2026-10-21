// ─── 记忆星图 · 3D 交互引擎（两态版） ─────────────────────────

const { nodes, edges } = buildGraph();
let scene, camera, renderer, raycaster, mouse;
let nodeMeshes = [], edgeLines = [];
let currentMode = "graph";
let viewState = "3d"; // "3d" | "2d"
let selectedNode = null;
let cameraDistance = 14;
let targetDistance = 14;
const DIST_3D = 14;
const DIST_2D = 5;
let cameraAngleX = 0, cameraAngleY = 0;
let targetAngleX = 0, targetAngleY = 0;
let isDragging = false;
let pinchStartDist = 0;
let pinchStartView = "3d";
let touchStartX = 0, touchStartY = 0;
let touchStartTime = 0;
let wasDragging = false;

// 节点原始 3D 位置 & 2D 目标位置
const nodeOriginalPos = new Map();
const node2DTarget = new Map();
let transitionProgress = 1; // 0=3D, 1=2D
let targetTransition = 1;

// ─── 初始化 ───────────────────────────────────────────────────
function init() {
  const container = document.getElementById("canvas-container");

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a1628, 0.015);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, cameraDistance);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0a1628, 1);
  container.appendChild(renderer.domElement);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  createStars();
  buildSceneGraph();
  setupEvents();
  setupToggle();
  setupDetailSwipe();

  // 默认 3D 态
  setViewState("3d");
  document.body.dataset.view = "graph";

  animate();
}

// ─── 背景星星 ────────────────────────────────────────────────
function createStars() {
  const geo = new THREE.BufferGeometry();
  const count = 1500;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    pos[i] = (Math.random() - 0.5) * 180;
    pos[i + 1] = (Math.random() - 0.5) * 180;
    pos[i + 2] = (Math.random() - 0.5) * 180;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.5 });
  scene.add(new THREE.Points(geo, mat));
}

// ─── 建图 ────────────────────────────────────────────────────
function buildSceneGraph() {
  const selfNode = nodes.find(n => n.type === "self");
  const eventNodes = nodes.filter(n => n.type === "event");
  const entityNodes = nodes.filter(n => !["self", "event"].includes(n.type));

  // 3D 位置：我=中心，事件=内环，实体=外环
  const R_EVENT = 3.8;
  const R_ENTITY = 6.5;

  const selfMesh = createNodeMesh(selfNode, 0.55);
  selfMesh.position.set(0, 0, 0);
  scene.add(selfMesh);
  nodeMeshes.push(selfMesh);
  nodeOriginalPos.set(selfMesh.userData.id, selfMesh.position.clone());

  eventNodes.forEach((node, i) => {
    const angle = (i / eventNodes.length) * Math.PI * 2;
    const mesh = createNodeMesh(node, 0.35);
    mesh.position.set(
      Math.cos(angle) * R_EVENT,
      (Math.random() - 0.5) * 1.8,
      Math.sin(angle) * R_EVENT
    );
    scene.add(mesh);
    nodeMeshes.push(mesh);
    nodeOriginalPos.set(mesh.userData.id, mesh.position.clone());
  });

  entityNodes.forEach((node, i) => {
    const angle = (i / entityNodes.length) * Math.PI * 2 + 0.35;
    const mesh = createNodeMesh(node, 0.28);
    mesh.position.set(
      Math.cos(angle) * R_ENTITY,
      (Math.random() - 0.5) * 3.5,
      Math.sin(angle) * R_ENTITY
    );
    scene.add(mesh);
    nodeMeshes.push(mesh);
    nodeOriginalPos.set(mesh.userData.id, mesh.position.clone());
  });

  // 2D 目标位置：环形平铺（XY 平面，Z=0）
  // 我在中心，事件环 r=2.2，实体环 r=4.2
  const R2_EVENT = 2.2;
  const R2_ENTITY = 4.2;

  node2DTarget.set(selfNode.id, new THREE.Vector3(0, 0, 0));
  eventNodes.forEach((node, i) => {
    const angle = (i / eventNodes.length) * Math.PI * 2;
    node2DTarget.set(node.id, new THREE.Vector3(Math.cos(angle) * R2_EVENT, Math.sin(angle) * R2_EVENT, 0));
  });
  entityNodes.forEach((node, i) => {
    const angle = (i / entityNodes.length) * Math.PI * 2 + 0.35;
    node2DTarget.set(node.id, new THREE.Vector3(Math.cos(angle) * R2_ENTITY, Math.sin(angle) * R2_ENTITY, 0));
  });

  // 连线
  edges.forEach(edge => {
    const fromMesh = nodeMeshes.find(m => m.userData.id === edge.from);
    const toMesh = nodeMeshes.find(m => m.userData.id === edge.to);
    if (fromMesh && toMesh) {
      const geo = new THREE.BufferGeometry().setFromPoints([fromMesh.position.clone(), toMesh.position.clone()]);
      const mat = new THREE.LineBasicMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.25 });
      const line = new THREE.Line(geo, mat);
      line.userData = { fromId: edge.from, toId: edge.to };
      scene.add(line);
      edgeLines.push(line);
    }
  });
}

// ─── 创建节点 ────────────────────────────────────────────────
function createNodeMesh(node, size) {
  const color = CATEGORIES[node.type]?.color || "#6b7280";
  const geo = new THREE.SphereGeometry(size, 20, 20);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { ...node, baseSize: size };

  // 外圈光晕
  const ringGeo = new THREE.RingGeometry(size * 1.25, size * 1.45, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide
  });
  mesh.add(new THREE.Mesh(ringGeo, ringMat));

  // 文字
  const sprite = createTextSprite(node.name, color);
  sprite.position.y = size + 0.35;
  mesh.add(sprite);

  return mesh;
}

function createTextSprite(text, color) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 256;
  canvas.height = 56;
  ctx.font = "bold 26px PingFang SC, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 28);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.8, 0.4, 1);
  return sprite;
}

// ─── 事件绑定 ────────────────────────────────────────────────
function setupEvents() {
  const el = renderer.domElement;

  el.addEventListener("touchstart", onTouchStart, { passive: false });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd, { passive: false });

  // 桌面调试用
  el.addEventListener("mousedown", e => {
    isDragging = true;
    touchStartX = e.clientX;
    touchStartY = e.clientY;
  });
  el.addEventListener("mousemove", e => {
    if (!isDragging || selectedNode) return;
    const dx = e.clientX - touchStartX;
    const dy = e.clientY - touchStartY;
    targetAngleY += dx * 0.004;
    targetAngleX += dy * 0.004;
    targetAngleX = clamp(targetAngleX, -1.2, 1.2);
    touchStartX = e.clientX;
    touchStartY = e.clientY;
  });
  el.addEventListener("mouseup", () => { isDragging = false; });
  el.addEventListener("wheel", e => {
    if (e.deltaY > 0) setViewState("2d");
    else setViewState("3d");
  });
  el.addEventListener("click", e => {
    if (!wasDragging) checkNodeTap(e.clientX, e.clientY);
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.getElementById("detailClose").addEventListener("click", closeDetail);
}

// ─── 触摸 ────────────────────────────────────────────────────
function onTouchStart(e) {
  e.preventDefault();
  touchStartTime = Date.now();
  wasDragging = false;

  if (e.touches.length === 1) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    pinchStartDist = getTouchDist(e);
    pinchStartView = viewState;
  }
}

function onTouchMove(e) {
  e.preventDefault();

  if (e.touches.length === 1) {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;

    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) wasDragging = true;

    if (selectedNode && Math.abs(dx) > 40) {
      // 详情面板左右滑
      navigateNode(dx > 0 ? "prev" : "next");
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      wasDragging = false;
    } else if (!selectedNode && viewState === "3d") {
      // 3D 模式单指旋转
      targetAngleY += dx * 0.004;
      targetAngleX += dy * 0.004;
      targetAngleX = clamp(targetAngleX, -1.2, 1.2);
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  } else if (e.touches.length === 2) {
    const dist = getTouchDist(e);
    const delta = pinchStartDist - dist; // 正=手指分开(放大)，负=捏合

    if (Math.abs(delta) > 30 && !wasDragging) {
      wasDragging = true;
      if (delta > 0) {
        // 手指分开 → 放大 → 二维详情
        setViewState("2d");
      } else {
        // 手指捏合 → 缩小 → 三维全局
        setViewState("3d");
      }
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

// ─── 视图状态切换 ────────────────────────────────────────────
function setViewState(state) {
  if (viewState === state) return;
  viewState = state;
  targetTransition = state === "2d" ? 1 : 0;
  targetDistance = state === "2d" ? DIST_2D : DIST_3D;

  // 更新底部进度条
  document.getElementById("barFill").style.width = state === "3d" ? "100%" : "0%";

  // 2D 时关闭详情
  if (state === "2d" && selectedNode) closeDetail();

  // 2D 时相机正对
  if (state === "2d") {
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
  const intersects = raycaster.intersectObjects(nodeMeshes);

  if (intersects.length > 0) {
    selectNode(intersects[0].object);
  }
}

function selectNode(mesh) {
  selectedNode = mesh;
  const data = mesh.userData;
  const cat = CATEGORIES[data.type];

  // 高亮选中，其他变暗
  nodeMeshes.forEach(m => {
    m.material.opacity = m === mesh ? 1 : 0.25;
    m.material.transparent = true;
  });
  edgeLines.forEach(l => {
    l.material.opacity = (l.userData.fromId === data.id || l.userData.toId === data.id) ? 0.6 : 0.08;
  });

  // 填充面板
  document.getElementById("detailAvatar").textContent = cat.icon;
  document.getElementById("detailAvatar").style.background = cat.color;
  document.getElementById("detailName").textContent = data.name;

  const catEl = document.getElementById("detailCategory");
  catEl.textContent = cat.label;
  catEl.className = `detail-category cat-${data.type}`;
  document.getElementById("detailDesc").textContent = data.desc || "暂无描述";

  // "我" 的 6 个字段
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

  nodeMeshes.forEach(m => {
    m.material.opacity = 1;
    m.material.transparent = false;
  });
  edgeLines.forEach(l => {
    l.material.opacity = 0.25;
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
    if (Math.abs(dx) > 50) {
      navigateNode(dx > 0 ? "prev" : "next");
    }
  });
}

function navigateNode(direction) {
  if (!selectedNode) return;

  const currentId = selectedNode.userData.id;
  const connected = edges.filter(e => e.from === currentId || e.to === currentId);
  if (connected.length === 0) return;

  const neighborIds = connected.map(e => e.from === currentId ? e.to : e.from);
  // 找到当前 neighbor 的 index
  const activeNeighbors = neighborIds.filter(id => {
    const m = nodeMeshes.find(m => m.userData.id === id);
    return m && m.material.opacity > 0.5;
  });

  if (activeNeighbors.length === 0) {
    // 如果没高亮（比如刚选中），用第一个
    const first = nodeMeshes.find(m => m.userData.id === neighborIds[0]);
    if (first) selectNode(first);
    return;
  }

  const currentNeighborIdx = activeNeighbors.indexOf(currentId);
  const nextIdx = direction === "next"
    ? (currentNeighborIdx + 1) % neighborIds.length
    : (currentNeighborIdx - 1 + neighborIds.length) % neighborIds.length;

  const nextMesh = nodeMeshes.find(m => m.userData.id === neighborIds[nextIdx]);
  if (nextMesh) selectNode(nextMesh);
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

  // 列表 tab
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
    <div class="list-item" style="animation-delay: ${i * 0.04}s">
      <div class="list-item-header">
        <div class="list-item-icon icon-${item.type}">${item.icon}</div>
        <div class="list-item-title">${item.title}</div>
      </div>
      <div class="list-item-value">${item.value}</div>
      ${item.time ? `<div class="list-item-time">${item.time}</div>` : ""}
    </div>
  `).join("");
}

// ─── 动画循环 ────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  // 平滑相机
  cameraDistance += (targetDistance - cameraDistance) * 0.06;
  cameraAngleX += (targetAngleX - cameraAngleX) * 0.06;
  cameraAngleY += (targetAngleY - cameraAngleY) * 0.06;
  transitionProgress += (targetTransition - transitionProgress) * 0.06;

  // 2D 时取消角度
  if (targetTransition === 1) {
    cameraAngleX *= 0.9;
    cameraAngleY *= 0.9;
  }

  camera.position.x = Math.sin(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
  camera.position.y = Math.sin(cameraAngleX) * cameraDistance;
  camera.position.z = Math.cos(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
  camera.lookAt(0, 0, 0);

  // 节点位置插值：3D ↔ 2D
  nodeMeshes.forEach(mesh => {
    const id = mesh.userData.id;
    const orig = nodeOriginalPos.get(id);
    const target2d = node2DTarget.get(id);

    if (orig && target2d) {
      mesh.position.lerpVectors(orig, target2d, easeInOut(transitionProgress));
    }

    // 呼吸动画（2D 时减弱）
    const breathe = 1 + Math.sin(Date.now() * 0.0018 + mesh.id) * 0.06 * (1 - transitionProgress);
    mesh.scale.setScalar(breathe);

    // 光环保留旋转
    if (mesh.children[0]) mesh.children[0].rotation.z += 0.004;
  });

  // 连线跟随节点
  edgeLines.forEach(line => {
    const fromMesh = nodeMeshes.find(m => m.userData.id === line.userData.fromId);
    const toMesh = nodeMeshes.find(m => m.userData.id === line.userData.toId);
    if (fromMesh && toMesh) {
      line.geometry.setFromPoints([fromMesh.position, toMesh.position]);
    }
  });

  renderer.render(scene, camera);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ─── 启动 ────────────────────────────────────────────────────
init();
