const memory = require('../store/memoryStore')
const { createRepo } = require('./createChildRepo')

/** 路况提示数据访问。表结构见 sql/001_init.sql */
module.exports = createRepo('road_conditions', memory.roadConditions, 'roadConditionRepo')
