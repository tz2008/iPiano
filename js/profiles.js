/* profiles.js — 多儿童档案（纯逻辑，无 DOM，可 Node 单测）
 *
 * 存储结构（localStorage 单键）：
 *   {
 *     version: 2,
 *     activeId: 'p1',
 *     profiles: {
 *       p1: { id, name, avatar, createdAt, data: { ...与旧版 state 完全相同的字段... } }
 *     }
 *   }
 *
 * 旧版（v1）数据没有 profiles 字段，由 migrateLegacy 包成一个默认档案，保证老用户不丢进度。
 */
(function (global) {
  'use strict';

  var STORE_VERSION = 2;
  var AVATARS = ['🐻', '🐰', '🐱', '🐶', '🦊', '🐼', '🐯', '🦁', '🐸', '🐨'];

  function now() { return Date.now(); }

  /** 新档案 ID：递增 + 随机后缀，避免同一毫秒创建冲突 */
  function nextId(store) {
    var n = 1;
    while (store.profiles['p' + n]) n++;
    return 'p' + n;
  }

  function createStore() {
    return { version: STORE_VERSION, activeId: null, profiles: {} };
  }

  /** 判断是否是旧版（v1）裸 state */
  function isLegacy(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.profiles && typeof obj.profiles === 'object') return false;
    return obj.stats !== undefined || obj.courses !== undefined ||
      obj.gamify !== undefined || obj.clef !== undefined;
  }

  /** 是否是新版 store */
  function isStore(obj) {
    return !!(obj && typeof obj === 'object' && obj.profiles && typeof obj.profiles === 'object');
  }

  /** 默认档案名与头像 */
  function defaultName(index) {
    var names = ['小朋友', '第二个小朋友', '第三个小朋友', '第四个小朋友'];
    return names[index] || ('小朋友 ' + (index + 1));
  }

  /**
   * 新增档案。
   * @param data 初始数据（可省略，空对象即可）
   */
  function addProfile(store, opts) {
    opts = opts || {};
    var id = nextId(store);
    var count = Object.keys(store.profiles).length;
    store.profiles[id] = {
      id: id,
      name: (opts.name || '').trim() || defaultName(count),
      avatar: opts.avatar || AVATARS[count % AVATARS.length],
      createdAt: now(),
      data: opts.data || {}
    };
    if (!store.activeId) store.activeId = id;
    return store.profiles[id];
  }

  /** 旧版数据迁移：包成第一个档案 */
  function migrateLegacy(legacy, opts) {
    opts = opts || {};
    var store = createStore();
    var p = addProfile(store, {
      name: opts.name || '小朋友',
      avatar: opts.avatar || AVATARS[0],
      data: legacy || {}
    });
    store.activeId = p.id;
    return store;
  }

  function getActive(store) {
    if (!store || !store.activeId) return null;
    return store.profiles[store.activeId] || null;
  }

  function getProfile(store, id) {
    return (store && store.profiles && store.profiles[id]) || null;
  }

  /** 切换当前档案；返回是否成功 */
  function switchProfile(store, id) {
    if (!getProfile(store, id)) return false;
    store.activeId = id;
    return true;
  }

  function renameProfile(store, id, name) {
    var p = getProfile(store, id);
    if (!p) return false;
    var clean = String(name || '').trim().slice(0, 12);
    if (!clean) return false;
    p.name = clean;
    return true;
  }

  function setAvatar(store, id, avatar) {
    var p = getProfile(store, id);
    if (!p) return false;
    p.avatar = String(avatar || '').slice(0, 4) || p.avatar;
    return true;
  }

  /** 删除档案；最后一个档案不允许删除 */
  function removeProfile(store, id) {
    if (!store || !getProfile(store, id)) return { ok: false, error: '档案不存在' };
    if (Object.keys(store.profiles).length <= 1) {
      return { ok: false, error: '至少要保留一个档案' };
    }
    delete store.profiles[id];
    if (store.activeId === id) {
      store.activeId = Object.keys(store.profiles)[0];
    }
    return { ok: true };
  }

  /** 档案列表（按创建时间排序） */
  function listProfiles(store) {
    if (!store || !store.profiles) return [];
    return Object.keys(store.profiles)
      .map(function (id) { return store.profiles[id]; })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  }

  /** 把 store 里某档案的数据替换为 data（用于保存当前 state） */
  function setProfileData(store, id, data) {
    var p = getProfile(store, id);
    if (!p) return false;
    p.data = data;
    return true;
  }

  /** 档案摘要（用于列表展示） */
  function summary(profile) {
    var d = (profile && profile.data) || {};
    var st = d.stats || {};
    var g = d.gamify || {};
    return {
      id: profile.id,
      name: profile.name,
      avatar: profile.avatar,
      courses: Object.keys(d.courses || {}).length,
      attempts: Number(st.attempts) || 0,
      stars: Number(st.stars) || 0,
      xp: Number(g.xp) || 0,
      badges: Object.keys(g.badges || {}).length
    };
  }

  /** 校验并修复 store 结构（加载时用，避免损坏数据导致崩溃） */
  function sanitize(store) {
    if (!isStore(store)) return null;
    var out = createStore();
    Object.keys(store.profiles).forEach(function (id) {
      var p = store.profiles[id];
      if (!p || typeof p !== 'object') return;
      out.profiles[id] = {
        id: id,
        name: (typeof p.name === 'string' ? p.name.trim().slice(0, 12) : '') || '小朋友',
        avatar: (typeof p.avatar === 'string' ? p.avatar.slice(0, 4) : '') || '🐻',
        createdAt: Number(p.createdAt) || now(),
        data: (p.data && typeof p.data === 'object') ? p.data : {}
      };
    });
    if (!Object.keys(out.profiles).length) return null;
    out.activeId = out.profiles[store.activeId] ? store.activeId : Object.keys(out.profiles)[0];
    return out;
  }

  global.MusicProfiles = {
    STORE_VERSION: STORE_VERSION,
    AVATARS: AVATARS,
    createStore: createStore,
    isLegacy: isLegacy,
    isStore: isStore,
    addProfile: addProfile,
    migrateLegacy: migrateLegacy,
    getActive: getActive,
    getProfile: getProfile,
    switchProfile: switchProfile,
    renameProfile: renameProfile,
    setAvatar: setAvatar,
    removeProfile: removeProfile,
    listProfiles: listProfiles,
    setProfileData: setProfileData,
    summary: summary,
    sanitize: sanitize
  };
})(typeof window !== 'undefined' ? window : globalThis);
