// ─── Mock 数据：10 个事件 → 实体抽取 ──────────────────────────────

const CATEGORIES = {
  self:   { label: "我",   color: "#00d4aa", icon: "我" },
  person: { label: "人物", color: "#4a9eff", icon: "人" },
  event:  { label: "事件", color: "#ff6b9d", icon: "事" },
  place:  { label: "地点", color: "#ffd166", icon: "地" },
  item:   { label: "物品", color: "#a78bfa", icon: "物" },
  other:  { label: "其他", color: "#6b7280", icon: "他" }
};

// 10 个事件，实体密度不同
const EVENTS = [
  {
    id: "ev1",
    title: "计划云南旅行",
    desc: "和妈妈商量明年春天去云南旅行，正在做攻略",
    date: "2025-01-15",
    entities: [
      { name: "妈妈", type: "person", desc: "母亲，喜欢自然风光和美食" },
      { name: "云南", type: "place", desc: "计划明年春天前往的旅游目的地" },
      { name: "旅行攻略", type: "item", desc: "正在整理的云南旅行计划文档" }
    ]
  },
  {
    id: "ev2",
    title: "换车考虑",
    desc: "觉得现在开的SUV油耗太高，在看新能源车",
    date: "2025-02-03",
    entities: [
      { name: "新能源车", type: "item", desc: "正在考虑购买的替代车型" },
      { name: "油耗", type: "other", desc: "对当前车辆的不满之处" }
    ]
  },
  {
    id: "ev3",
    title: "生日聚餐",
    desc: "上周六和朋友们在海底捞庆祝生日",
    date: "2025-02-08",
    entities: [
      { name: "朋友们", type: "person", desc: "一群经常聚会的好友" },
      { name: "海底捞", type: "place", desc: "生日聚餐的餐厅" },
      { name: "生日蛋糕", type: "item", desc: "巧克力口味的生日蛋糕" }
    ]
  },
  {
    id: "ev4",
    title: "工作会议",
    desc: "参加了产品评审会，讨论了下一季度规划",
    date: "2025-02-10",
    entities: [
      { name: "产品评审会", type: "event", desc: "讨论产品方向的内部会议" },
      { name: "公司", type: "place", desc: "办公地点" }
    ]
  },
  {
    id: "ev5",
    title: "健身计划",
    desc: "办了健身房年卡，目标是增肌减脂",
    date: "2025-02-12",
    entities: [
      { name: "健身房", type: "place", desc: "新办年卡的运动场所" },
      { name: "年卡", type: "item", desc: "刚办理的健身会员卡" },
      { name: "增肌减脂", type: "other", desc: "健身目标" }
    ]
  },
  {
    id: "ev6",
    title: "读书",
    desc: "最近在读《三体》，被宇宙尺度震撼到了",
    date: "2025-02-14",
    entities: [
      { name: "《三体》", type: "item", desc: "正在阅读的刘慈欣科幻小说" },
      { name: "刘慈欣", type: "person", desc: "《三体》的作者" }
    ]
  },
  {
    id: "ev7",
    title: "周末爬山",
    desc: "和同事一起爬了香山，天气很好",
    date: "2025-02-16",
    entities: [
      { name: "同事", type: "person", desc: "一起爬山的同事" },
      { name: "香山", type: "place", desc: "周末爬山的目的地" }
    ]
  },
  {
    id: "ev8",
    title: "买咖啡",
    desc: "在公司楼下的星巴克买了拿铁",
    date: "2025-02-17",
    entities: [
      { name: "星巴克", type: "place", desc: "买咖啡的门店" },
      { name: "拿铁", type: "item", desc: "经常点的咖啡" }
    ]
  },
  {
    id: "ev9",
    title: "宠物",
    desc: "家里养了一只橘猫，最近在打疫苗",
    date: "2025-02-18",
    entities: [
      { name: "橘猫", type: "other", desc: "家里养的宠物猫" },
      { name: "疫苗", type: "item", desc: "宠物定期接种" }
    ]
  },
  {
    id: "ev10",
    title: "学习编程",
    desc: "周末在家学Python，想做个小工具",
    date: "2025-02-20",
    entities: [
      { name: "Python", type: "item", desc: "正在学习的编程语言" },
      { name: "小工具", type: "other", desc: "想做的个人项目" },
      { name: "家", type: "place", desc: "学习的地点" }
    ]
  }
];

// 中心节点：我
const SELF_NODE = {
  id: "self",
  name: "我",
  type: "self",
  desc: "默认中心节点，所有记忆的起点",
  fields: [
    { label: "姓名", value: "Alex" },
    { label: "生日", value: "1995-06-15" },
    { label: "性别", value: "男" },
    { label: "饮食偏好", value: "喜欢川菜，不太能吃海鲜" },
    { label: "性格偏好", value: "INTJ，喜欢独处思考" },
    { label: "用车偏好", value: "偏好SUV，正在考虑换新能源车" }
  ]
};

// 构建图数据结构
function buildGraph() {
  const nodes = [{ ...SELF_NODE }];
  const edges = [];
  const nodeMap = { "我": "self" };

  EVENTS.forEach(ev => {
    // 事件本身也是一个节点
    const eventNode = {
      id: ev.id,
      name: ev.title,
      type: "event",
      desc: ev.desc,
      date: ev.date
    };
    nodes.push(eventNode);
    edges.push({ from: "self", to: ev.id, label: "经历" });

    // 事件的实体
    ev.entities.forEach((ent, i) => {
      const nodeId = `${ev.id}_ent${i}`;
      if (!nodeMap[ent.name]) {
        nodeMap[ent.name] = nodeId;
        nodes.push({
          id: nodeId,
          name: ent.name,
          type: ent.type,
          desc: ent.desc,
          eventId: ev.id
        });
      }
      // 实体连到事件
      edges.push({ from: ev.id, to: nodeMap[ent.name], label: "涉及" });
    });
  });

  return { nodes, edges };
}

// 列表页数据
const LIST_DATA = {
  basic: [
    { icon: "👤", title: "姓名", value: "Alex", type: "self" },
    { icon: "📅", title: "生日", value: "1995年6月15日", type: "self" },
    { icon: "⚧", title: "性别", value: "男", type: "self" }
  ],
  preference: [
    { icon: "🍜", title: "饮食偏好", value: "喜欢川菜，不太能吃海鲜", type: "item" },
    { icon: "🧠", title: "性格偏好", value: "INTJ，喜欢独处思考", type: "other" },
    { icon: "🚗", title: "用车偏好", value: "偏好SUV，正在考虑换新能源车", type: "item" }
  ],
  events: EVENTS.map(ev => ({
    icon: "📌",
    title: ev.title,
    value: ev.desc,
    time: ev.date,
    type: "event"
  }))
};
