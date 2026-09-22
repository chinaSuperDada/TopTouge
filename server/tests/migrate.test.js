const test = require('node:test')
const assert = require('node:assert')

const { splitStatements } = require('../src/db/migrate')

/**
 * 这组测试是补一个真实踩过的坑：
 * 最初用 `sql.split(';').filter(s => !s.startsWith('--'))` 切分语句，
 * 结果把「注释 + 建表语句」整段扔掉了 —— routes 表根本没建，
 * comments 建外键时报「找不到被引用的表」，报错信息完全指不到真正原因。
 */

test('splitStatements', async (t) => {
  await t.test('注释后的语句不会被丢掉', () => {
    const sql = `
-- 这是一段说明注释
-- 第二行注释
CREATE TABLE foo (id INT);
`
    const st = splitStatements(sql)
    assert.strictEqual(st.length, 1)
    assert.ok(st[0].startsWith('CREATE TABLE foo'))
  })

  await t.test('多条语句按分号切开', () => {
    const st = splitStatements('CREATE TABLE a (id INT);\nCREATE TABLE b (id INT);')
    assert.strictEqual(st.length, 2)
    assert.ok(st[0].includes('a'))
    assert.ok(st[1].includes('b'))
  })

  await t.test('行尾注释被剥掉但不影响语句', () => {
    const st = splitStatements('CREATE TABLE a (id INT); -- 建个表')
    assert.strictEqual(st.length, 1)
    assert.ok(!st[0].includes('建个表'))
    assert.ok(st[0].includes('CREATE TABLE a'))
  })

  await t.test('空片段被过滤', () => {
    assert.deepStrictEqual(splitStatements(';;\n\n  ;'), [])
    assert.deepStrictEqual(splitStatements(''), [])
  })

  await t.test('每张建表语句后面都能被识别（贴近真实文件结构）', () => {
    const sql = `
-- 表一说明
-- 继续说明
CREATE TABLE routes (id BIGINT);

-- 表二说明
CREATE TABLE comments (
  id BIGINT,
  route_id BIGINT,
  CONSTRAINT fk FOREIGN KEY (route_id) REFERENCES routes (id)
) ENGINE=InnoDB;

CREATE TABLE road_conditions (id BIGINT);
`
    const st = splitStatements(sql)
    assert.strictEqual(st.length, 3, `应切出 3 条，实际 ${st.length}`)
    assert.ok(st[0].includes('routes'), '第 1 条应是 routes')
    assert.ok(st[1].includes('comments'), '第 2 条应是 comments')
    assert.ok(st[2].includes('road_conditions'), '第 3 条应是 road_conditions')
  })
})
