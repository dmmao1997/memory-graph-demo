// ─── 记忆星图 · 3D 交互引擎 ──────────────────────────────────────

const { nodes, edges } = buildGraph();
let scene, camera, renderer, raycaster, mouse;
let nodeMeshes = [], edgeLines = [];
let currentMode = "graph"; // graph | list
let selectedNode = null;
let cameraDistance = 12;
let targetDistance = 12;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragDelta = { x: 0, y: 0 };
let cameraAngleX = 0, cameraAngleY = 0;
let targetAngleX = 0, targetAngleY = 0;
let pinchStart = 0;
let touchStart = { x: 0, y: 0 };
let lastTouch = { x: 0, y: 0 };
let touchStartTime = 0;
let isSwipingDetail = false;

// ─── 初始化 Three.js ──────────────────────────────────────────
function init() {
  const container = document.getElementById("canvas-container");

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a1628, 0.02);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, cameraDistance);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0a1628, 1);
  container.appendChild(renderer.domElement);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // 背景星星
  createStars();

  // 建图
  buildSceneGraph();

  // 事件
  setupEvents();

  // 动画循环
  animate();
}

// ─── 背景星星 ────────────────────────────────────────────────
function createStars() {
  const starGeo = new THREE.BufferGeometry();
  const starCount = 2000;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 200;
    positions[i + 1] = (Math.random() - 0.5) * 200;
    positions[i + 2] = (Math.random() - 0.5) * 200;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.6 });
  scene.add(new THREE.Points(starGeo, starMat));
}

// ─── 建图 ────────────────────────────────────────────────────
function buildSceneGraph() {
  const selfNode = nodes.find(n => n.type === "self");
  const eventNodes = nodes.filter(n => n.type === "event");
  const entityNodes = nodes.filter(n => !["self", "event"].includes(n.type));

  // 布局：我 在中心，事件在内环，实体在外环
  const R_EVENT = 3.5;
  const R_ENTITY = 6;

  // 中心：我
  const selfMesh = createNodeMesh(selfNode, 0.6);
  selfMesh.position.set(0, 0, 0);
  scene.add(selfMesh);
  nodeMeshes.push(selfMesh);

  // 事件环
  eventNodes.forEach((node, i) => {
    const angle = (i / eventNodes.length) * Math.PI * 2;
    const mesh = createNodeMesh(node, 0.4);
    mesh.position.set(
      Math.cos(angle) * R_EVENT,
      (Math.random() - 0.5) * 1.5,
      Math.sin(angle) * R_EVENT
    );
    scene.add(mesh);
    nodeMeshes.push(mesh);
  });

  // 实体环
  entityNodes.forEach((node, i) => {
    const angle = (i / entityNodes.length) * Math.PI * 2 + 0.3;
    const mesh = createNodeMesh(node, 0.3);
    mesh.position.set(
      Math.cos(angle) * R_ENTITY,
      (Math.random() - 0.5) * 3,
      Math.sin(angle) * R_ENTITY
    );
    scene.add(mesh);
    nodeMeshes.push(mesh);
  });

  // 连线
  edges.forEach(edge => {
    const fromMesh = nodeMeshes.find(m => m.userData.id === edge.from);
    const toMesh = nodeMeshes.find(m => m.userData.id === edge.to);
    if (fromMesh && toMesh) {
      const line = createEdgeLine(fromMesh, toMesh, edge.label);
      scene.add(line);
      edgeLines.push(line);
    }
  });
}

// ─── 创建节点 Mesh ──────────────────────────────────────────
function createNodeMesh(node, size) {
  const color = CATEGORIES[node.type]?.color || "#6b7280";
  const geo = new THREE.SphereGeometry(size, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { ...node, baseSize: size };

  // 发光环
  const ringGeo = new THREE.RingGeometry(size * 1.3, size * 1.5, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  mesh.add(ring);

  // 文字标签（用 sprite）
  const sprite = createTextSprite(node.name, color);
  sprite.position.y = size + 0.4;
  mesh.add(sprite);

  return mesh;
}

// ─── 文字 Sprite ────────────────────────────────────────────
function createTextSprite(text, color) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 256;
  canvas.height = 64;

  ctx.font = "bold 28px PingFang SC, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2, 0.5, 1);
  return sprite;
}

// ─── 创建连线 ───────────────────────────────────────────────
function createEdgeLine(fromMesh, toMesh, label) {
  const points = [fromMesh.position.clone(), toMesh.position.clone()];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.3 });
  return new THREE.Line(geo, mat);
}

// ─── 事件绑定 ───────────────────────────────────────────────
function setupEvents() {
  const el = renderer.domElement;

  // 触摸
  el.addEventListener("touchstart", onTouchStart, { passive: false });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd, { passive: false });

  // 鼠标（桌面调试用）
  el.addEventListener("mousedown", onMouseDown);
  el.addEventListener("mousemove", onMouseMove);
  el.addEventListener("mouseup", onMouseUp);
  el.addEventListener("wheel", onWheel);
  el.addEventListener("click", onClick);

  // 窗口
  window.addEventListener("resize", onResize);

  // 详情面板
  document.getElementById("detailClose").addEventListener("click", closeDetail);
  setupDetailSwipe();

  // Toggle
  document.getElementById("toggleWrapper").addEventListener("click", onToggle);

  // 列表 tabs
  document.querySelectorAll(".list-tab").forEach(tab => {
    tab.addEventListener("click", () => onListTab(tab));
  });
}

// ─── 触摸处理 ───────────────────────────────────────────────
function onTouchStart(e) {
  e.preventDefault();
  touchStartTime = Date.now();

  if (e.touches.length === 1) {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    lastTouch = { ...touchStart };
    isDragging = false;
    isSwipingDetail = selectedNode !== null;
  } else if (e.touches.length === 2) {
    // 双指：记录初始距离
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchStart = Math.sqrt(dx * dx + dy * dy);
  }
}

function onTouchMove(e) {
  e.preventDefault();

  if (e.touches.length === 1) {
    const dx = e.touches[0].clientX - lastTouch.x;
    const dy = e.touches[0].clientY - lastTouch.y;
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };

    const totalDx = e.touches[0].clientX - touchStart.x;
    const totalDy = e.touches[0].clientY - touchStart.y;

    if (Math.abs(totalDx) > 5 || Math.abs(totalDy) > 5) {
      isDragging = true;
    }

    if (isSwipingDetail && selectedNode) {
      // 详情模式左右滑：切换相邻节点
      if (Math.abs(dx) > 30) {
        navigateNode(dx > 0 ? "next" : "prev");
        isSwipingDetail = false;
      }
    } else if (!isSwipingDetail) {
      // 全局模式：旋转视角
      targetAngleY += dx * 0.005;
      targetAngleX += dy * 0.005;
      targetAngleX = Math.max(-1.2, Math.min(1.2, targetAngleX));
    }
  } else if (e.touches.length === 2) {
    // 双指缩放
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const delta = pinchStart - dist;
    targetDistance += delta * 0.02;
    targetDistance = Math.max(4, Math.min(20, targetDistance));
    pinchStart = dist;

    // 更新底部滑块
    updateSlider(targetDistance);
  }
}

function onTouchEnd(e) {
  e.preventDefault();

  const tapDuration = Date.now() - touchStartTime;
  const wasDragging = isDragging;
  isDragging = false;

  // 快速轻点 = 选中节点
  if (!wasDragging && tapDuration < 300 && e.changedTouches.length === 1) {
    const touch = e.changedTouches[0];
    checkNodeTap(touch.clientX, touch.clientY);
  }

  // 双指放开
  if (e.touches.length < 2) {
    pinchStart = 0;
  }
}

// ─── 鼠标（桌面调试用） ──────────────────────────────────────
function onMouseDown(e) {
  isDragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
}

function onMouseMove(e) {
  if (isDragging && !selectedNode) {
    targetAngleY += (e.clientX - dragStart.x) * 0.005;
    targetAngleX += (e.clientY - dragStart.y) * 0.005;
    targetAngleX = Math.max(-1.2, Math.min(1.2, targetAngleX));
    dragStart = { x: e.clientX, y: e.clientY };
  }
}

function onMouseUp() {
  isDragging = false;
}

function onWheel(e) {
  targetDistance += e.deltaY * 0.01;
  targetDistance = Math.max(4, Math.min(20, targetDistance));
  updateSlider(targetDistance);
}

function onClick(e) {
  if (!isDragging) {
    checkNodeTap(e.clientX, e.clientY);
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ─── 节点点击检测 ───────────────────────────────────────────
function checkNodeTap(x, y) {
  if (currentMode !== "graph") return;

  mouse.x = (x / window.innerWidth) * 2 - 1;
  mouse.y = -(y / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(nodeMeshes);

  if (intersects.length > 0) {
    const node = intersects[0].object;
    selectNode(node);
  }
}

// ─── 选中节点 ───────────────────────────────────────────────
function selectNode(mesh) {
  selectedNode = mesh;
  const data = mesh.userData;
  const cat = CATEGORIES[data.type];

  // 高亮
  nodeMeshes.forEach(m => {
    m.material.opacity = m === mesh ? 1 : 0.3;
    m.material.transparent = true;
  });

  // 填充面板
  document.getElementById("detailAvatar").textContent = cat.icon;
  document.getElementById("detailAvatar").style.background = cat.color;
  document.getElementById("detailName").textContent = data.name;

  const catEl = document.getElementById("detailCategory");
  catEl.textContent = cat.label;
  catEl.className = `detail-category cat-${data.type}`;
  document.getElementById("detailDesc").textContent = data.desc || "暂无描述";

  // 6 字段（仅"我"显示）
  const fieldsEl = document.getElementById("detailFields");
  if (data.type === "self" && data.fields) {
    fieldsEl.innerHTML = data.fields.map(f => `
      <div class="detail-field">
        <div class="detail-field-label">${f.label}</div>
        <div class="detail-field-value">${f.value}</div>
      </div>
    `).join("");
    fieldsEl.style.display = "flex";
  } else {
    fieldsEl.style.display = "none";
  }

  // 显示面板
  document.getElementById("detailPanel").classList.add("visible");
  document.getElementById("hintText").classList.add("hidden");

  // 相机推近
  const pos = mesh.position;
  targetDistance = Math.max(3, cameraDistance * 0.3);
}

// ─── 关闭详情 ───────────────────────────────────────────────
function closeDetail() {
  selectedNode = null;
  document.getElementById("detailPanel").classList.remove("visible");
  document.getElementById("hintText").classList.remove("hidden");

  // 恢复所有节点
  nodeMeshes.forEach(m => {
    m.material.opacity = 1;
    m.material.transparent = false;
  });

  targetDistance = 12;
  updateSlider(12);
}

// ─── 详情左右滑 ─────────────────────────────────────────────
function setupDetailSwipe() {
  const panel = document.getElementById("detailPanel");
  let startX = 0;

  panel.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
  });

  panel.addEventListener("touchmove", e => {
    e.stopPropagation();
  });

  panel.addEventListener("touchend", e => {
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
  const currentIndex = neighborIds.indexOf(currentId);
  const nextIndex = direction === "next"
    ? (currentIndex + 1) % neighborIds.length
    : (currentIndex - 1 + neighborIds.length) % neighborIds.length;

  const nextMesh = nodeMeshes.find(m => m.userData.id === neighborIds[nextIndex]);
  if (nextMesh) {
    // 平滑过渡
    selectedNode = null;
    selectNode(nextMesh);
  }
}

// ─── Toggle 切换 ────────────────────────────────────────────
function onToggle(e) {
  const clicked = e.target.closest(".toggle-option");
  if (!clicked) return;

  const mode = clicked.dataset.mode;
  if (mode === currentMode) return;

  currentMode = mode;
  document.getElementById("toggleWrapper").dataset.mode = mode;
  document.querySelectorAll(".toggle-option").forEach(t => {
    t.classList.toggle("active", t.dataset.mode === mode);
  });

  if (mode === "list") {
    document.getElementById("listView").classList.add("visible");
    document.getElementById("bottomSlider").classList.add("hidden");
    document.getElementById("legend").classList.add("hidden");
    document.getElementById("hintText").classList.add("hidden");
    closeDetail();
    renderList("basic");
    // 设置第一个 tab active
    document.querySelectorAll(".list-tab").forEach(t => {
      t.classList.toggle("active", t.dataset.tab === "basic");
    });
  } else {
    document.getElementById("listView").classList.remove("visible");
    document.getElementById("bottomSlider").classList.remove("hidden");
    document.getElementById("legend").classList.remove("hidden");
    document.getElementById("hintText").classList.remove("hidden");
  }
}

// ─── 列表渲染 ───────────────────────────────────────────────
function onListTab(tab) {
  document.querySelectorAll(".list-tab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  renderList(tab.dataset.tab);
}

function renderList(tab) {
  const container = document.getElementById("listContent");
  const items = LIST_DATA[tab];

  container.innerHTML = items.map((item, i) => `
    <div class="list-item" style="animation-delay: ${i * 0.05}s">
      <div class="list-item-header">
        <div class="list-item-icon icon-${item.type}">${item.icon}</div>
        <div class="list-item-title">${item.title}</div>
      </div>
      <div class="list-item-value">${item.value}</div>
      ${item.time ? `<div class="list-item-time">${item.time}</div>` : ""}
    </div>
  `).join("");
}

// ─── 底部滑块 ───────────────────────────────────────────────
function updateSlider(distance) {
  const min = 4, max = 20;
  const pct = ((max - distance) / (max - min)) * 100;
  document.getElementById("sliderFill").style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

// ─── 动画循环 ───────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  // 平滑相机
  cameraDistance += (targetDistance - cameraDistance) * 0.08;
  cameraAngleX += (targetAngleX - cameraAngleX) * 0.08;
  cameraAngleY += (targetAngleY - cameraAngleY) * 0.08;

  camera.position.x = Math.sin(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
  camera.position.y = Math.sin(cameraAngleX) * cameraDistance;
  camera.position.z = Math.cos(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
  camera.lookAt(0, 0, 0);

  // 节点动画：呼吸
  nodeMeshes.forEach((mesh, i) => {
    const scale = 1 + Math.sin(Date.now() * 0.002 + i) * 0.08;
    mesh.scale.setScalar(scale);
    mesh.children[0].rotation.z += 0.005; // 环旋转
  });

  renderer.render(scene, camera);
}

// ─── 启动 ───────────────────────────────────────────────────
init();
updateSlider(12);
