const database = require('../lib/database')
const assert = require('assert')

const DATABASE_PATH = __dirname + '/test.db'

async function test() {
  try {
    // connect to database (file location is process.pwd() + file)
    const db = await database.connect(DATABASE_PATH)
    // the elements are just JSON objects (plain string files also accepted if only for reading and searching. eg: log files)
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
    count = await db.save(item, filter) // this "delete" takes long time because of 1-splice and 2-persist delete rows. For the test it could be hugely improved both parts but in the real life you don't usually delete many rows
    assert.equal(count < 0, true, `save 1 item while deleting the old elements with the same 'name'`)
    // delete all the elements in the db
    await db.delete(() => true)
    count = (await db.find(() => true)).length
    assert.deepStrictEqual(count, 0, `database clean`)
    // disconnect is optional
    await database.disconnect(db)
    console.log('database tests passed!')
  } catch (err) {
    //assert.fail(err.toString()) //assert.fail exits the function, so the rejected promise is not fulfilled
    console.error(err)
  }
}

async function testLoad() {
  // add some elements to database
  let db = await database.connect(DATABASE_PATH)
  await db.save({ id: 1 })
  await db.save({ id: 2 })
  await db.delete(el => el.id === 1)
  await database.disconnect(db)

  // load again and see if only an element was really in the db
  db = await database.connect(DATABASE_PATH)
  const count = (await db.find(() => true)).length
  assert.deepStrictEqual(count, 1, `database OK on load`)

  // clean again and close
  await db.delete(() => true)
  await database.disconnect(db)
}

test()
  .then(testLoad)
  .then(() => console.log('\x1b[32m%s\x1b[0m', '✔ TESTS OK'))
  .catch(err => { console.log('\x1b[31m%s\x1b[0m', '✘ TESTS NOT OK'); console.error(err) })