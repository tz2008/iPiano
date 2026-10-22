// test-profiles.js — 多儿童档案单元测试
// 运行：node js/test-profiles.js
'use strict';
const path = require('path');
const assert = require('assert');
require(path.join(__dirname, 'core.js'));
require(path.join(__dirname, 'profiles.js'));
const P = globalThis.MusicProfiles;

let n = 0;
function t(name, fn) { fn(); n++; console.log('  ✓ ' + name); }

function legacyState() {
  return {
    clef: 'bass', difficulty: 'standard', naming: 'letter', mode: 'name',
    sound: false, theme: 'dark',
    stats: { attempts: 20, correct: 15, firstTry: 12, stars: 18, currentStreak: 2, bestStreak: 5, fullCorrect: 1 },
    courses: { 'baier-01': { done: true, stars: 3 } },
    gamify: { xp: 40, dayStreak: 3, lastDay: '2026-10-21', freezes: 2, tasks: [], prog: {}, badges: { first: 1 } },
    mistakes: { 0: { wrong: 1, total: 2, last: 1, clef: 'treble' } },
    history: { '2026-10-21': { practice: 3 } }
  };
}

/* ---------- 识别 ---------- */
t('识别旧版裸 state', () => {
  assert.ok(P.isLegacy(legacyState()));
  assert.ok(!P.isLegacy(P.createStore()));
  assert.ok(!P.isLegacy(null));
});
t('识别新版 store', () => {
  assert.ok(P.isStore(P.createStore()));
  assert.ok(!P.isStore(legacyState()));
});

/* ---------- 迁移 ---------- */
t('旧数据迁移成一个默认档案', () => {
  const legacy = legacyState();
  const store = P.migrateLegacy(legacy);
  assert.strictEqual(store.version, P.STORE_VERSION);
  const list = P.listProfiles(store);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(store.activeId, list[0].id);
  assert.deepStrictEqual(list[0].data, legacy, '原数据完整保留');
});
t('迁移保留自定义名字与头像', () => {
  const store = P.migrateLegacy(legacyState(), { name: '小明', avatar: '🦊' });
  const p = P.getActive(store);
  assert.strictEqual(p.name, '小明');
  assert.strictEqual(p.avatar, '🦊');
});

/* ---------- 新增 / 列表 ---------- */
t('新增档案：自动编号与默认名', () => {
  const store = P.migrateLegacy(legacyState());
  const p2 = P.addProfile(store, { name: '妹妹' });
  assert.strictEqual(p2.id, 'p2');
  assert.strictEqual(p2.name, '妹妹');
  assert.strictEqual(P.listProfiles(store).length, 2);
});
t('新增档案：空名字用默认名', () => {
  const store = P.createStore();
  const p = P.addProfile(store, {});
  assert.ok(p.name.length > 0);
  assert.strictEqual(store.activeId, p.id, '第一个档案自动激活');
});
t('新增档案：头像不重复（在可用范围内轮换）', () => {
  const store = P.createStore();
  const a = P.addProfile(store, {});
  const b = P.addProfile(store, {});
  assert.notStrictEqual(a.avatar, b.avatar);
});
t('列表按创建时间排序', () => {
  const store = P.createStore();
  const a = P.addProfile(store, { name: 'A' });
  a.createdAt = 1000;
  const b = P.addProfile(store, { name: 'B' });
  b.createdAt = 2000;
  assert.deepStrictEqual(P.listProfiles(store).map(x => x.name), ['A', 'B']);
});

/* ---------- 切换 / 编辑 ---------- */
t('切换档案', () => {
  const store = P.migrateLegacy(legacyState());
  const p2 = P.addProfile(store, { name: '妹妹' });
  assert.ok(P.switchProfile(store, p2.id));
  assert.strictEqual(store.activeId, p2.id);
  assert.strictEqual(P.getActive(store).name, '妹妹');
});
t('切换到不存在的档案失败', () => {
  const store = P.migrateLegacy(legacyState());
  const before = store.activeId;
  assert.ok(!P.switchProfile(store, 'nope'));
  assert.strictEqual(store.activeId, before, '当前档案不变');
});
t('重命名：去空格、限长', () => {
  const store = P.migrateLegacy(legacyState());
  const id = store.activeId;
  assert.ok(P.renameProfile(store, id, '  小明  '));
  assert.strictEqual(P.getProfile(store, id).name, '小明');
  assert.ok(P.renameProfile(store, id, '一二三四五六七八九十十一十二十三'));
  assert.strictEqual(P.getProfile(store, id).name.length, 12);
});
t('重命名：空名字被拒绝', () => {
  const store = P.migrateLegacy(legacyState());
  const id = store.activeId;
  assert.ok(!P.renameProfile(store, id, '   '));
  assert.strictEqual(P.getProfile(store, id).name, '小朋友');
});
t('设置头像', () => {
  const store = P.migrateLegacy(legacyState());
  const id = store.activeId;
  assert.ok(P.setAvatar(store, id, '🐼'));
  assert.strictEqual(P.getProfile(store, id).avatar, '🐼');
});

/* ---------- 删除 ---------- */
t('删除档案：切到剩下的一个', () => {
  const store = P.migrateLegacy(legacyState());
  const p1 = store.activeId;
  const p2 = P.addProfile(store, { name: '妹妹' });
  P.switchProfile(store, p2.id);
  const r = P.removeProfile(store, p2.id);
  assert.ok(r.ok);
  assert.strictEqual(store.activeId, p1, '自动切到剩余档案');
  assert.strictEqual(P.listProfiles(store).length, 1);
});
t('删除最后一个档案被拒绝', () => {
  const store = P.migrateLegacy(legacyState());
  const r = P.removeProfile(store, store.activeId);
  assert.ok(!r.ok);
  assert.ok(r.error.includes('至少'));
  assert.strictEqual(P.listProfiles(store).length, 1);
});
t('删除不存在的档案被拒绝', () => {
  const store = P.migrateLegacy(legacyState());
  assert.ok(!P.removeProfile(store, 'nope').ok);
});

/* ---------- 数据隔离 ---------- */
t('两个档案的数据互不影响', () => {
  const store = P.migrateLegacy(legacyState());
  const p1 = store.activeId;
  const p2 = P.addProfile(store, { name: '妹妹', data: { stats: { attempts: 3 } } });
  P.setProfileData(store, p2.id, { stats: { attempts: 99 } });
  assert.strictEqual(P.getProfile(store, p2.id).data.stats.attempts, 99);
  assert.strictEqual(P.getProfile(store, p1).data.stats.attempts, 20, '另一个档案不受影响');
});
t('setProfileData 对不存在的档案返回 false', () => {
  const store = P.migrateLegacy(legacyState());
  assert.ok(!P.setProfileData(store, 'nope', {}));
});

/* ---------- 摘要 ---------- */
t('档案摘要', () => {
  const store = P.migrateLegacy(legacyState());
  const s = P.summary(P.getActive(store));
  assert.strictEqual(s.courses, 1);
  assert.strictEqual(s.attempts, 20);
  assert.strictEqual(s.xp, 40);
  assert.strictEqual(s.badges, 1);
  assert.ok(s.avatar);
});
t('摘要对空数据安全', () => {
  const s = P.summary({ id: 'p1', name: 'x', data: {} });
  assert.strictEqual(s.courses, 0);
  assert.strictEqual(s.attempts, 0);
});

/* ---------- 校验 ---------- */
t('sanitize 修复损坏字段', () => {
  const store = {
    version: 2,
    activeId: 'p2',
    profiles: {
      p1: { name: 123, avatar: null, data: null },
      p2: { name: '妹妹', avatar: '🐰', createdAt: 5, data: { stats: {} } },
      p3: null
    }
  };
  const clean = P.sanitize(store);
  assert.ok(clean);
  assert.strictEqual(Object.keys(clean.profiles).length, 2, '丢弃损坏条目');
  assert.strictEqual(clean.profiles.p1.name, '小朋友', '非法名字回退');
  assert.deepStrictEqual(clean.profiles.p1.data, {}, '非法 data 回退为空对象');
  assert.strictEqual(clean.activeId, 'p2');
});
t('sanitize 对无效 store 返回 null', () => {
  assert.strictEqual(P.sanitize(null), null);
  assert.strictEqual(P.sanitize({ profiles: {} }), null, '空档案视为无效');
  assert.strictEqual(P.sanitize(legacyState()), null, '旧格式不走 sanitize');
});
t('sanitize 修正不存在的 activeId', () => {
  const clean = P.sanitize({ profiles: { p1: { name: 'A', data: {} } }, activeId: 'zzz' });
  assert.strictEqual(clean.activeId, 'p1');
});

console.log('\ntest-profiles.js: ' + n + ' 项全部通过 ✓');
