/**
 * 内存数据存储。
 *
 * 数据集小（阶段一就几条路线），用数组 + 自增 id 足够。
 * 所有写操作返回的是拷贝，避免调用方改到 store 内部状态。
 *
 * 后续接数据库时，换掉这一层即可，service 不感知。
 */

const state = {
  routes: [],
  comments: [],
  roadConditions: [],
  counters: { routes: 0, comments: 0, roadConditions: 0 }
}

const nextId = (collection) => {
  state.counters[collection] += 1
  return state.counters[collection]
}

const clone = (v) => JSON.parse(JSON.stringify(v))

const reset = () => {
  state.routes = []
  state.comments = []
  state.roadConditions = []
  state.counters = { routes: 0, comments: 0, roadConditions: 0 }
}

/* ---------------- routes ---------------- */

const routes = {
  all() {
    return clone(state.routes)
  },

  findById(id) {
    const found = state.routes.find((r) => r.id === Number(id))
    return found ? clone(found) : null
  },

  findByUploadedBy(uploadedBy) {
    return clone(state.routes.filter((r) => r.uploadedBy === uploadedBy))
  },

  insert(route) {
    const row = { ...clone(route), id: nextId('routes') }
    state.routes.push(row)
    return clone(row)
  },

  count() {
    return state.routes.length
  }
}

/* ---------------- comments ---------------- */

const comments = {
  /** 某路线下的评论，按时间倒序，最多 limit 条 */
  listByRoute(routeId, limit) {
    return clone(
      state.comments
        .filter((c) => c.routeId === Number(routeId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
    )
  },

  insert(comment) {
    const row = { ...clone(comment), id: nextId('comments') }
    state.comments.push(row)
    return clone(row)
  },

  count() {
    return state.comments.length
  }
}

/* ---------------- roadCondition ---------------- */

const roadConditions = {
  listByRoute(routeId, limit) {
    return clone(
      state.roadConditions
        .filter((c) => c.routeId === Number(routeId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
    )
  },

  insert(roadCondition) {
    const row = { ...clone(roadCondition), id: nextId('roadConditions') }
    state.roadConditions.push(row)
    return clone(row)
  },

  count() {
    return state.roadConditions.length
  }
}

module.exports = { routes, comments, roadConditions, reset, _state: state }
