const favoriteRepo = require('../repositories/favoriteRepo')
const routeRepo = require('../repositories/routeRepo')
const { notFound } = require('../errors')

/** 收藏。 */

async function listFavorites(userId, limit) {
  return favoriteRepo.listByUser(userId, limit)
}

async function addFavorite(userId, routeId) {
  const route = await routeRepo.getById(routeId)
  if (!route) throw notFound(`路线 ${routeId} 不存在`)
  await favoriteRepo.add(userId, routeId)
  return { routeId, favorited: true }
}

async function removeFavorite(userId, routeId) {
  await favoriteRepo.remove(userId, routeId)
  return { routeId, favorited: false }
}

async function countFavorites(userId) {
  return favoriteRepo.countByUser(userId)
}

module.exports = { listFavorites, addFavorite, removeFavorite, countFavorites }
