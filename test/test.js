const database = require('../lib/database')
const assert = require('assert')

async function test() {
  try {
    // connect to database (file location is process.pwd() + file)
    const db = await database.connect('test.db')
    // the elements are just JSON objects
    const item = { name: 'juan', age: 31 }
    // function to filter data
    const filter = el => el.name === item.name
    // find
    let results = await db.find(filter)
    assert.equal(results.length, 0, `find returned ${results.length} values`)
    // store object
    for (let r = 0; r < 10000; r++) {
      item.length = r
      await db.save(item)
    }
    let count = await db.save(item)
    assert.equal(count, 1, `save 1 item`)
    const items = [item, item, item]
    count = await db.save(items)
    assert.equal(count > 1, true, `save several items`)
    // this time, save but also delete old objects
    item.age = 33
    count = await db.save(item, filter)
    assert.equal(count < 0, true, `save 1 item while deleting the old elements with the same 'name'`)
    // delete all the elements in the db
    await db.delete(() => true)
    count = await db.find(() => true)
    assert.equal(count, 0, `database clean`)
    // disconnect is optional
    database.disconnect(db)
    console.log('database tests passed!')
  } catch (err) {
    assert.fail(err.toString())
  }
}

test()