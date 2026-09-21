const memory = require('../store/memoryStore')
const { createRepo } = require('./createChildRepo')

/** 评论数据访问。表结构见 sql/001_init.sql */
module.exports = createRepo('comments', memory.comments, 'commentRepo')
