const database = require('../lib/database')
const assert = require('assert')

const DATABASE_PATH = __dirname + '/test.db'

const item = { name: 'juan', age: 31 }
const item2 = { id: 'juan', age: 31 }
let db

async function test() {
  try {
    // connect to database (file location is process.pwd() + file)
    db = await database.connect(DATABASE_PATH)

    //clean db file
    await db.delete(() => true)
    await db._compactDB()

    // perform operations
    await testInsert()
    await testUpsert()
    await testUpdate()
    await testSave()
    await testFind()
    await testFindOne()
    await testExists()
    await testStringItems()
    await testParallelCalls()
    await testCompact()
    await testDelete()

    // disconnect is optional
    await database.disconnect(db)
  } catch (err) {
    console.error(err)
  }
}

async function testInsert() {
  assert(await db.insert(item) > 0, 'Insert should add non-id items')
  assert(await db.insert(item2) > 0, 'Insert should add non duplicated id')
  assert.rejects(async () => await db.insert(item2), 'Insert should throw duplicated id')
}

async function testUpsert() {
  assert(await db.upsert(item) > 0, 'Upsert should add non-id items')
  assert(await db.upsert(item2) === 0, 'Upsert should replace a duplicated id')
}

async function testUpdate() {
  assert(await db.update(item) > 0, 'Update should add non-id items')
  assert(await db.update(item2) === 0, 'Update should replace a duplicated id')
  const newItem = { id: 'pepe' }
  assert.rejects(async () => await db.update(newItem), 'Update should throw if a new element')
}

async function testDelete() {
  // delete 1 element
  assert(await db.delete(el => el.id === item2.id) > 0, 'Delete should remove items')
  // delete all the elements in the db
  await db.delete(() => true)
  const count = (await db.find(() => true)).length
  assert.deepStrictEqual(count, 0, `database clean`)
}

async function testSave() {
  assert(await db.save(item) > 0, 'save should add non-id items')
  assert(await db.save(item2) === 0, 'Upsert should replace a duplicated id')
}

async function testFind() {
  //test generic find
  const filter = el => el.name === item.name
  let results = await db.find(filter)
  assert(results.length > 0, `find returned ${results.length} values`)

  //test find by id
  const id = 'juan'
  results = await db.find(id) //both juan but only one is ID
  assert(results.length == 1, `find by ID returned ${results.length} values`)
}

async function testFindOne() {
  const id = 'juan'
  const obj = await db.findOne(id) //both juan but only one is ID
  assert(obj, `findOne returned ${obj}`)
}

async function testExists() {
  const id = 'juan'
  assert(await db.exists(id), `exists should return true`)
}

async function testStringItems() {
  // plain string files also accepted if only for reading and searching. eg: log files
  assert(await db.save((new Date()).toUTCString() + ' this is a log line '), 'should allow for plain log files')
  const results = await db.find(() => true)
  assert(results.length > 0, `should find and retrieve log files`)
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

  // get() should return the existing database
  let db2 = await database.get(DATABASE_PATH)
  assert.ok(db === db2)

  // clean again and close
  await db.delete(() => true)
  await database.disconnect(db)
}

async function testCompact() {
  const obj = { id: 'ctest', num: 0 }
  const arr = []
  for (let r = 1; r < 10000; r++) { obj.num = r; arr.push(obj) }
  await db.save(arr)
  Promise.all(arr)
  await db.delete(el => el.id === obj.id)
}

async function testParallelCalls() {
  await Promise.all([db.save({ id: 77, name: 'a' }), db.save({ id: 77, name: 'b' }), db.save({ id: 77, name: 'c' })])
  const count = (await db.find(el => el.id === 77)).length
  assert.deepStrictEqual(count, 1, `database OK on parallel calls`)
}

test()
  .then(testLoad)
  .then(() => console.log('\x1b[32m%s\x1b[0m', '✔ TESTS OK'))
  .catch(err => { console.log('\x1b[31m%s\x1b[0m', '✘ TESTS NOT OK'); console.error(err) })